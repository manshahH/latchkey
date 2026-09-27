import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { runMigrations, runOnce } from "graphile-worker";
import { applyMigrations, createDatabase, storeVerifiedGitHubWebhook } from "@latchkey/db";
import { MemoryArtifactStorage, MemoryExportStorage } from "@latchkey/delivery";
import { FakeGitHub, type RepositoryTarget } from "@latchkey/github";
import { startPostgres, type TestPostgres } from "@latchkey/testing";
import { createTaskList } from "./index.js";

let postgres: TestPostgres;
let database: ReturnType<typeof createDatabase>;
const now = new Date("2026-09-27T00:00:00Z");
const seller = "00000000-0000-0000-0000-000000000001";
const product = "00000000-0000-0000-0000-000000000011";
const deliverable = "00000000-0000-0000-0000-000000000021";
const installationId = 99n;
const repoTarget: RepositoryTarget = { organization: "seller-org", repo: "widget-kit" };

const releasePayload = (tag: string) => ({
  installation: {
    account: { id: 1, login: repoTarget.organization, type: "Organization" },
    id: Number(installationId)
  },
  release: { tag_name: tag },
  repository: { name: repoTarget.repo, owner: { login: repoTarget.organization } },
  sender: { id: 2, login: "seller" }
});

const runAvailable = async (
  github: FakeGitHub,
  exportStorage: MemoryExportStorage
): Promise<void> => {
  const tasks = createTaskList({
    sql: database.sql,
    github,
    now: () => now,
    exportStorage,
    artifactStorage: new MemoryArtifactStorage()
  });
  for (let index = 0; index < 12; index += 1) {
    const available = await database.sql<{ id: number }[]>`
      SELECT id FROM graphile_worker._private_jobs
      WHERE locked_at IS NULL AND run_at <= now() AND last_error IS NULL
      ORDER BY id LIMIT 1
    `;
    if (available.length === 0) return;
    await runOnce({ connectionString: postgres.databaseUrl, noHandleSignals: true }, tasks);
  }
  throw new Error("Graphile Worker did not drain download jobs.");
};

beforeAll(async () => {
  postgres = await startPostgres();
  database = createDatabase(postgres.databaseUrl);
  await applyMigrations(database.sql);
  await runMigrations({ connectionString: postgres.databaseUrl });
}, 120_000);
afterAll(async () => {
  await database.close();
  await postgres.stop();
});
beforeEach(async () => {
  await database.sql`DELETE FROM graphile_worker._private_jobs`;
  await database.sql`TRUNCATE sellers CASCADE`;
  await database.sql`INSERT INTO sellers (id, slug) VALUES (${seller}::uuid, 'seller')`;
  await database.sql`INSERT INTO products (id, seller_id, name, status, revoke_policy) VALUES (${product}::uuid, ${seller}::uuid, 'Widget Kit', 'active', '{}'::jsonb)`;
  await database.sql`INSERT INTO deliverables (id, product_id, type, config) VALUES (${deliverable}::uuid, ${product}::uuid, 'download', ${JSON.stringify({ organization: repoTarget.organization, repo: repoTarget.repo })})`;
  await database.sql`INSERT INTO github_installations (installation_id, seller_id, account_login, account_type, account_id, permissions) VALUES (${String(installationId)}::bigint, ${seller}::uuid, ${repoTarget.organization}, 'Organization', 1::bigint, '{"contents":"read"}'::jsonb)`;
});

test("a published release fetches and stores the repo's zip, recorded with its sha256", async () => {
  const github = new FakeGitHub();
  const zip = new Uint8Array([80, 75, 3, 4, 1, 2, 3]);
  github.setRepositoryZip(repoTarget, "v1.0.0", zip);
  const storage = new MemoryExportStorage();

  await storeVerifiedGitHubWebhook(database.sql, {
    action: "published",
    deliveryId: "release-download-1",
    event: "release",
    now,
    payload: releasePayload("v1.0.0")
  });
  await runAvailable(github, storage);

  const rows = await database.sql<
    { version: string; s3Key: string; sha256: string }[]
  >`SELECT version, s3_key AS "s3Key", sha256 FROM artifact_versions WHERE deliverable_id = ${deliverable}::uuid`;
  expect(rows).toHaveLength(1);
  expect(rows[0]?.version).toBe("v1.0.0");
  const stored = storage.objects.get(rows[0]?.s3Key ?? "");
  expect(stored?.body).toEqual(zip);
  expect(stored?.contentType).toBe("application/zip");
  expect(await database.sql`SELECT * FROM drift_items`).toHaveLength(0);
}, 120_000);

test("a repo with no zip at that tag records drift and stores nothing", async () => {
  const github = new FakeGitHub();
  const storage = new MemoryExportStorage();

  await storeVerifiedGitHubWebhook(database.sql, {
    action: "published",
    deliveryId: "release-download-2",
    event: "release",
    now,
    payload: releasePayload("v1.0.0")
  });
  await runAvailable(github, storage);

  expect(await database.sql`SELECT * FROM artifact_versions`).toHaveLength(0);
  expect(await database.sql<{ kind: string }[]>`SELECT kind FROM drift_items`).toEqual([
    { kind: "download_zip_missing" }
  ]);
}, 120_000);

test("re-publishing the same tag never re-fetches or overwrites the stored zip", async () => {
  const github = new FakeGitHub();
  github.setRepositoryZip(repoTarget, "v1.0.0", new Uint8Array([1]));
  const storage = new MemoryExportStorage();

  await storeVerifiedGitHubWebhook(database.sql, {
    action: "published",
    deliveryId: "release-download-3a",
    event: "release",
    now,
    payload: releasePayload("v1.0.0")
  });
  await runAvailable(github, storage);
  const first = await database.sql<
    { sha256: string }[]
  >`SELECT sha256 FROM artifact_versions WHERE deliverable_id = ${deliverable}::uuid`;

  github.setRepositoryZip(repoTarget, "v1.0.0", new Uint8Array([2, 2, 2]));
  await storeVerifiedGitHubWebhook(database.sql, {
    action: "published",
    deliveryId: "release-download-3b",
    event: "release",
    now,
    payload: releasePayload("v1.0.0")
  });
  await runAvailable(github, storage);
  const second = await database.sql<
    { sha256: string }[]
  >`SELECT sha256 FROM artifact_versions WHERE deliverable_id = ${deliverable}::uuid`;

  expect(second).toEqual(first);
}, 120_000);
