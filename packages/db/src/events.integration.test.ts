import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { startPostgres, type TestPostgres } from "@latchkey/testing";
import { applyMigrations, createDatabase, getProduct, updateProductStatus } from "./index.js";

let postgres: TestPostgres;
let database: ReturnType<typeof createDatabase>;
const sellerA = "00000000-0000-0000-0000-000000000001";
const sellerB = "00000000-0000-0000-0000-000000000002";
const productA = "00000000-0000-0000-0000-000000000011";

beforeAll(async () => {
  postgres = await startPostgres();
  database = createDatabase(postgres.databaseUrl);
  await applyMigrations(database.sql);
}, 120_000);

afterAll(async () => {
  await database.close();
  await postgres.stop();
});

beforeEach(async () => {
  await database.sql`TRUNCATE products, sellers CASCADE`;
  await database.sql`INSERT INTO sellers (id, slug) VALUES (${sellerA}::uuid, 'seller-a'), (${sellerB}::uuid, 'seller-b')`;
  await database.sql`INSERT INTO products (id, seller_id, name, revoke_policy) VALUES (${productA}::uuid, ${sellerA}::uuid, 'Seller A product', '{}'::jsonb)`;
});

test("seller B cannot read or mutate seller A products while seller A still succeeds", async () => {
  expect(await getProduct(database.sql, sellerB, productA)).toBeNull();
  await expect(
    updateProductStatus(database.sql, sellerB, productA, "archived")
  ).rejects.toMatchObject({
    name: "NotFoundError"
  });
  expect((await getProduct(database.sql, sellerA, productA))?.id).toBe(productA);
  await updateProductStatus(database.sql, sellerA, productA, "archived");
  expect(
    await database.sql<
      { status: string }[]
    >`SELECT status FROM products WHERE id = ${productA}::uuid`
  ).toEqual([{ status: "archived" }]);
}, 120_000);
