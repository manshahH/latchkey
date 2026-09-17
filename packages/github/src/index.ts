import { createHmac, createSign, timingSafeEqual } from "node:crypto";
import { ExternalPermanentError, ExternalTransientError } from "@latchkey/core";

export type GitHubFailure = "not_found" | "rate_limited" | "server_error";
export interface Clock {
  now(): Date;
}
export interface TeamTarget {
  installationId?: bigint;
  organization: string;
  teamSlug: string;
}
export interface GitHubCall {
  action:
    | "invite_to_team"
    | "add_team_member"
    | "remove_team_member"
    | "remove_organization_member"
    | "get_team_membership"
    | "get_organization_membership"
    | "get_pending_invitation"
    | "cancel_invitation"
    | "list_team_members"
    | "list_user_teams";
  organization: string;
  teamSlug?: string;
  userId: bigint;
  at: Date;
}

type Awaitable<T> = T | Promise<T>;
export interface GitHubClient {
  addTeamMember(target: TeamTarget, userId: bigint): Awaitable<void>;
  cancelInvitation(target: TeamTarget, userId: bigint): Awaitable<void>;
  getOrganizationMembership(
    organization: string,
    userId: bigint,
    installationId?: bigint
  ): Awaitable<boolean>;
  getPendingInvitation(target: TeamTarget, userId: bigint): Awaitable<boolean>;
  getTeamMembership(target: TeamTarget, userId: bigint): Awaitable<boolean>;
  inviteToTeam(target: TeamTarget, userId: bigint): Awaitable<void>;
  listTeamMembers(target: TeamTarget): Awaitable<bigint[]>;
  listUserTeams(organization: string, userId: bigint, installationId?: bigint): Awaitable<string[]>;
  removeOrganizationMember(
    organization: string,
    userId: bigint,
    installationId?: bigint
  ): Awaitable<void>;
  removeTeamMember(target: TeamTarget, userId: bigint): Awaitable<void>;
}

export interface GitHubAppClientOptions {
  appId: number;
  privateKey: string;
  apiBaseUrl?: string;
  fetch?: typeof fetch;
  now?: () => Date;
  random?: () => number;
  maxInstallationConcurrency?: number;
}

interface CachedToken {
  expiresAt: Date;
  token: string;
}
interface InstallationGate {
  active: number;
  waiting: Array<() => void>;
}
interface GitHubUser {
  id: number;
  login: string;
}
interface TeamMembership {
  state: "active" | "pending";
}
interface GitHubInvitation {
  id: number;
  invitee?: { id?: number; login?: string | null } | null;
}

/** GitHub signs raw webhook bytes with sha256. Parse only after this check succeeds. */
export const verifyGitHubWebhookSignature = (
  rawBody: string,
  signature: string,
  webhookSecret: string
): boolean => {
  const expected = `sha256=${createHmac("sha256", webhookSecret).update(rawBody).digest("hex")}`;
  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(signature);
  return (
    expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes)
  );
};
const apiVersion = "2022-11-28";
const tokenRefreshSkewMs = 5 * 60 * 1_000;

const base64url = (value: string): string => Buffer.from(value).toString("base64url");
const safeDate = (value: string): Date => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()))
    throw new ExternalPermanentError("GitHub returned an invalid installation token expiry.");
  return parsed;
};

/** Real GitHub App client. It only accepts numeric identities at the public boundary. */
export class GitHubAppClient implements GitHubClient {
  private readonly apiBaseUrl: string;
  private readonly fetcher: typeof fetch;
  private readonly gates = new Map<bigint, InstallationGate>();
  private readonly logins = new Map<bigint, string>();
  private readonly now: () => Date;
  private readonly random: () => number;
  private readonly tokenCache = new Map<bigint, CachedToken>();

  public constructor(private readonly options: GitHubAppClientOptions) {
    this.apiBaseUrl = options.apiBaseUrl ?? "https://api.github.com";
    this.fetcher = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.random = options.random ?? Math.random;
  }

  public async addTeamMember(target: TeamTarget, userId: bigint): Promise<void> {
    await this.putTeamMembership(target, userId);
  }

  public async cancelInvitation(target: TeamTarget, userId: bigint): Promise<void> {
    const installationId = this.installationId(target);
    const login = await this.loginFor(installationId, userId);
    const invitations = await this.request<GitHubInvitation[]>(installationId, {
      method: "GET",
      path: `/orgs/${encodeURIComponent(target.organization)}/invitations?per_page=100`
    });
    const invitation = invitations.find((candidate) => candidate.invitee?.login === login);
    if (invitation === undefined) return;
    await this.request<undefined>(installationId, {
      method: "DELETE",
      path: `/orgs/${encodeURIComponent(target.organization)}/invitations/${String(invitation.id)}`
    });
  }

