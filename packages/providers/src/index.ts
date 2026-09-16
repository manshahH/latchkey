import { LicenseEventSchema, type LicenseEvent } from "@latchkey/core";
import { z } from "zod";

const TestWebhookSchema = z.object({
  id: z.string().min(1),
  occurredAt: z.coerce.date(),
  event: LicenseEventSchema
});
export type VerifiedWebhook = z.infer<typeof TestWebhookSchema>;
export interface ProviderAdapter {
  eventId(event: VerifiedWebhook): string;
  normalize(event: VerifiedWebhook): LicenseEvent;
  verify(raw: string, secret: string): VerifiedWebhook | null;
}
export const TestProvider: ProviderAdapter = {
  eventId: (event) => event.id,
  normalize: (event) => event.event,
  verify: (raw, secret) => {
    if (secret !== "test-webhook-secret") return null;
    const parsed = TestWebhookSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  }
};
