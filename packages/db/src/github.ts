import { randomUUID } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";
import { z } from "zod";
import type { GitHubClient, TeamTarget } from "@latchkey/github";
import { enqueueJob } from "./repositories.js";

type Queryable = Sql | TransactionSql;

const InstallationSchema = z.object({
  account: z.object({ id: z.coerce.bigint(), login: z.string().min(1), type: z.string().min(1) }),
  id: z.coerce.bigint()
});
const MembershipPayloadSchema = z.object({
  installation: InstallationSchema,
  member: z.object({ id: z.coerce.bigint() }),
  organization: z.object({ login: z.string().min(1) }),
  team: z.object({ slug: z.string().min(1) })
});
const TeamPayloadSchema = z.object({
  installation: InstallationSchema,
  organization: z.object({ login: z.string().min(1) }),
  team: z.object({ slug: z.string().min(1) })
});
const OrganizationPayloadSchema = z.object({
  installation: InstallationSchema,
  membership: z
    .object({ user: z.object({ id: z.coerce.bigint() }) })
    .nullable()
    .optional(),
  organization: z.object({ login: z.string().min(1) })
});

export interface GitHubWebhookInput {
  action: string | null;
  deliveryId: string;
  event: string;
  now: Date;
  payload: Record<string, unknown>;
}
export interface GitHubInstallationLink {
  accountId: bigint;
  accountLogin: string;
  accountType: string;
  installationId: bigint;
  permissions: Record<string, string>;
  sellerId: string;
}

/** Stores only verified GitHub webhook bodies and atomically schedules their database-only handler. */
export const storeVerifiedGitHubWebhook = async (
  sql: Sql,
  input: GitHubWebhookInput
): Promise<boolean> =>
  sql.begin(async (transaction) => {
    const id = randomUUID();
    const inserted = await transaction<{ id: string }[]>`
      INSERT INTO github_webhook_deliveries (id, delivery_id, event, action, payload, received_at)
      VALUES (${id}::uuid, ${input.deliveryId}, ${input.event}, ${input.action}, ${JSON.stringify(input.payload)}, ${input.now.toISOString()})
      ON CONFLICT (delivery_id) DO NOTHING RETURNING id
    `;
    if (inserted[0] === undefined) return false;
    await enqueueJob(transaction, {
      taskIdentifier: "process_github_webhook",
      payload: { deliveryId: id },
      jobKey: `github-webhook:${input.deliveryId}`,
      runAt: input.now
    });
    return true;
  });

/** The installation callback links an install to the authenticated seller before webhook events can change state. */
export const linkGitHubInstallation = async (
  sql: Sql,
  input: GitHubInstallationLink,
  now: Date
): Promise<void> => {
  await sql`
    INSERT INTO github_installations (
      installation_id, seller_id, account_login, account_type, account_id, permissions, installed_at, updated_at, suspended_at, uninstalled_at
    ) VALUES (
      ${String(input.installationId)}::bigint, ${input.sellerId}::uuid, ${input.accountLogin}, ${input.accountType},
      ${String(input.accountId)}::bigint, ${JSON.stringify(input.permissions)}, ${now.toISOString()}, ${now.toISOString()}, NULL, NULL
    ) ON CONFLICT (installation_id) DO UPDATE SET
      seller_id = EXCLUDED.seller_id,
      account_login = EXCLUDED.account_login,
      account_type = EXCLUDED.account_type,
      account_id = EXCLUDED.account_id,
      permissions = EXCLUDED.permissions,
      updated_at = EXCLUDED.updated_at,
      suspended_at = NULL,
      uninstalled_at = NULL
  `;
};

const activity = async (
  sql: Queryable,
  sellerId: string,
  grantId: string,
  action: string,
  reason: string,
  now: Date
): Promise<void> => {
  await sql`INSERT INTO activity_log (id, seller_id, subject_type, subject_id, action, reason, actor, created_at) VALUES (${randomUUID()}::uuid, ${sellerId}::uuid, 'grant', ${grantId}::uuid, ${action}, ${reason}, 'github_webhook', ${now.toISOString()})`;
};

