import { expect, test } from "vitest";
import { createApi } from "./index.js";
test("rejects unverified webhooks without changing state", async () => { let received = 0; const response = await createApi(() => { received += 1; }).request("/webhooks/test/c", { method:"POST", body:"{}", headers:{"x-webhook-secret":"bad"} }); expect(response.status).toBe(401); expect(received).toBe(0); });
