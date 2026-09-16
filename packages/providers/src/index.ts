import { LicenseEventSchema, type LicenseEvent } from "@latchkey/core";
import { z } from "zod";

const TestWebhookSchema = z
  .object({
    id: z.string().min(1),
    occurredAt: z.coerce.date(),
    event: LicenseEventSchema,
    productId: z.string().uuid(),
    externalOrderId: z.string().min(1),
    githubUserId: z.string().regex(/^\d+$/).optional(),
    purchaseEmail: z.string().email().default("buyer@example.com"),
    seats: z.number().int().positive().default(1)
  })
  .strict();
export type VerifiedWebhook = z.infer<typeof TestWebhookSchema>;
export interface ProviderAdapter {
  eventId(event: VerifiedWebhook): string;
  normalize(event: VerifiedWebhook): LicenseEvent;
  verify(raw: string, providedSecret: string, expectedSecret?: string): VerifiedWebhook | null;
}
export const TestProvider: ProviderAdapter = {
  eventId: (event) => event.id,
  normalize: (event) => event.event,
  verify: (raw, providedSecret, expectedSecret = "test-webhook-secret") => {
    if (providedSecret !== expectedSecret) return null;
    try {
      const parsed = TestWebhookSchema.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }
};