const processInstallation = async (
  sql: Queryable,
  action: string | null,
  payload: Record<string, unknown>,
  now: Date
): Promise<void> => {
  const installation = z.object({ installation: InstallationSchema }).parse(payload).installation;
  if (action === "deleted")
    await sql`UPDATE github_installations SET uninstalled_at = ${now.toISOString()}, updated_at = ${now.toISOString()} WHERE installation_id = ${String(installation.id)}::bigint`;
  if (action === "suspend")
    await sql`UPDATE github_installations SET suspended_at = ${now.toISOString()}, updated_at = ${now.toISOString()} WHERE installation_id = ${String(installation.id)}::bigint`;
  if (action === "unsuspend") {
    await sql`UPDATE github_installations SET suspended_at = NULL, uninstalled_at = NULL, updated_at = ${now.toISOString()} WHERE installation_id = ${String(installation.id)}::bigint`;
    await enqueueJob(sql, {
      taskIdentifier: "reconcile_sweep",
      payload: { installationId: String(installation.id) },
      jobKey: `reconcile-sweep:${String(installation.id)}`,
      runAt: now
    });
  }
};

/** An organization-level removal also removes every managed team membership for that user. */
const processOrganization = async (
  sql: Queryable,
  action: string | null,
  payload: Record<string, unknown>,
  now: Date
): Promise<void> => {
  if (action !== "member_removed") return;
  const event = OrganizationPayloadSchema.parse(payload);
  const userId = event.membership?.user.id;
  if (userId === undefined) return;
  const grants = await sql<{ id: string; seller_id: string }[]>`
    SELECT grants.id, licenses.seller_id
    FROM grants
    JOIN seats ON seats.id = grants.seat_id
    JOIN users ON users.id = seats.user_id
    JOIN licenses ON licenses.id = seats.license_id
    JOIN deliverables ON deliverables.id = grants.deliverable_id
    JOIN github_installations ON github_installations.seller_id = licenses.seller_id
    WHERE github_installations.installation_id = ${String(event.installation.id)}::bigint
      AND deliverables.config->>'organization' = ${event.organization.login}
      AND users.github_user_id = ${String(userId)}::bigint
  `;
  for (const grant of grants) {
    await sql`UPDATE grants SET observed = 'removed_externally', next_attempt_at = NULL WHERE id = ${grant.id}::uuid`;
    await sql`INSERT INTO drift_items (id, seller_id, grant_id, kind, details, created_at) VALUES (${randomUUID()}::uuid, ${grant.seller_id}::uuid, ${grant.id}::uuid, 'removed_externally', ${JSON.stringify({ organization: event.organization.login, scope: "organization" })}, ${now.toISOString()})`;
    await activity(
      sql,
      grant.seller_id,
      grant.id,
      "removed_externally",
      "GitHub organization membership was removed outside Latchkey",
      now
    );
  }
};
const processMembership = async (
  sql: Queryable,
  action: string | null,
  payload: Record<string, unknown>,
  now: Date
): Promise<void> => {
  const event = MembershipPayloadSchema.parse(payload);
  const grants = await sql<{ id: string; seller_id: string }[]>`
    SELECT grants.id, licenses.seller_id
    FROM grants
    JOIN seats ON seats.id = grants.seat_id
    JOIN users ON users.id = seats.user_id
    JOIN licenses ON licenses.id = seats.license_id
    JOIN deliverables ON deliverables.id = grants.deliverable_id
    JOIN github_installations ON github_installations.seller_id = licenses.seller_id
    WHERE github_installations.installation_id = ${String(event.installation.id)}::bigint
      AND deliverables.config->>'organization' = ${event.organization.login}
      AND deliverables.config->>'teamSlug' = ${event.team.slug}
      AND users.github_user_id = ${String(event.member.id)}::bigint
  `;
  for (const grant of grants) {
    if (action === "added") {
      await sql`UPDATE grants SET observed = 'active', last_reconciled_at = ${now.toISOString()}, next_attempt_at = NULL WHERE id = ${grant.id}::uuid`;
      await activity(
        sql,
        grant.seller_id,
        grant.id,
        "active",
        "GitHub accepted team membership",
        now
      );
    }
    if (action === "removed") {
      await sql`UPDATE grants SET observed = 'removed_externally', next_attempt_at = NULL WHERE id = ${grant.id}::uuid`;
      await sql`INSERT INTO drift_items (id, seller_id, grant_id, kind, details, created_at) VALUES (${randomUUID()}::uuid, ${grant.seller_id}::uuid, ${grant.id}::uuid, 'removed_externally', ${JSON.stringify({ organization: event.organization.login, team: event.team.slug })}, ${now.toISOString()})`;
      await activity(
        sql,
        grant.seller_id,
        grant.id,
        "removed_externally",
        "GitHub team membership was removed outside Latchkey",
        now
      );
    }
  }
};

