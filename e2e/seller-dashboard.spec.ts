import { createServer, type Server } from "node:http";
import { expect, test } from "@playwright/test";
import { runMigrations } from "graphile-worker";
import { createBuyerSession, createDatabase, applyMigrations } from "../packages/db/src/index.js";
import { startPostgres, type TestPostgres } from "@latchkey/testing";
import { createSellerDashboard } from "../apps/api/src/seller-dashboard.js";
let postgres: TestPostgres;
let database: ReturnType<typeof createDatabase>;
let server: Server;
let baseUrl: string;
const now = new Date("2026-09-22T00:00:00Z");
test.beforeAll(async () => {
  postgres = await startPostgres();
  database = createDatabase(postgres.databaseUrl);
  await applyMigrations(database.sql);
  await runMigrations({ connectionString: postgres.databaseUrl });
  const seller = "00000000-0000-0000-0000-000000000001",
    user = "00000000-0000-0000-0000-000000000002",
    product = "00000000-0000-0000-0000-000000000003",
    license = "00000000-0000-0000-0000-000000000004";
  await database.sql`INSERT INTO sellers (id, slug) VALUES (${seller}::uuid, 'demo')`;
  await database.sql`INSERT INTO users (id, github_user_id, github_login) VALUES (${user}::uuid, 99, 'seller')`;
  await database.sql`INSERT INTO seller_members (seller_id, user_id, role) VALUES (${seller}::uuid, ${user}::uuid, 'owner')`;
  await database.sql`INSERT INTO products (id, seller_id, name, status, revoke_policy) VALUES (${product}::uuid, ${seller}::uuid, 'Starter Kit', 'active', '{}'::jsonb)`;
  await database.sql`INSERT INTO licenses (id, seller_id, product_id, status, kind, seats_total, purchased_at) VALUES (${license}::uuid, ${seller}::uuid, ${product}::uuid, 'active', 'one_time', 1, ${now.toISOString()})`;
  const session = await createBuyerSession(
    database.sql,
    { githubUserId: 99n, login: "seller" },
    `session-${"x".repeat(40)}`,
    `csrf-${"x".repeat(40)}`,
    now
  );
  server = createServer(async (request, response) => {
    const result = await createSellerDashboard({ sql: database.sql, now: () => now }).fetch(
      new Request(`http://127.0.0.1${request.url ?? "/"}`, {
        headers: request.headers as HeadersInit
      })
    );
    response.writeHead(result.status, Object.fromEntries(result.headers.entries()));
    response.end(Buffer.from(await result.arrayBuffer()));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  test.info().annotations.push({ type: "session", description: session.token });
}, 120000);
test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await database.close();
  await postgres.stop();
});
test("seller dashboard is clear on mobile and desktop", async ({ page, context }) => {
  const token = test.info().annotations.find((a) => a.type === "session")?.description ?? "";
  await context.addCookies([{ name: "lk_session", value: token, url: baseUrl }]);
  await page.goto(`${baseUrl}/dashboard/00000000-0000-0000-0000-000000000001`);
  await expect(page.getByRole("heading", { name: "Seller dashboard" })).toBeVisible();
  await page.setViewportSize({ width: 400, height: 800 });
  await page.screenshot({ path: "test-results/m6-dashboard-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: "test-results/m6-dashboard-desktop.png", fullPage: true });
});