  public async getOrganizationChecklist(target: TeamTarget): Promise<OrganizationChecklist> {
    const installationId = this.installationId(target);
    const organization = await this.request<{ created_at?: string; plan?: { name?: string } }>(
      installationId,
      { method: "GET", path: `/orgs/${encodeURIComponent(target.organization)}` }
    );
    return {
      appInstalled: true,
      organizationAgeDays:
        organization.created_at === undefined
          ? null
          : Math.max(
              0,
              Math.floor(
                (this.now().getTime() - safeDate(organization.created_at).getTime()) / 86_400_000
              )
            ),
      planName: organization.plan?.name ?? null,
      privateRepoForkingKnown: false,
      warnings:
        organization.plan?.name === undefined
          ? ["GitHub did not provide organization plan details with the approved App permissions."]
          : []
    };
  }

  public async getOrganizationMembership(
    organization: string,
    userId: bigint,
    installationId?: bigint
  ): Promise<boolean> {
    const resolvedInstallation = installationId ?? this.requireInstallationForUser();
    const login = await this.loginFor(resolvedInstallation, userId);
    const membership = await this.request<TeamMembership | null>(resolvedInstallation, {
      allowNotFound: true,
      method: "GET",
      path: `/orgs/${encodeURIComponent(organization)}/memberships/${encodeURIComponent(login)}`
    });
    return membership?.state === "active";
  }

  public async getPendingInvitation(target: TeamTarget, userId: bigint): Promise<boolean> {
    const installationId = this.installationId(target);
    const login = await this.loginFor(installationId, userId);
    const invitations = await this.request<GitHubInvitation[]>(installationId, {
      method: "GET",
      path: `/orgs/${encodeURIComponent(target.organization)}/invitations?per_page=100`
    });
    return invitations.some((invitation) => invitation.invitee?.login === login);
  }

  public async getTeamMembership(target: TeamTarget, userId: bigint): Promise<boolean> {
    const installationId = this.installationId(target);
    const login = await this.loginFor(installationId, userId);
    const membership = await this.request<TeamMembership | null>(installationId, {
      allowNotFound: true,
      method: "GET",
      path: `/orgs/${encodeURIComponent(target.organization)}/teams/${encodeURIComponent(target.teamSlug)}/memberships/${encodeURIComponent(login)}`
    });
    return membership?.state === "active";
  }

  public async inviteToTeam(target: TeamTarget, userId: bigint): Promise<void> {
    await this.putTeamMembership(target, userId);
  }

  public async listInstallations(): Promise<GitHubInstallation[]> {
    const response = await this.appRequest<GitHubInstallation[]>("/app/installations");
    return response;
  }

  public async listTeamMembers(target: TeamTarget): Promise<bigint[]> {
    const installationId = this.installationId(target);
    const members = await this.request<GitHubUser[]>(installationId, {
      method: "GET",
      path: `/orgs/${encodeURIComponent(target.organization)}/teams/${encodeURIComponent(target.teamSlug)}/members?per_page=100`
    });
    for (const member of members) this.logins.set(BigInt(member.id), member.login);
    return members.map((member) => BigInt(member.id));
  }

  public async listUserTeams(
    organization: string,
    userId: bigint,
    installationId?: bigint
  ): Promise<string[]> {
    const resolvedInstallation = installationId ?? this.requireInstallationForUser();
    const login = await this.loginFor(resolvedInstallation, userId);
    const teams = await this.request<Array<{ slug: string }>>(resolvedInstallation, {
      method: "GET",
      path: `/orgs/${encodeURIComponent(organization)}/memberships/${encodeURIComponent(login)}/teams?per_page=100`
    });
    return teams.map((team) => team.slug);
  }

  public async removeOrganizationMember(
    organization: string,
    userId: bigint,
    installationId?: bigint
  ): Promise<void> {
    const resolvedInstallation = installationId ?? this.requireInstallationForUser();
    const login = await this.loginFor(resolvedInstallation, userId);
    await this.request<undefined>(resolvedInstallation, {
      method: "DELETE",
      path: `/orgs/${encodeURIComponent(organization)}/memberships/${encodeURIComponent(login)}`
    });
  }

