import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { afterEach, expect, test } from "vitest";

import { createNodeRequestHandler } from "./server.js";

let server: ReturnType<typeof createServer> | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
});

const listen = async (app: Hono): Promise<string> => {
  server = createServer(createNodeRequestHandler(app, () => new Date("2026-09-23T00:00:00Z")));
  await new Promise<void>((resolve) => server?.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${String(port)}`;
};

test("every Set-Cookie header reaches the real socket, not just the last one (D-034 live bug)", async () => {
  const app = new Hono();
  app.get("/set", (context) => {
    setCookie(context, "lk_session", "session-value", { httpOnly: true, path: "/" });
    setCookie(context, "lk_csrf", "csrf-value", { path: "/" });
    return context.text("ok");
  });

  const base = await listen(app);
  const response = await fetch(`${base}/set`);
  const cookies = response.headers.getSetCookie();

  expect(cookies).toHaveLength(2);
  expect(cookies.some((cookie) => cookie.startsWith("lk_session=session-value"))).toBe(true);
  expect(cookies.some((cookie) => cookie.startsWith("lk_csrf=csrf-value"))).toBe(true);
});

test("a cookie set on the callback response is present on the browser's next real request", async () => {
  const app = new Hono();
  app.get("/auth/github/callback", (context) => {
    setCookie(context, "lk_session", "session-value", { httpOnly: true, path: "/" });
    setCookie(context, "lk_csrf", "csrf-value", { path: "/" });
    return context.redirect("/purchases");
  });
  app.get("/purchases", (context) => {
    const cookie = context.req.header("cookie") ?? "";
    return cookie.includes("lk_session=session-value")
      ? context.json({ signedIn: true })
      : context.json({ error: { code: "auth_error" } }, 401);
  });

  const base = await listen(app);
  const jar: string[] = [];
  const callback = await fetch(`${base}/auth/github/callback`, { redirect: "manual" });
  for (const cookie of callback.headers.getSetCookie()) jar.push(cookie.split(";")[0] ?? "");
  const purchases = await fetch(`${base}/purchases`, { headers: { cookie: jar.join("; ") } });

  expect(purchases.status).toBe(200);
  expect(await purchases.json()).toEqual({ signedIn: true });
});
