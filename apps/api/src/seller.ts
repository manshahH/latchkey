import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import { z } from "zod";
import { LatchkeyError } from "@latchkey/core";
import {
  archiveSellerProduct,
  createSeller,
  createSellerProduct,
  exportSellerData,
  getSellerOnboarding,
  listSellerBanners,
  listSellerDrift,
  listSellerMembers,
  listSellerLicenses,
  listSellerProducts,
  requireBuyerSession,
  requireSellerRole,
  requestSellerExport,
  resolveSellerDrift,
  sellerLicenseTimeline,
  setManualAccess,
  setSellerMemberRole
} from "@latchkey/db";
import type { Sql } from "postgres";

const id = z.string().uuid();
const body = async (r: Request) => z.record(z.unknown()).parse(await r.json());
const text = (value: unknown, name: string) =>
  z
    .string()
    .min(1)
    .max(500)
    .parse((value as Record<string, unknown>)[name]);
export interface SellerApiOptions {
  sql: Sql;
  now: () => Date;
}
/** Seller mutations share the existing signed-in session and require a CSRF header. */
export const createSellerApi = ({ sql, now }: SellerApiOptions) => {
  const app = new Hono();
  app.onError((error, c) =>
    error instanceof LatchkeyError
      ? c.json(
          { error: { code: error.code, message: error.message } },
          (error.message === "You do not have permission to make this change."
            ? 403
            : error.statusCode) as 401 | 403 | 404 | 409 | 422
        )
      : (() => {
          throw error;
        })()
  );
  const session = async (c: Context, changing = false) =>
    requireBuyerSession(
      sql,
      getCookie(c, "lk_session"),
      changing ? (c.req.header("x-csrf-token") ?? undefined) : undefined,
      now(),
      changing
    );
  app.post("/sellers", async (c) => {
    const userId = await session(c, true);
    const input = await body(c.req.raw);
    return c.json({ id: await createSeller(sql, userId, text(input, "slug"), now()) }, 201);
  });
  app.get("/sellers/:sellerId/onboarding", async (c) => {
    const user = await session(c);
    const sellerId = id.parse(c.req.param("sellerId"));
    await requireSellerRole(sql, sellerId, user, "viewer");
    return c.json(await getSellerOnboarding(sql, sellerId));
  });
  app.get("/sellers/:sellerId/banners", async (c) => {
    const user = await session(c);
    const sellerId = id.parse(c.req.param("sellerId"));
    await requireSellerRole(sql, sellerId, user, "viewer");
    return c.json(await listSellerBanners(sql, sellerId));
  });
  app.get("/sellers/:sellerId/members", async (c) => {
    const user = await session(c);
    const sellerId = id.parse(c.req.param("sellerId"));
    await requireSellerRole(sql, sellerId, user, "viewer");
    return c.json(await listSellerMembers(sql, sellerId));
  });
  app.post("/sellers/:sellerId/members/:userId", async (c) => {
    const user = await session(c, true);
    const sellerId = id.parse(c.req.param("sellerId"));
    await requireSellerRole(sql, sellerId, user, "owner");
    const input = await body(c.req.raw);
    await setSellerMemberRole(
      sql,
      sellerId,
      id.parse(c.req.param("userId")),
      z.enum(["owner", "admin", "viewer"]).parse(input.role),
      user,
      now()
    );
    return c.json({ updated: true });
  });
  app.get("/sellers/:sellerId/products", async (c) => {
    const user = await session(c);
    const sellerId = id.parse(c.req.param("sellerId"));
    await requireSellerRole(sql, sellerId, user, "viewer");
    return c.json(await listSellerProducts(sql, sellerId));
  });
  app.post("/sellers/:sellerId/products", async (c) => {
    const user = await session(c, true);
    const sellerId = id.parse(c.req.param("sellerId"));
    await requireSellerRole(sql, sellerId, user, "admin");
    const input = await body(c.req.raw);
    return c.json(
      {
        id: await createSellerProduct(
          sql,
          sellerId,
          {
            name: text(input, "name"),
            revokePolicy: z.record(z.unknown()).parse(input.revokePolicy ?? {})
          },
          user,
          now()
        )
      },
      201
    );
  });
  app.post("/sellers/:sellerId/products/:productId/archive", async (c) => {
    const user = await session(c, true);
    const sellerId = id.parse(c.req.param("sellerId"));
    await requireSellerRole(sql, sellerId, user, "admin");
    await archiveSellerProduct(sql, sellerId, id.parse(c.req.param("productId")), user, now());
    return c.json({ archived: true });
  });
  app.get("/sellers/:sellerId/licenses", async (c) => {
    const user = await session(c);
    const sellerId = id.parse(c.req.param("sellerId"));
    await requireSellerRole(sql, sellerId, user, "viewer");
    return c.json(await listSellerLicenses(sql, sellerId, c.req.query("status"), c.req.query("q")));
  });
  app.get("/sellers/:sellerId/licenses/:licenseId", async (c) => {
    const user = await session(c);
    const sellerId = id.parse(c.req.param("sellerId"));
    await requireSellerRole(sql, sellerId, user, "viewer");
    return c.json(await sellerLicenseTimeline(sql, sellerId, id.parse(c.req.param("licenseId"))));
  });
  for (const [path, desired] of [
    ["revoke", "absent"],
    ["restore", "present"]
  ] as const)
    app.post(`/sellers/:sellerId/licenses/:licenseId/${path}`, async (c) => {
      const user = await session(c, true);
      const sellerId = id.parse(c.req.param("sellerId"));
      await requireSellerRole(sql, sellerId, user, "admin");
      const input = await body(c.req.raw);
      await setManualAccess(
        sql,
        sellerId,
        id.parse(c.req.param("licenseId")),
        desired,
        text(input, "reason"),
        user,
        now()
      );
      return c.json({ queued: true });
    });
  app.get("/sellers/:sellerId/drift", async (c) => {
    const user = await session(c);
    const sellerId = id.parse(c.req.param("sellerId"));
    await requireSellerRole(sql, sellerId, user, "viewer");
    return c.json(await listSellerDrift(sql, sellerId));
  });
  app.post("/sellers/:sellerId/drift/:driftId/:action", async (c) => {
    const user = await session(c, true);
    const sellerId = id.parse(c.req.param("sellerId"));
    await requireSellerRole(sql, sellerId, user, "admin");
    const action = z.enum(["resolved", "ignored"]).parse(c.req.param("action"));
    await resolveSellerDrift(sql, sellerId, id.parse(c.req.param("driftId")), action, user, now());
    return c.json({ status: action });
  });
  app.get("/sellers/:sellerId/export", async (c) => {
    const user = await session(c);
    const sellerId = id.parse(c.req.param("sellerId"));
    await requireSellerRole(sql, sellerId, user, "viewer");
    return c.json(await exportSellerData(sql, sellerId));
  });
  app.post("/sellers/:sellerId/export", async (c) => {
    const user = await session(c, true);
    const sellerId = id.parse(c.req.param("sellerId"));
    await requireSellerRole(sql, sellerId, user, "viewer");
    await requestSellerExport(sql, sellerId, user, now());
    return c.json({ queued: true }, 202);
  });
  return app;
};