  public async removeTeamMember(target: TeamTarget, userId: bigint): Promise<void> {
    const installationId = this.installationId(target);
    const login = await this.loginFor(installationId, userId);
    await this.request<undefined>(installationId, {
      method: "DELETE",
      path: `/orgs/${encodeURIComponent(target.organization)}/teams/${encodeURIComponent(target.teamSlug)}/memberships/${encodeURIComponent(login)}`
    });
  }

  private async appRequest<T>(path: string): Promise<T> {
    const response = await this.fetcher(`${this.apiBaseUrl}${path}`, {
      headers: this.headers(this.createAppJwt())
    });
    return this.parseResponse<T>(response, false);
  }

  private createAppJwt(): string {
    const issuedAt = Math.floor(this.now().getTime() / 1_000) - 30;
    const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = base64url(
      JSON.stringify({ exp: issuedAt + 9 * 60, iat: issuedAt, iss: String(this.options.appId) })
    );
    const signer = createSign("RSA-SHA256");
    signer.update(`${header}.${payload}`);
    signer.end();
    return `${header}.${payload}.${signer.sign(this.options.privateKey, "base64url")}`;
  }

  private async getInstallationToken(installationId: bigint): Promise<string> {
    const cached = this.tokenCache.get(installationId);
    if (
      cached !== undefined &&
      cached.expiresAt.getTime() - this.now().getTime() > tokenRefreshSkewMs
    )
      return cached.token;
    const response = await this.fetcher(
      `${this.apiBaseUrl}/app/installations/${String(installationId)}/access_tokens`,
      { headers: this.headers(this.createAppJwt()), method: "POST" }
    );
    const body = await this.parseResponse<{ expires_at: string; token: string }>(response, false);
    if (typeof body.token !== "string" || typeof body.expires_at !== "string")
      throw new ExternalPermanentError("GitHub returned an invalid installation token.");
    this.tokenCache.set(installationId, {
      expiresAt: safeDate(body.expires_at),
      token: body.token
    });
    return body.token;
  }

  private headers(token: string): Headers {
    return new Headers({
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "x-github-api-version": apiVersion
    });
  }

  private installationId(target: TeamTarget): bigint {
    if (target.installationId === undefined)
      throw new ExternalPermanentError("GitHub installation is not linked to this seller.");
    return target.installationId;
  }

  private async loginFor(installationId: bigint, userId: bigint): Promise<string> {
    const cached = this.logins.get(userId);
    if (cached !== undefined) return cached;
    const user = await this.request<GitHubUser>(installationId, {
      method: "GET",
      path: `/user/${String(userId)}`
    });
    if (BigInt(user.id) !== userId || typeof user.login !== "string")
      throw new ExternalPermanentError("GitHub returned an invalid user identity.");
    this.logins.set(userId, user.login);
    return user.login;
  }

  private async putTeamMembership(target: TeamTarget, userId: bigint): Promise<void> {
    const installationId = this.installationId(target);
    const login = await this.loginFor(installationId, userId);
    await this.request<TeamMembership>(installationId, {
      body: JSON.stringify({ role: "member" }),
      method: "PUT",
      path: `/orgs/${encodeURIComponent(target.organization)}/teams/${encodeURIComponent(target.teamSlug)}/memberships/${encodeURIComponent(login)}`
    });
  }

  private async request<T>(
    installationId: bigint,
    input: { allowNotFound?: boolean; body?: string; method: string; path: string }
  ): Promise<T> {
    return this.withInstallation(installationId, async () => {
      const token = await this.getInstallationToken(installationId);
      const headers = this.headers(token);
      if (input.body !== undefined) headers.set("content-type", "application/json");
      const response = await this.fetcher(`${this.apiBaseUrl}${input.path}`, {
        body: input.body,
        headers,
        method: input.method
      });
      return this.parseResponse<T>(response, input.allowNotFound ?? false);
    });
  }

  private async parseResponse<T>(response: Response, allowNotFound: boolean): Promise<T> {
    if (response.status === 404 && allowNotFound) return null as T;
    if (response.ok) {
      if (response.status === 204) return undefined as T;
      return (await response.json()) as T;
    }
    if (response.status === 429 || response.status >= 500 || this.isRateLimited(response)) {
      const retryAfterMs = this.retryAfterMs(response);
      throw new ExternalTransientError("GitHub is temporarily unavailable.", retryAfterMs);
    }
    throw new ExternalPermanentError("GitHub could not complete this access change.");
  }

