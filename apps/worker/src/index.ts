import { createHash } from "node:crypto";

import { run, type Runner, type TaskList } from "graphile-worker";
import { buildRegistryItem, parseRegistryManifest } from "@latchkey/core";
import { claimLinkEmail, type EmailSender } from "@latchkey/email";
import type { ArtifactStorage, ExportStorage } from "@latchkey/delivery";
import type { GitHubClient } from "@latchkey/github";
import {
  artifactVersionExists,
  getDownloadDeliverableConfig,
  getPendingSeatUsernameInvite,
  getPendingSellerExport,
  getRegistryDeliverableConfig,
  markSeatUsernameInviteFailed,
  markSellerExportReady,
  recordArtifactDrift,
  renderSellerExport,
  processStoredEvent,
  processStoredGitHubWebhook,
  reserveEmail,
  reconcileStoredGrant,
  resolveSeatUsernameInvite,
  runAllReconcileSweeps,
  runInviteWatchdog,
  runReconcileSweep,
  storeArtifactVersion
} from "@latchkey/db";
import type { Sql } from "postgres";
import { z } from "zod";

export interface WorkerDependencies {
  sql: Sql;
  github: GitHubClient;
  artifactStorage: ArtifactStorage;
  claimBaseUrl?: string;
  email?: EmailSender;
  exportStorage: ExportStorage;
  now: () => Date;
  afterGitHubCall?: () => void;
}

const JobPayloadSchema = z
  .object({
    deliverableId: z.string().uuid().optional(),
    deliveryId: z.string().uuid().optional(),
    externalEventId: z.string().uuid().optional(),
    grantId: z.string().uuid().optional(),
    installationId: z.string().regex(/^\d+$/).optional(),
    exportId: z.string().uuid().optional(),
    inviteId: z.string().uuid().optional(),
    organization: z.string().min(1).optional(),
    repo: z.string().min(1).optional(),
    tag: z.string().min(1).optional()
  })
  .strict();

