import { run, type Runner, type TaskList } from "graphile-worker";
import type { GitHubClient } from "@latchkey/github";
import { processStoredEvent, reconcileStoredGrant } from "@latchkey/db";
import type { Sql } from "postgres";
import { z } from "zod";

export interface WorkerDependencies {
  sql: Sql;
  github: GitHubClient;
  now: () => Date;
  afterGitHubCall?: () => void;
}

const JobPayloadSchema = z
  .object({ externalEventId: z.string().uuid().optional(), grantId: z.string().uuid().optional() })
  .strict();

export const createTaskList = ({
  sql,
  github,
  now,
  afterGitHubCall
}: WorkerDependencies): TaskList => ({
  process_event: async (payload) => {
    await processStoredEvent(sql, JobPayloadSchema.parse(payload).externalEventId ?? "", now());
  },
  reconcile_grant: async (payload) => {
    await reconcileStoredGrant(
      sql,
      JobPayloadSchema.parse(payload).grantId ?? "",
      github,
      now(),
      afterGitHubCall
    );
  }
});

/** Graphile Worker owns retries, crash recovery, locking, and its database schema. */
export const startWorker = async (
  databaseUrl: string,
  dependencies: WorkerDependencies
): Promise<Runner> =>
  run({
    connectionString: databaseUrl,
    concurrency: 2,
    taskList: createTaskList(dependencies)
  });
