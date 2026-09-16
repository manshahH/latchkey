import { Hono } from "hono";
import { TestProvider } from "@latchkey/providers";

export const createApi = (onEvent: (body: string) => void) => {
  const app = new Hono();
  app.post("/webhooks/:provider/:connectionId", async (context) => {
    const body = await context.req.text();
    if (context.req.param("provider") !== "test" || TestProvider.verify(body, context.req.header("x-webhook-secret") ?? "") === null) return context.json({ error: { code: "auth_error", message: "Webhook could not be verified." } }, 401);
    onEvent(body);
    return context.json({ received: true });
  });
  return app;
};
