import { createServer, type Server } from "node:http";

import { expect, test } from "@playwright/test";
import { runMigrations } from "graphile-worker";
import { createBuyerApi } from "../apps/api/src/buyer.js";
import {
  applyMigrations,
  createClaim,
  createDatabase,
  reconcileStoredGrant
} from "../packages/db/src/index.js";
import { FakeGitHub } from "@latchkey/github";
import { startPostgres, type TestPostgres } from "@latchkey/testing";

const now = new Date("2026-09-21T12:00:00Z");
const seller = "00000000-0000-0000-0000-000000000001";
const product = "00000000-0000-0000-0000-000000000011";
const license = "00000000-0000-0000-0000-000000000021";
const seat = "00000000-0000-0000-0000-000000000031";
const deliverable = "00000000-0000-0000-0000-000000000041";
const grant = "00000000-0000-0000-0000-000000000051";
const claimToken = "purchase-claim-token-is-long-enough-for-browser";

let postgres: TestPostgres;
let database: ReturnType<typeof createDatabase>;
let server: Server;
let baseUrl: string;
const github = new FakeGitHub({ now: () => now });

const listen = (serverToListen: Server): Promise<number> =>
  new Promise((resolve) =>
    serverToListen.listen(0, "127.0.0.1", () =>
      resolve((serverToListen.address() as { port: number }).port)
    )
  );

test.beforeAll(async () => {
  postgres = await startPostgres();
  database = createDatabase(postgres.databaseUrl);
  await applyMigrations(database.sql);
  await runMigrations({ connectionString: postgres.databaseUrl });
  await database.sql`INSERT INTO sellers (id, slug) VALUES (${seller}::uuid, 'seller')`;
  await database.sql`INSERT INTO products (id, seller_id, name, status, revoke_policy) VALUES (${product}::uuid, ${seller}::uuid, 'Starter Kit Pro', 'active', '{}'::jsonb)`;
  await database.sql`INSERT INTO deliverables (id, product_id, type, config) VALUES (${deliverable}::uuid, ${product}::uuid, 'github_team', '{"organization":"seller","teamSlug":"buyers"}'::jsonb)`;
  await database.sql`INSERT INTO licenses (id, seller_id, product_id, status, kind, seats_total, purchased_at, purchase_email) VALUES (${license}::uuid, ${seller}::uuid, ${product}::uuid, 'active', 'one_time', 1, ${now.toISOString()}, 'buyer@example.com')`;
  await database.sql`INSERT INTO seats (id, license_id) VALUES (${seat}::uuid, ${license}::uuid)`;
  await database.sql`INSERT INTO grants (id, seat_id, deliverable_id, desired, observed) VALUES (${grant}::uuid, ${seat}::uuid, ${deliverable}::uuid, 'absent', 'none')`;
  await createClaim(database.sql, license, claimToken, now);
  let tokens = 0;
  const app = createBuyerApi({
    baseUrl: "http://127.0.0.1",
    now: () => now,
    oauth: {
      authorizationUrl: (state) => `/auth/github/callback?state=${state}&code=mock`,
      exchange: async () => ({ githubUserId: 101n, login: "buyer", email: "buyer@example.com" })
    },
    secureCookies: false,
    sql: database.sql,
    token: () => `browser-token-${++tokens}-${"x".repeat(40)}`
  });
  server = createServer(async (request, response) => {
    const parts: Buffer[] = [];
    for await (const part of request) parts.push(Buffer.from(part));
    const result = await app.fetch(
      new Request(`http://127.0.0.1${request.url ?? "/"}`, {
        body: parts.length === 0 ? undefined : Buffer.concat(parts),
        headers: request.headers as HeadersInit,
        method: request.method
      })
    );
    const headers = Object.fromEntries(result.headers.entries());
    const setCookies = (
      result.headers as Headers & { getSetCookie?: () => string[] }
    ).getSetCookie?.();
    delete headers["set-cookie"];
    if (setCookies !== undefined) response.setHeader("set-cookie", setCookies);
    response.writeHead(result.status, headers);
    response.end(Buffer.from(await result.arrayBuffer()));
  });
  baseUrl = `http://127.0.0.1:${await listen(server)}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await database.close();
  await postgres.stop();
});

test("paid purchase claim reaches invite sent then active with mocked OAuth and FakeGitHub", async ({
  page
}) => {
  await page.goto(`${baseUrl}/claim/${claimToken}`);
  await expect(page.getByRole("heading", { name: "Get Starter Kit Pro" })).toBeVisible();
  await page.getByRole("link", { name: "Sign in with GitHub" }).click();
  await expect(page.getByRole("heading", { name: "Claim Starter Kit Pro" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm and get access" }).click();
  await expect(page.getByText("Access is on its way.")).toBeVisible();
  github.setUser(101n, "buyer");
  await reconcileStoredGrant(database.sql, grant, github, now);
  await page.reload();
  await expect(page.getByText("Your invite is ready.")).toBeVisible();
  await page.setViewportSize({ width: 400, height: 800 });
  await page.screenshot({ path: "test-results/m5-claim-mobile.png", fullPage: true });
  github.acceptInvitation("seller", 101n);
  await reconcileStoredGrant(database.sql, grant, github, now);
  await page.reload();
  await expect(page.getByText("Your access is active.")).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: "test-results/m5-claim-desktop.png", fullPage: true });
});