const processTeam = async (
  sql: Queryable,
  action: string | null,
  payload: Record<string, unknown>,
  now: Date
): Promise<void> => {
  if (action !== "deleted") return;
  const event = TeamPayloadSchema.parse(payload);
  const grants = await sql<{ id: string; seller_id: string }[]>`
    SELECT grants.id, licenses.seller_id
    FROM grants
    JOIN seats ON seats.id = grants.seat_id
    JOIN licenses ON licenses.id = seats.license_id
    JOIN deliverables ON deliverables.id = grants.deliverable_id
    JOIN github_installations ON github_installations.seller_id = licenses.seller_id
    WHERE github_installations.installation_id = ${String(event.installation.id)}::bigint
      AND deliverables.config->>'organization' = ${event.organization.login}
      AND deliverables.config->>'teamSlug' = ${event.team.slug}
  `;
  for (const grant of grants) {
    await sql`UPDATE grants SET observed = 'needs_attention', next_attempt_at = NULL WHERE id = ${grant.id}::uuid`;
    await sql`INSERT INTO drift_items (id, seller_id, grant_id, kind, details, created_at) VALUES (${randomUUID()}::uuid, ${grant.seller_id}::uuid, ${grant.id}::uuid, 'github_team_deleted', ${JSON.stringify({ organization: event.organization.login, team: event.team.slug })}, ${now.toISOString()})`;
    await activity(
      sql,
      grant.seller_id,
      grant.id,
      "needs_attention",
      "GitHub team was deleted",
      now
    );
  }
};

/** Handles stored GitHub events after signature verification. No GitHub API call happens in this path. */
export const processStoredGitHubWebhook = async (
  sql: Sql,
  deliveryId: string,
  now: Date
): Promise<void> => {
  await sql.begin(async (transaction) => {
    const rows = await transaction<
      {
        id: string;
        event: string;
        action: string | null;
        payload: Record<string, unknown>;
        processed_at: Date | null;
      }[]
    >`
      SELECT id, event, action, payload, processed_at FROM github_webhook_deliveries
      WHERE id = ${deliveryId}::uuid FOR UPDATE
    `;
    const delivery = rows[0];
    if (delivery === undefined || delivery.processed_at !== null) return;
    if (delivery.event === "installation")
      await processInstallation(transaction, delivery.action, delivery.payload, now);
    if (delivery.event === "membership")
      await processMembership(transaction, delivery.action, delivery.payload, now);
    if (delivery.event === "team")
      await processTeam(transaction, delivery.action, delivery.payload, now);
    if (delivery.event === "organization")
      await processOrganization(transaction, delivery.action, delivery.payload, now);
    await transaction`UPDATE github_webhook_deliveries SET processed_at = ${now.toISOString()}, process_error = NULL WHERE id = ${delivery.id}::uuid`;
  });
};

