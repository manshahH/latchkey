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

interface GrantRow {
  id: string;
  seller_id: string;
  desired: "present" | "absent";
  observed: ObservedGrantState;
  provenance: "added_by_us" | "pre_existing" | null;
  github_user_id: string | bigint | null;
  remove_from_org_when_no_grants: boolean;
  invite_sent_at: Date | null;
  config: unknown;
}

const TeamConfigSchema = z
  .object({ organization: z.string().min(1), teamSlug: z.string().min(1) })
  .strict();
type Queryable = Sql | TransactionSql;

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

/** Reconciliation is idempotent: observe team and organization state, then apply only the smallest action. */
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
          grants.invite_sent_at, deliverables.config
        FROM grants
        JOIN seats ON seats.id = grants.seat_id
        JOIN licenses ON licenses.id = seats.license_id
        JOIN products ON products.id = licenses.product_id
        JOIN deliverables ON deliverables.id = grants.deliverable_id
        LEFT JOIN users ON users.id = seats.user_id
        WHERE grants.id = ${grantId}::uuid FOR UPDATE OF grants
      `;
      const grant = rows[0];
      grantForFailure = grant;
      if (grant === undefined) return;
      if (grant.github_user_id === null)
        return recordAttention(transaction, grant, "Buyer has no GitHub identity.", now);
      const githubUserId = BigInt(grant.github_user_id);
      const target: TeamTarget = TeamConfigSchema.parse(grant.config);
      const isTeamMember = github.getTeamMembership(target, githubUserId);
      const hasPendingInvitation = github.getPendingInvitation(target, githubUserId);
      const isOrgMember = github.getOrganizationMembership(target.organization, githubUserId);
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
      const hasUnmanagedTeams = github
        .listUserTeams(target.organization, githubUserId)
        .some((team) => !managedTeams.has(team));
      const actions = planReconcile({ desired: grant.desired }, observed, {
        hasOtherPresentGrants: otherGrants[0]?.exists ?? false,
        hasUnmanagedTeams,
        invitationCreatedByUs: grant.provenance === "added_by_us",
        inviteNearExpiry:
          grant.invite_sent_at !== null &&
          now.getTime() - grant.invite_sent_at.getTime() >= 6 * 24 * 60 * 60 * 1_000,
        isOrgMember,
        provenance: grant.provenance ?? "pre_existing",
        removeFromOrgWhenNoGrants: grant.remove_from_org_when_no_grants
      });
      for (const action of actions) {
        if (action.type === "cancel_invite") github.cancelInvitation(target, githubUserId);
        if (action.type === "invite" || action.type === "reinvite") {
          github.inviteToTeam(target, githubUserId);
          afterGitHubCall?.();
        }
        if (action.type === "add_team_only") {
          github.addTeamMember(target, githubUserId);
          afterGitHubCall?.();
        }
        if (action.type === "remove_team") {
          github.removeTeamMember(target, githubUserId);
          afterGitHubCall?.();
        }
        if (action.type === "remove_org") {
          github.removeOrganizationMember(target.organization, githubUserId);
          afterGitHubCall?.();
        }
        if (action.type === "needs_attention") {
          await recordAttention(transaction, grant, "Grant needs review.", now);
          return;
        }
      }
      const finalState = github.getTeamMembership(target, githubUserId)
        ? "active"
        : github.getPendingInvitation(target, githubUserId)
          ? "invited"
          : grant.desired === "absent"
            ? "removed"
            : "none";
      await transaction`UPDATE grants SET observed = ${finalState}, last_reconciled_at = ${now.toISOString()}, attempts = 0, invite_sent_at = CASE WHEN ${finalState} = 'invited' THEN COALESCE(invite_sent_at, ${now.toISOString()}) ELSE invite_sent_at END WHERE id = ${grant.id}::uuid`;
      await transaction`INSERT INTO activity_log (id, seller_id, subject_type, subject_id, action, reason, actor, created_at) VALUES (${randomUUID()}::uuid, ${grant.seller_id}::uuid, 'grant', ${grant.id}::uuid, ${finalState}, 'reconciled desired state', 'system', ${now.toISOString()})`;
    });
  } catch (error) {
    if (grantForFailure === undefined) throw error;
    if (error instanceof ExternalPermanentError)
      return recordAttention(sql, grantForFailure, error.message, now);
    if (error instanceof ExternalTransientError) {
      await sql`UPDATE grants SET observed = 'error_retrying', attempts = attempts + 1, next_attempt_at = ${now.toISOString()} WHERE id = ${grantForFailure.id}::uuid`;
      throw error;
    }
    throw error;
  }
};
