import { run, type Runner, type TaskList } from "graphile-worker";
import { claimLinkEmail, type EmailSender } from "@latchkey/email";
import type { GitHubClient } from "@latchkey/github";
import {
  processStoredEvent,
  processStoredGitHubWebhook,
  reserveEmail,
  reconcileStoredGrant,
  runAllReconcileSweeps,
  runInviteWatchdog,
  runReconcileSweep
} from "@latchkey/db";
import type { Sql } from "postgres";
import { z } from "zod";

export interface WorkerDependencies {
  sql: Sql;
  github: GitHubClient;
  claimBaseUrl?: string;
  email?: EmailSender;
  now: () => Date;
  afterGitHubCall?: () => void;
}

const JobPayloadSchema = z
  .object({
    deliveryId: z.string().uuid().optional(),
    externalEventId: z.string().uuid().optional(),
    grantId: z.string().uuid().optional(),
    installationId: z.string().regex(/^\d+$/).optional()
  })
  .strict();

export const createTaskList = ({
  sql,
  claimBaseUrl,
  email,
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
