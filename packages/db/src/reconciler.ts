import { randomUUID } from "node:crypto";
import type { Sql, TransactionSql } from "postgres";
import { z } from "zod";
import {
  ExternalPermanentError,
  ExternalTransientError,
  planReconcile,
  type ObservedGrantState
} from "@latchkey/core";
import type { GitHubClient, TeamTarget } from "@latchkey/github";
import { enqueueJob } from "./repositories.js";

interface GrantRow {
  id: string;
  seller_id: string;
  desired: "present" | "absent";
  observed: ObservedGrantState;
  provenance: "added_by_us" | "pre_existing" | null;
  github_user_id: string | bigint | null;
  remove_from_org_when_no_grants: boolean;
  invite_sent_at: Date | string | null;
  invite_count: number;
  config: unknown;
  installation_id: string | bigint | null;
  installation_suspended_at: Date | string | null;
  installation_uninstalled_at: Date | string | null;
}

const TeamConfigSchema = z
  .object({ organization: z.string().min(1), teamSlug: z.string().min(1) })
  .strict();
type Queryable = Sql | TransactionSql;
const inviteBudget = 50;
const maxReinvites = 3;
const invitationWatchMs = 6 * 24 * 60 * 60 * 1_000;

const toDate = (value: Date | string): Date => (value instanceof Date ? value : new Date(value));

const recordAttention = async (
  sql: Queryable,
  grant: GrantRow,
  reason: string,
  now: Date
): Promise<void> => {
  await sql`UPDATE grants SET observed = 'needs_attention', next_attempt_at = NULL WHERE id = ${grant.id}::uuid`;
  await sql`INSERT INTO drift_items (id, seller_id, grant_id, kind, details, created_at) VALUES (${randomUUID()}::uuid, ${grant.seller_id}::uuid, ${grant.id}::uuid, 'github_permanent_failure', ${JSON.stringify({ reason })}, ${now.toISOString()})`;
  await sql`INSERT INTO activity_log (id, seller_id, subject_type, subject_id, action, reason, actor, created_at) VALUES (${randomUUID()}::uuid, ${grant.seller_id}::uuid, 'grant', ${grant.id}::uuid, 'needs_attention', ${reason}, 'system', ${now.toISOString()})`;
};

const markQueued = async (sql: Queryable, grant: GrantRow, now: Date): Promise<void> => {
  const nextAttempt = new Date(now.getTime() + 24 * 60 * 60 * 1_000);
  await sql`UPDATE grants SET observed = 'queued', next_attempt_at = ${nextAttempt.toISOString()} WHERE id = ${grant.id}::uuid`;
  await sql`INSERT INTO activity_log (id, seller_id, subject_type, subject_id, action, reason, actor, created_at) VALUES (${randomUUID()}::uuid, ${grant.seller_id}::uuid, 'grant', ${grant.id}::uuid, 'queued', 'GitHub organization invitation budget is full', 'system', ${now.toISOString()})`;
};

