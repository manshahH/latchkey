import { ExternalPermanentError, ExternalTransientError } from "@latchkey/core";

export type GitHubFailure = "not_found" | "rate_limited" | "server_error";
export interface Clock {
  now(): Date;
}
export interface TeamTarget {
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

export interface GitHubClient {
  addTeamMember(target: TeamTarget, userId: bigint): void;
  cancelInvitation(target: TeamTarget, userId: bigint): void;
  getOrganizationMembership(organization: string, userId: bigint): boolean;
  getPendingInvitation(target: TeamTarget, userId: bigint): boolean;
  getTeamMembership(target: TeamTarget, userId: bigint): boolean;
  inviteToTeam(target: TeamTarget, userId: bigint): void;
  listTeamMembers(target: TeamTarget): bigint[];
  listUserTeams(organization: string, userId: bigint): string[];
  removeOrganizationMember(organization: string, userId: bigint): void;
  removeTeamMember(target: TeamTarget, userId: bigint): void;
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