/** Hourly watchdog schedules day-six invites and budget-queued grants through Graphile. */
export const runInviteWatchdog = async (sql: Sql, now: Date): Promise<number> => {
  const cutoff = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1_000);
  const grants = await sql<{ id: string }[]>`
    SELECT id FROM grants
    WHERE (observed = 'invited' AND invite_sent_at <= ${cutoff.toISOString()})
       OR (observed = 'queued' AND next_attempt_at <= ${now.toISOString()})
  `;
  for (const grant of grants)
    await enqueueJob(sql, {
      taskIdentifier: "reconcile_grant",
      payload: { grantId: grant.id },
      jobKey: `grant:${grant.id}`,
      runAt: now
    });
  return grants.length;
};

/** Daily sweep records manual team removals as drift and deliberately does not re-add those members. */
export const runReconcileSweep = async (
  sql: Sql,
  github: GitHubClient,
  installationId: bigint,
  now: Date
): Promise<number> => {
  const installations = await sql<
    {
      seller_id: string;
      account_login: string;
      suspended_at: Date | null;
      uninstalled_at: Date | null;
    }[]
  >`
    SELECT seller_id, account_login, suspended_at, uninstalled_at FROM github_installations
    WHERE installation_id = ${String(installationId)}::bigint
  `;
  const installation = installations[0];
  if (
    installation === undefined ||
    installation.suspended_at !== null ||
    installation.uninstalled_at !== null
  )
    return 0;
  const targets = await sql<{ organization: string; team_slug: string }[]>`
    SELECT DISTINCT deliverables.config->>'organization' AS organization, deliverables.config->>'teamSlug' AS team_slug
    FROM deliverables
    JOIN products ON products.id = deliverables.product_id
    WHERE products.seller_id = ${installation.seller_id}::uuid
      AND deliverables.type = 'github_team'
      AND deliverables.config->>'organization' = ${installation.account_login}
  `;
  let drifts = 0;
  for (const row of targets) {
    const target: TeamTarget = {
      installationId,
      organization: row.organization,
      teamSlug: row.team_slug
    };
    const members = new Set(await github.listTeamMembers(target));
    const grants = await sql<{ id: string; seller_id: string; github_user_id: string | bigint }[]>`
      SELECT grants.id, licenses.seller_id, users.github_user_id
      FROM grants
      JOIN seats ON seats.id = grants.seat_id
      JOIN users ON users.id = seats.user_id
      JOIN licenses ON licenses.id = seats.license_id
      JOIN deliverables ON deliverables.id = grants.deliverable_id
      WHERE licenses.seller_id = ${installation.seller_id}::uuid
        AND grants.desired = 'present'
        AND grants.observed = 'active'
        AND deliverables.config->>'organization' = ${row.organization}
        AND deliverables.config->>'teamSlug' = ${row.team_slug}
    `;
    for (const grant of grants) {
      if (members.has(BigInt(grant.github_user_id))) continue;
      await sql`UPDATE grants SET observed = 'removed_externally', next_attempt_at = NULL WHERE id = ${grant.id}::uuid`;
      await sql`INSERT INTO drift_items (id, seller_id, grant_id, kind, details, created_at) VALUES (${randomUUID()}::uuid, ${grant.seller_id}::uuid, ${grant.id}::uuid, 'removed_externally', ${JSON.stringify({ organization: row.organization, team: row.team_slug })}, ${now.toISOString()})`;
      await activity(
        sql,
        grant.seller_id,
        grant.id,
        "removed_externally",
        "GitHub team membership was removed outside Latchkey",
        now
      );
      drifts += 1;
    }
  }
  return drifts;
};
/** Runs the daily sweep for every active installation. */
export const runAllReconcileSweeps = async (
  sql: Sql,
  github: GitHubClient,
  now: Date
): Promise<number> => {
  const installations = await sql<{ installation_id: string | bigint }[]>`
    SELECT installation_id FROM github_installations
    WHERE suspended_at IS NULL AND uninstalled_at IS NULL
  `;
  let drifts = 0;
  for (const installation of installations)
    drifts += await runReconcileSweep(sql, github, BigInt(installation.installation_id), now);
  return drifts;
};