  private isRateLimited(response: Response): boolean {
    return response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0";
  }

  private retryAfterMs(response: Response): number {
    const retryAfter = Number(response.headers.get("retry-after"));
    if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.ceil(retryAfter * 1_000);
    const resetSeconds = Number(response.headers.get("x-ratelimit-reset"));
    if (Number.isFinite(resetSeconds) && resetSeconds > 0)
      return Math.max(1_000, resetSeconds * 1_000 - this.now().getTime());
    return 1_000 + Math.floor(this.random() * 1_000);
  }

  private requireInstallationForUser(): bigint {
    throw new ExternalPermanentError("GitHub installation is required for this operation.");
  }

  private async withInstallation<T>(installationId: bigint, work: () => Promise<T>): Promise<T> {
    const gate = this.gates.get(installationId) ?? { active: 0, waiting: [] };
    this.gates.set(installationId, gate);
    const limit = this.options.maxInstallationConcurrency ?? 2;
    if (gate.active >= limit) await new Promise<void>((resolve) => gate.waiting.push(resolve));
    gate.active += 1;
    try {
      return await work();
    } finally {
      gate.active -= 1;
      gate.waiting.shift()?.();
    }
  }
}

export interface GitHubInstallation {
  account: { id: number; login: string; type: string };
  id: number;
  permissions: Record<string, string>;
  suspended_at: string | null;
}
export interface OrganizationChecklist {
  appInstalled: boolean;
  organizationAgeDays: number | null;
  planName: string | null;
  privateRepoForkingKnown: boolean;
  warnings: string[];
}

interface Invitation extends TeamTarget {
  sentAt: Date;
}
interface OrganizationState {
  members: Set<bigint>;
  teams: Map<string, Set<bigint>>;
  invitations: Map<bigint, Invitation>;
}

const invitationLifetimeMs = 7 * 24 * 60 * 60 * 1_000;
const rollingDayMs = 24 * 60 * 60 * 1_000;

/** Stateful contract fake for the organization and team endpoints used by the reconciler. */
export class FakeGitHub implements GitHubClient {
  public readonly calls: GitHubCall[] = [];
  private readonly deletedUsers = new Set<bigint>();
  private readonly failures = new Map<bigint, GitHubFailure[]>();
  private readonly inviteTimes: Date[] = [];
  private readonly logins = new Map<bigint, string>();
  private readonly organizations = new Map<string, OrganizationState>();

  public constructor(
    private readonly clock: Clock = { now: () => new Date(0) },
    private readonly inviteCap = 50
  ) {}

  public failNext(userId: bigint, failure: GitHubFailure, times = 1): void {
    const scheduled = this.failures.get(userId) ?? [];
    this.failures.set(userId, [...scheduled, ...Array.from({ length: times }, () => failure)]);
  }

  public setUser(userId: bigint, login: string): void {
    this.deletedUsers.delete(userId);
    this.logins.set(userId, login);
  }

  public renameUser(userId: bigint, login: string): void {
    if (!this.deletedUsers.has(userId)) this.logins.set(userId, login);
  }

  public deleteUser(userId: bigint): void {
    this.deletedUsers.add(userId);
    for (const state of this.organizations.values()) {
      state.members.delete(userId);
      state.invitations.delete(userId);
      for (const members of state.teams.values()) members.delete(userId);
    }
  }

  public loginFor(userId: bigint): string | undefined {
    return this.logins.get(userId);
  }

  public addOrganizationMember(organization: string, userId: bigint): void {
    this.organization(organization).members.add(userId);
  }

  public acceptInvitation(organization: string, userId: bigint): void {
    const state = this.organization(organization);
    this.expireInvitations(state);
    const invitation = state.invitations.get(userId);
    if (invitation === undefined) return;
    state.invitations.delete(userId);
    state.members.add(userId);
    this.team(state, invitation.teamSlug).add(userId);
  }

  public inviteToTeam(target: TeamTarget, userId: bigint): void {
    this.record("invite_to_team", target, userId);
    this.throwPlannedFailure(userId);
    const state = this.organization(target.organization);
    this.expireInvitations(state);
    if (this.team(state, target.teamSlug).has(userId) || state.invitations.has(userId)) return;
    if (state.members.has(userId)) {
      this.team(state, target.teamSlug).add(userId);
      return;
    }
    this.trimInviteWindow();
    if (this.inviteTimes.length >= this.inviteCap)
      throw new ExternalTransientError("GitHub invitation cap is temporarily exhausted.");
    this.inviteTimes.push(this.clock.now());
    state.invitations.set(userId, { ...target, sentAt: this.clock.now() });
  }

