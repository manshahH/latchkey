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

// "other-item" is listed before "widget" on purpose: the build must pick the item by the
// deliverable's configured name, never by its position in the manifest.
const manifest = JSON.stringify({
  items: [
    {
      name: "other-item",
      type: "registry:component",
      files: [{ path: "registry/other.tsx", type: "registry:component" }]
    },
    {
      name: "widget",
      type: "registry:component",
      title: "Widget",
      files: [{ path: "registry/widget.tsx", type: "registry:component" }]
    }
  ]
});

const releasePayload = (tag: string) => ({
  installation: {
    account: { id: 1, login: repoTarget.organization, type: "Organization" },
    id: Number(installationId)
  },
  release: { tag_name: tag },
  repository: { name: repoTarget.repo, owner: { login: repoTarget.organization } },
  sender: { id: 2, login: "seller" }
});

const storage = () => new MemoryArtifactStorage();

const runAvailable = async (
  github: FakeGitHub,
  artifactStorage: MemoryArtifactStorage
): Promise<void> => {
  const tasks = createTaskList({
    sql: database.sql,
    github,
    now: () => now,
    exportStorage: new MemoryExportStorage(),
    artifactStorage
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
  throw new Error("Graphile Worker did not drain registry jobs.");
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
  await database.sql`INSERT INTO products (id, seller_id, name, revoke_policy) VALUES (${product}::uuid, ${seller}::uuid, 'Widget Kit', '{}'::jsonb)`;
  await database.sql`INSERT INTO deliverables (id, product_id, type, config) VALUES (${deliverable}::uuid, ${product}::uuid, 'registry', ${JSON.stringify({ organization: repoTarget.organization, repo: repoTarget.repo, itemName: "widget" })})`;
  await database.sql`INSERT INTO github_installations (installation_id, seller_id, account_login, account_type, account_id, permissions) VALUES (${String(installationId)}::bigint, ${seller}::uuid, ${repoTarget.organization}, 'Organization', 1::bigint, '{"contents":"read"}'::jsonb)`;
});

test("a published release fetches, builds, and stores the named registry item, ignoring the release's other items", async () => {
  const github = new FakeGitHub();
  github.setRepositoryFile(repoTarget, "v1.0.0", "registry.json", manifest);
  github.setRepositoryFile(repoTarget, "v1.0.0", "registry/widget.tsx", "export const Widget = 1;");
  const artifactStorage = storage();

  await storeVerifiedGitHubWebhook(database.sql, {
    action: "published",
    deliveryId: "release-1",
    event: "release",
    now,
    payload: releasePayload("v1.0.0")
  });
  await runAvailable(github, artifactStorage);

  const rows = await database.sql<
    { version: string; s3Key: string; sha256: string }[]
  >`SELECT version, s3_key AS "s3Key", sha256 FROM artifact_versions WHERE deliverable_id = ${deliverable}::uuid`;
  expect(rows).toHaveLength(1);
  expect(rows[0]?.version).toBe("v1.0.0");
  const stored = await artifactStorage.get(rows[0]?.s3Key ?? "");
  expect(stored).not.toBeNull();
  const parsed: unknown = JSON.parse(stored ?? "{}");
  expect(parsed).toMatchObject({
    name: "widget",
    title: "Widget",
    files: [{ path: "registry/widget.tsx", content: "export const Widget = 1;" }]
  });
  expect(await database.sql`SELECT * FROM drift_items`).toHaveLength(0);
}, 120_000);

test("re-publishing the same tag never overwrites the already-stored immutable version, even if the underlying file changed", async () => {
  const github = new FakeGitHub();
  github.setRepositoryFile(repoTarget, "v1.0.0", "registry.json", manifest);
  github.setRepositoryFile(repoTarget, "v1.0.0", "registry/widget.tsx", "export const Widget = 1;");
  const artifactStorage = storage();

  await storeVerifiedGitHubWebhook(database.sql, {
    action: "published",
    deliveryId: "release-2a",
    event: "release",
    now,
    payload: releasePayload("v1.0.0")
  });
  await runAvailable(github, artifactStorage);
  const first = await database.sql<
    { id: string; sha256: string }[]
  >`SELECT id, sha256 FROM artifact_versions WHERE deliverable_id = ${deliverable}::uuid`;
  expect(first).toHaveLength(1);

  // The seller edited the tag's contents after the first publish. The stored version must not move.
  github.setRepositoryFile(
    repoTarget,
    "v1.0.0",
    "registry/widget.tsx",
    "export const Widget = 2; // edited after release"
  );
  await storeVerifiedGitHubWebhook(database.sql, {
    action: "published",
    deliveryId: "release-2b",
    event: "release",
    now,
    payload: releasePayload("v1.0.0")
  });
  await runAvailable(github, artifactStorage);
  const second = await database.sql<
    { id: string; sha256: string }[]
  >`SELECT id, sha256 FROM artifact_versions WHERE deliverable_id = ${deliverable}::uuid`;

  expect(second).toEqual(first);
  const stored = await artifactStorage.get(
    (
      await database.sql<
        { s3Key: string }[]
      >`SELECT s3_key AS "s3Key" FROM artifact_versions WHERE deliverable_id = ${deliverable}::uuid`
    )[0]?.s3Key ?? ""
  );
  expect(stored).toContain("export const Widget = 1;");
  expect(stored).not.toContain("edited after release");
}, 120_000);

test("a missing registry.json records drift and stores nothing", async () => {
  const github = new FakeGitHub();
  const artifactStorage = storage();

  await storeVerifiedGitHubWebhook(database.sql, {
    action: "published",
    deliveryId: "release-3",
    event: "release",
    now,
    payload: releasePayload("v1.0.0")
  });
  await runAvailable(github, artifactStorage);

  expect(await database.sql`SELECT * FROM artifact_versions`).toHaveLength(0);
  expect(await database.sql<{ kind: string }[]>`SELECT kind FROM drift_items`).toEqual([
    { kind: "registry_manifest_missing" }
  ]);
}, 120_000);

test("a file the manifest lists but that fetches as missing records drift naming that file, and stores nothing", async () => {
  const github = new FakeGitHub();
  github.setRepositoryFile(repoTarget, "v1.0.0", "registry.json", manifest);
  const artifactStorage = storage();

  await storeVerifiedGitHubWebhook(database.sql, {
    action: "published",
    deliveryId: "release-4",
    event: "release",
    now,
    payload: releasePayload("v1.0.0")
  });
  await runAvailable(github, artifactStorage);

  expect(await database.sql`SELECT * FROM artifact_versions`).toHaveLength(0);
  const rows = await database.sql<
    { kind: string; details: { path: string } }[]
  >`SELECT kind, details FROM drift_items`;
  expect(rows).toHaveLength(1);
  expect(rows[0]?.kind).toBe("registry_file_missing");
  expect(rows[0]?.details.path).toBe("registry/widget.tsx");
}, 120_000);

test("a draft release (not published) never enqueues a build job", async () => {
  const github = new FakeGitHub();
  const artifactStorage = storage();

  await storeVerifiedGitHubWebhook(database.sql, {
    action: "created",
    deliveryId: "release-5",
    event: "release",
    now,
    payload: releasePayload("v1.0.0")
  });
  await runAvailable(github, artifactStorage);

  expect(await database.sql`SELECT * FROM artifact_versions`).toHaveLength(0);
  expect(await database.sql`SELECT * FROM drift_items`).toHaveLength(0);
}, 120_000);