const recordAttentionAndNotify = async (
  sql: Queryable,
  grant: GrantRow,
  reason: string,
  now: Date
): Promise<void> => {
  await recordAttention(sql, grant, reason, now);
  await enqueueJob(sql, {
    taskIdentifier: "notify_buyer",
    payload: { grantId: grant.id, reason: "github_invite_expired" },
    jobKey: `notify-buyer:github-invite:${grant.id}`,
    runAt: now
  });
  await enqueueJob(sql, {
    taskIdentifier: "notify_seller",
    payload: { grantId: grant.id, reason: "github_invite_expired" },
    jobKey: `notify-seller:github-invite:${grant.id}`,
    runAt: now
  });
};
/** Reconciliation is idempotent: observe state, then apply only the smallest safe GitHub action. */
export const reconcileStoredGrant = async (
  sql: Sql,
  grantId: string,
  github: GitHubClient,
  now: Date,
  afterGitHubCall?: () => void
): Promise<void> => {
  let grantForFailure: GrantRow | undefined;
  try {
    await sql.begin(async (transaction) => {
      const rows = await transaction<GrantRow[]>`
        SELECT grants.id, licenses.seller_id, grants.desired, grants.observed, grants.provenance,
          users.github_user_id, COALESCE((products.revoke_policy->>'remove_from_org_when_no_grants')::boolean, true) AS remove_from_org_when_no_grants,
          grants.invite_sent_at, grants.invite_count, deliverables.config, installation.installation_id,
          installation.suspended_at AS installation_suspended_at,
          installation.uninstalled_at AS installation_uninstalled_at
        FROM grants
        JOIN seats ON seats.id = grants.seat_id
        JOIN licenses ON licenses.id = seats.license_id
        JOIN products ON products.id = licenses.product_id
        JOIN deliverables ON deliverables.id = grants.deliverable_id
        LEFT JOIN users ON users.id = seats.user_id
        LEFT JOIN LATERAL (
          SELECT installation_id, suspended_at, uninstalled_at
          FROM github_installations
          WHERE seller_id = licenses.seller_id
            AND account_login = deliverables.config->>'organization'
          ORDER BY installed_at DESC
          LIMIT 1
        ) AS installation ON TRUE
        WHERE grants.id = ${grantId}::uuid FOR UPDATE OF grants
      `;
      const grant = rows[0];
      grantForFailure = grant;
      if (grant === undefined) return;
      if (grant.github_user_id === null)
        return recordAttention(transaction, grant, "Buyer has no GitHub identity.", now);
      if (
        grant.installation_id !== null &&
        (grant.installation_suspended_at !== null || grant.installation_uninstalled_at !== null)
      )
        return recordAttention(transaction, grant, "GitHub App installation is paused.", now);
      const githubUserId = BigInt(grant.github_user_id);
      const config = TeamConfigSchema.parse(grant.config);
      const target: TeamTarget = {
        ...config,
        ...(grant.installation_id === null ? {} : { installationId: BigInt(grant.installation_id) })
      };
      const isTeamMember = await github.getTeamMembership(target, githubUserId);
      const hasPendingInvitation = await github.getPendingInvitation(target, githubUserId);
      const isOrgMember = await github.getOrganizationMembership(
        target.organization,
        githubUserId,
        target.installationId
      );
      const observed: ObservedGrantState = isTeamMember
        ? "active"
        : hasPendingInvitation
          ? "invited"
          : "none";
      const otherGrants = await transaction<{ exists: boolean }[]>`
        SELECT EXISTS(
          SELECT 1 FROM grants other_grants
          JOIN seats other_seats ON other_seats.id = other_grants.seat_id
          JOIN deliverables other_deliverables ON other_deliverables.id = other_grants.deliverable_id
          WHERE other_grants.id <> ${grant.id}::uuid
            AND other_seats.user_id = (SELECT user_id FROM seats WHERE id = (SELECT seat_id FROM grants WHERE id = ${grant.id}::uuid))
            AND other_grants.desired = 'present'
            AND other_deliverables.config->>'organization' = ${target.organization}
        ) AS exists
      `;
      const managedRows = await transaction<{ team_slug: string }[]>`
        SELECT DISTINCT config->>'teamSlug' AS team_slug FROM deliverables
        JOIN products ON products.id = deliverables.product_id
        WHERE products.seller_id = ${grant.seller_id}::uuid
          AND deliverables.config->>'organization' = ${target.organization}
      `;
      const managedTeams = new Set(managedRows.map((row) => row.team_slug));
      const hasUnmanagedTeams = (
        await github.listUserTeams(target.organization, githubUserId, target.installationId)
      ).some((team) => !managedTeams.has(team));
      const inviteSentAt = grant.invite_sent_at === null ? null : toDate(grant.invite_sent_at);
      if (!isTeamMember && grant.invite_count >= maxReinvites + 1)
        return recordAttentionAndNotify(
          transaction,
          grant,
          "GitHub invitation expired too many times.",
          now
        );
      const actions = planReconcile({ desired: grant.desired }, observed, {
        hasOtherPresentGrants: otherGrants[0]?.exists ?? false,
        hasUnmanagedTeams,
        invitationCreatedByUs: grant.provenance === "added_by_us",
        inviteNearExpiry:
          inviteSentAt !== null && now.getTime() - inviteSentAt.getTime() >= invitationWatchMs,
        isOrgMember,
        provenance: grant.provenance ?? "pre_existing",
        removeFromOrgWhenNoGrants: grant.remove_from_org_when_no_grants
      });
      let sentInvitation = false;
      for (const action of actions) {
        if (action.type === "cancel_invite") await github.cancelInvitation(target, githubUserId);
        if (action.type === "invite" || action.type === "reinvite") {
          if (action.type === "reinvite" && grant.invite_count >= maxReinvites + 1)
            return recordAttentionAndNotify(
              transaction,
              grant,
              "GitHub invitation expired too many times.",
              now
            );
          if (target.installationId !== undefined) {
            const sent = await transaction<{ count: string }[]>`
              SELECT COUNT(*)::text AS count FROM github_invite_attempts
              WHERE installation_id = ${String(target.installationId)}::bigint
                AND sent_at > ${new Date(now.getTime() - 24 * 60 * 60 * 1_000).toISOString()}
            `;
            if (Number(sent[0]?.count ?? "0") >= inviteBudget)
              return markQueued(transaction, grant, now);
          }
          await github.inviteToTeam(target, githubUserId);
          sentInvitation = true;
          afterGitHubCall?.();
        }
        if (action.type === "add_team_only") {
          await github.addTeamMember(target, githubUserId);
          afterGitHubCall?.();
        }
        if (action.type === "remove_team") {
          await github.removeTeamMember(target, githubUserId);
          afterGitHubCall?.();
        }
        if (action.type === "remove_org") {
          await github.removeOrganizationMember(
            target.organization,
            githubUserId,
            target.installationId
          );
          afterGitHubCall?.();
        }
        if (action.type === "needs_attention") {
          await recordAttention(transaction, grant, "Grant needs review.", now);
          return;
        }
      }
      if (sentInvitation && target.installationId !== undefined)
        await transaction`INSERT INTO github_invite_attempts (id, installation_id, grant_id, sent_at) VALUES (${randomUUID()}::uuid, ${String(target.installationId)}::bigint, ${grant.id}::uuid, ${now.toISOString()})`;
      const finalState = (await github.getTeamMembership(target, githubUserId))
        ? "active"
        : (await github.getPendingInvitation(target, githubUserId))
          ? "invited"
          : grant.desired === "absent"
            ? "removed"
            : "none";
      await transaction`UPDATE grants SET observed = ${finalState}, provenance = CASE WHEN ${sentInvitation} THEN 'added_by_us' ELSE provenance END, last_reconciled_at = ${now.toISOString()}, attempts = 0, invite_sent_at = CASE WHEN ${sentInvitation} THEN ${now.toISOString()} ELSE invite_sent_at END, invite_count = invite_count + ${sentInvitation ? 1 : 0} WHERE id = ${grant.id}::uuid`;
      await transaction`INSERT INTO activity_log (id, seller_id, subject_type, subject_id, action, reason, actor, created_at) VALUES (${randomUUID()}::uuid, ${grant.seller_id}::uuid, 'grant', ${grant.id}::uuid, ${finalState}, 'reconciled desired state', 'system', ${now.toISOString()})`;
    });
  } catch (error) {
    if (grantForFailure === undefined) throw error;
    if (error instanceof ExternalPermanentError)
      return recordAttention(sql, grantForFailure, error.message, now);
    if (error instanceof ExternalTransientError) {
      const nextAttempt = new Date(now.getTime() + (error.retryAfterMs ?? 1_000));
      await sql`UPDATE grants SET observed = 'error_retrying', attempts = attempts + 1, next_attempt_at = ${nextAttempt.toISOString()} WHERE id = ${grantForFailure.id}::uuid`;
      throw error;
    }
    throw error;
  }
};