  public addTeamMember(target: TeamTarget, userId: bigint): void {
    this.record("add_team_member", target, userId);
    this.throwPlannedFailure(userId);
    const state = this.organization(target.organization);
    if (!state.members.has(userId)) {
      this.inviteToTeam(target, userId);
      return;
    }
    this.team(state, target.teamSlug).add(userId);
  }

  public removeTeamMember(target: TeamTarget, userId: bigint): void {
    this.record("remove_team_member", target, userId);
    this.throwPlannedFailure(userId);
    this.team(this.organization(target.organization), target.teamSlug).delete(userId);
  }

  public removeOrganizationMember(organization: string, userId: bigint): void {
    this.record("remove_organization_member", { organization }, userId);
    this.throwPlannedFailure(userId);
    const state = this.organization(organization);
    state.members.delete(userId);
    state.invitations.delete(userId);
    for (const members of state.teams.values()) members.delete(userId);
  }

  public cancelInvitation(target: TeamTarget, userId: bigint): void {
    this.record("cancel_invitation", target, userId);
    this.organization(target.organization).invitations.delete(userId);
  }

  public getTeamMembership(target: TeamTarget, userId: bigint): boolean {
    this.record("get_team_membership", target, userId);
    this.throwPlannedFailure(userId);
    return this.team(this.organization(target.organization), target.teamSlug).has(userId);
  }

  public getOrganizationMembership(organization: string, userId: bigint): boolean {
    this.record("get_organization_membership", { organization }, userId);
    this.throwPlannedFailure(userId);
    return this.organization(organization).members.has(userId);
  }

  public getPendingInvitation(target: TeamTarget, userId: bigint): boolean {
    this.record("get_pending_invitation", target, userId);
    this.throwPlannedFailure(userId);
    const state = this.organization(target.organization);
    this.expireInvitations(state);
    return state.invitations.get(userId)?.teamSlug === target.teamSlug;
  }

  public listTeamMembers(target: TeamTarget): bigint[] {
    this.record("list_team_members", target, 0n);
    return [...this.team(this.organization(target.organization), target.teamSlug)];
  }

  public listUserTeams(organization: string, userId: bigint): string[] {
    this.record("list_user_teams", { organization }, userId);
    const state = this.organization(organization);
    return [...state.teams].flatMap(([slug, members]) => (members.has(userId) ? [slug] : []));
  }

  private organization(name: string): OrganizationState {
    let state = this.organizations.get(name);
    if (state === undefined) {
      state = { invitations: new Map(), members: new Set(), teams: new Map() };
      this.organizations.set(name, state);
    }
    return state;
  }

  private team(state: OrganizationState, slug: string): Set<bigint> {
    let members = state.teams.get(slug);
    if (members === undefined) {
      members = new Set();
      state.teams.set(slug, members);
    }
    return members;
  }

  private record(action: GitHubCall["action"], target: Partial<TeamTarget>, userId: bigint): void {
    this.calls.push({
      action,
      at: this.clock.now(),
      organization: target.organization ?? "",
      teamSlug: target.teamSlug,
      userId
    });
  }

  private throwPlannedFailure(userId: bigint): void {
    if (this.deletedUsers.has(userId))
      throw new ExternalPermanentError("GitHub user was not found.");
    const failures = this.failures.get(userId);
    const failure = failures?.shift();
    if (failures !== undefined && failures.length === 0) this.failures.delete(userId);
    if (failure === "not_found") throw new ExternalPermanentError("GitHub user was not found.");
    if (failure === "rate_limited") throw new ExternalTransientError("GitHub rate limit reached.");
    if (failure === "server_error")
      throw new ExternalTransientError("GitHub is temporarily unavailable.");
  }

  private expireInvitations(state: OrganizationState): void {
    const cutoff = this.clock.now().getTime() - invitationLifetimeMs;
    for (const [userId, invitation] of state.invitations)
      if (invitation.sentAt.getTime() <= cutoff) state.invitations.delete(userId);
  }

  private trimInviteWindow(): void {
    const cutoff = this.clock.now().getTime() - rollingDayMs;
    const current = this.inviteTimes.filter((time) => time.getTime() > cutoff);
    this.inviteTimes.splice(0, this.inviteTimes.length, ...current);
  }
}