export const createTaskList = ({
  sql,
  artifactStorage,
  claimBaseUrl,
  email,
  exportStorage,
  github,
  now,
  afterGitHubCall
}: WorkerDependencies): TaskList => ({
  process_event: async (payload) => {
    const notification = await processStoredEvent(
      sql,
      JobPayloadSchema.parse(payload).externalEventId ?? "",
      now()
    );
    if (notification !== null && email !== undefined && claimBaseUrl !== undefined) {
      const current = now();
      if (
        await reserveEmail(sql, {
          dedupeKey: `claim:${notification.licenseId}`,
          template: "claim_link",
          to: notification.purchaseEmail,
          now: current
        })
      )
        await email.send(
          claimLinkEmail({
            claimUrl: `${claimBaseUrl}/claim/${notification.token}`,
            productName: notification.productName,
            to: notification.purchaseEmail
          })
        );
    }
  },
  reconcile_grant: async (payload) => {
    await reconcileStoredGrant(
      sql,
      JobPayloadSchema.parse(payload).grantId ?? "",
      github,
      now(),
      afterGitHubCall
    );
  },
  process_github_webhook: async (payload) => {
    await processStoredGitHubWebhook(sql, JobPayloadSchema.parse(payload).deliveryId ?? "", now());
  },
  invite_watchdog: async () => {
    await runInviteWatchdog(sql, now());
  },
  reconcile_sweep: async (payload) => {
    const installationId = JobPayloadSchema.parse(payload).installationId;
    if (installationId === undefined) {
      await runAllReconcileSweeps(sql, github, now());
      return;
    }
    await runReconcileSweep(sql, github, BigInt(installationId), now());
  },
  generate_export: async (payload) => {
    const exportId = JobPayloadSchema.parse(payload).exportId ?? "";
    const pending = await getPendingSellerExport(sql, exportId);
    if (pending === null) return;
    const rendered = await renderSellerExport(sql, pending.sellerId, pending.format);
    const key = `exports/${pending.sellerId}/${pending.id}.${pending.format}`;
    await exportStorage.put({ body: rendered.body, contentType: rendered.contentType, key });
    await markSellerExportReady(
      sql,
      pending.id,
      key,
      new Date(now().getTime() + 7 * 24 * 60 * 60 * 1000)
    );
  },
  build_registry_artifacts: async (payload) => {
    const job = JobPayloadSchema.parse(payload);
    const deliverableId = job.deliverableId ?? "";
    const organization = job.organization ?? "";
    const repo = job.repo ?? "";
    const tag = job.tag ?? "";
    const config = await getRegistryDeliverableConfig(sql, deliverableId);
    // The deliverable was deleted or changed type since this job was enqueued. Nothing to build.
    if (config === null) return;
    // Immutable: never re-fetch or re-write an already-recorded version, even with edited content.
    if (await artifactVersionExists(sql, deliverableId, tag)) return;
    const drift = (kind: string, details: Record<string, unknown>) =>
      recordArtifactDrift(sql, config.sellerId, kind, { deliverableId, tag, ...details });
    const manifestRaw = await github.getRepositoryFile(
      { organization, repo },
      "registry.json",
      tag
    );
    if (manifestRaw === null) {
      await drift("registry_manifest_missing", {});
      return;
    }
    const manifest = parseRegistryManifest(manifestRaw);
    if (manifest === null) {
      await drift("registry_manifest_invalid", {});
      return;
    }
    const source = manifest.items.find((item) => item.name === config.itemName);
    if (source === undefined) {
      await drift("registry_item_missing", { itemName: config.itemName });
      return;
    }
    const fileContents = new Map<string, string>();
    for (const file of source.files) {
      const content = await github.getRepositoryFile({ organization, repo }, file.path, tag);
      if (content === null) {
        await drift("registry_file_missing", { path: file.path });
        return;
      }
      fileContents.set(file.path, content);
    }
    const built = buildRegistryItem(source, fileContents);
    if ("error" in built) {
      await drift("registry_file_missing", { path: built.error.path });
      return;
    }
    const body = JSON.stringify(built.item);
    const key = `artifacts/${deliverableId}/${tag}.json`;
    await artifactStorage.put({ body, contentType: "application/json", key });
    await storeArtifactVersion(sql, {
      deliverableId,
      releasedAt: now(),
      s3Key: key,
      sha256: createHash("sha256").update(body).digest("hex"),
      version: tag
    });
  },
  build_download_artifact: async (payload) => {
    const job = JobPayloadSchema.parse(payload);
    const deliverableId = job.deliverableId ?? "";
    const organization = job.organization ?? "";
    const repo = job.repo ?? "";
    const tag = job.tag ?? "";
    const config = await getDownloadDeliverableConfig(sql, deliverableId);
    // The deliverable was deleted or changed type since this job was enqueued. Nothing to build.
    if (config === null) return;
    // Immutable: never re-fetch or re-write an already-recorded version.
    if (await artifactVersionExists(sql, deliverableId, tag)) return;
    const zip = await github.getRepositoryZip({ organization, repo }, tag);
    if (zip === null) {
      await recordArtifactDrift(sql, config.sellerId, "download_zip_missing", {
        deliverableId,
        tag
      });
      return;
    }
    const key = `downloads/${deliverableId}/${tag}.zip`;
    await exportStorage.put({ body: zip, contentType: "application/zip", key });
    await storeArtifactVersion(sql, {
      deliverableId,
      releasedAt: now(),
      s3Key: key,
      sha256: createHash("sha256").update(zip).digest("hex"),
      version: tag
    });
  },
  resolve_seat_username_invite: async (payload) => {
    const inviteId = JobPayloadSchema.parse(payload).inviteId ?? "";
    const invite = await getPendingSeatUsernameInvite(sql, inviteId);
    // Already resolved or failed by an earlier attempt: nothing to do, a retried job is safe.
    if (invite === null) return;
    const githubUserId = await github.resolveUserByLogin(invite.login);
    // A real GitHub outage (ExternalTransientError) throws here and Graphile retries with
    // backoff, the same as every other GitHub call in this worker. A login that simply does not
    // exist is not a system fault, so it does not throw: the manager can just retry with the
    // correct spelling.
    if (githubUserId === null) {
      await markSeatUsernameInviteFailed(sql, inviteId, "github_user_not_found", now());
      return;
    }
    await resolveSeatUsernameInvite(sql, inviteId, githubUserId, invite.login, now());
  },
  notify_buyer: () => Promise.resolve(undefined),
  notify_seller: () => Promise.resolve(undefined)
});

/** Graphile Worker owns retries, crash recovery, locking, and scheduled job execution. */
export const startWorker = async (
  databaseUrl: string,
  dependencies: WorkerDependencies
): Promise<Runner> =>
  run({
    connectionString: databaseUrl,
    concurrency: 2,
    crontab: "0 * * * * invite_watchdog\n15 3 * * * reconcile_sweep",
    taskList: createTaskList(dependencies)
  });
