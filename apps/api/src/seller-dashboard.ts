import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import {
  getSellerOnboarding,
  listSellerBanners,
  listSellerDrift,
  listSellerLicenses,
  listSellerProducts,
  requireBuyerSession,
  requireSellerRole
} from "@latchkey/db";
import type { Sql } from "postgres";
import { z } from "zod";
const escape = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const page = (title: string, body: string) =>
  `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:system-ui,sans-serif;margin:0;background:#f8fafc;color:#172554}main{max-width:72rem;margin:auto;padding:1rem}header{display:flex;justify-content:space-between;align-items:center;gap:1rem}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem}.card{background:white;border:1px solid #dbeafe;border-radius:.75rem;padding:1rem}.alert{background:#fff7ed;border-color:#fdba74}li{margin:.35rem 0}@media(max-width:600px){.grid{grid-template-columns:1fr}main{padding:.75rem}header{align-items:flex-start;flex-direction:column}}</style></head><body><main>${body}</main></body></html>`;
export const createSellerDashboard = ({ sql, now }: { sql: Sql; now: () => Date }) => {
  const app = new Hono();
  app.get("/dashboard/:sellerId", async (c) => {
    const sellerId = z.string().uuid().parse(c.req.param("sellerId"));
    const userId = await requireBuyerSession(
      sql,
      getCookie(c, "lk_session"),
      undefined,
      now(),
      false
    );
    await requireSellerRole(sql, sellerId, userId, "viewer");
    const [onboarding, banners, products, licenses, drift] = await Promise.all([
      getSellerOnboarding(sql, sellerId),
      listSellerBanners(sql, sellerId),
      listSellerProducts(sql, sellerId),
      listSellerLicenses(sql, sellerId),
      listSellerDrift(sql, sellerId)
    ]);
    const steps = Object.entries(onboarding)
      .filter(([key]) => key !== "ready")
      .map(
        ([key, ready]) =>
          `<li>${ready ? "Done" : "To do"}: ${escape(key.replace(/([A-Z])/g, " $1"))}</li>`
      )
      .join("");
    return c.html(
      page(
        "Seller dashboard",
        `<header><div><h1>Seller dashboard</h1><p>See what needs your attention and keep access working.</p></div><strong>${onboarding.ready ? "Setup complete" : "Setup needs attention"}</strong></header>${banners.map((b) => `<section class="card alert"><strong>${escape(b.kind)}</strong><p>${escape(b.message)}</p></section>`).join("")}<section class="grid"><article class="card"><h2>Setup checklist</h2><ul>${steps}</ul></article><article class="card"><h2>Products</h2><ul>${products.map((p) => `<li>${escape(p.name)}: ${escape(p.status)}</li>`).join("") || "<li>No products yet.</li>"}</ul></article><article class="card"><h2>Open items</h2><p>${String(drift.filter((item) => item.status === "open").length)} need attention.</p></article></section><section class="card"><h2>Recent licenses</h2><ul>${
          licenses
            .slice(0, 10)
            .map((l) => `<li>${escape(l.productName)}: ${escape(l.status)}</li>`)
            .join("") || "<li>No licenses yet.</li>"
        }</ul></section>`
      )
    );
  });
  return app;
};
