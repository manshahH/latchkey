import { z } from "zod";

const EventBaseSchema = z
  .object({
    id: z.string().min(1),
    occurredAt: z.coerce.date(),
    receivedAt: z.coerce.date()
  })
  .strict();

export const LicenseKindSchema = z.enum(["one_time", "subscription"]);

export const PaymentSucceededEventSchema = EventBaseSchema.extend({
  type: z.literal("PaymentSucceeded"),
  data: z
    .object({
      kind: LicenseKindSchema,
      updatesUntil: z.coerce.date().nullable().default(null)
    })
    .strict()
});

export const RefundIssuedEventSchema = EventBaseSchema.extend({
  type: z.literal("RefundIssued"),
  data: z.object({ scope: z.enum(["full", "partial"]) }).strict()
});

export const DisputeOpenedEventSchema = EventBaseSchema.extend({
  type: z.literal("DisputeOpened"),
  data: z.object({}).strict()
});

export const DisputeResolvedEventSchema = EventBaseSchema.extend({
  type: z.literal("DisputeResolved"),
  data: z.object({ outcome: z.enum(["won", "lost"]) }).strict()
});

export const SubscriptionActivatedEventSchema = EventBaseSchema.extend({
  type: z.literal("SubscriptionActivated"),
  data: z.object({}).strict()
});

export const SubscriptionRenewedEventSchema = EventBaseSchema.extend({
  type: z.literal("SubscriptionRenewed"),
  data: z.object({ periodEnd: z.coerce.date().nullable().default(null) }).strict()
});

export const SubscriptionPastDueEventSchema = EventBaseSchema.extend({
  type: z.literal("SubscriptionPastDue"),
  data: z.object({}).strict()
});

export const SubscriptionCanceledEventSchema = EventBaseSchema.extend({
  type: z.literal("SubscriptionCanceled"),
  data: z
    .object({
      effective: z.enum(["immediately", "period_end"]),
      periodEnd: z.coerce.date().nullable().default(null)
    })
    .strict()
});

export const SubscriptionEndedEventSchema = EventBaseSchema.extend({
  type: z.literal("SubscriptionEnded"),
  data: z.object({}).strict()
});

export const SeatsChangedEventSchema = EventBaseSchema.extend({
  type: z.literal("SeatsChanged"),
  data: z.object({ seats: z.number().int().positive() }).strict()
});

export const ManualRevokeEventSchema = EventBaseSchema.extend({
  type: z.literal("ManualRevoke"),
  data: z.object({ reason: z.string().min(1) }).strict()
});

export const ManualRestoreEventSchema = EventBaseSchema.extend({
  type: z.literal("ManualRestore"),
  data: z.object({ reason: z.string().min(1) }).strict()
});

export const LicenseEventSchema = z.discriminatedUnion("type", [
  PaymentSucceededEventSchema,
  RefundIssuedEventSchema,
  DisputeOpenedEventSchema,
  DisputeResolvedEventSchema,
  SubscriptionActivatedEventSchema,
  SubscriptionRenewedEventSchema,
  SubscriptionPastDueEventSchema,
  SubscriptionCanceledEventSchema,
  SubscriptionEndedEventSchema,
  SeatsChangedEventSchema,
  ManualRevokeEventSchema,
  ManualRestoreEventSchema
]);

export type LicenseEvent = z.infer<typeof LicenseEventSchema>;

export const RevokePolicySchema = z
  .object({
    partial_refund: z.enum(["keep", "revoke"]).default("keep"),
    full_refund: z.enum(["keep", "revoke"]).default("revoke"),
    dispute_opened: z.enum(["keep", "revoke"]).default("revoke"),
    dispute_won: z.enum(["flag_for_seller", "restore"]).default("flag_for_seller"),
    past_due_grace_days: z.number().int().nonnegative().default(3),
    remove_from_org_when_no_grants: z.boolean().default(true)
  })
  .strict();

export type RevokePolicy = z.infer<typeof RevokePolicySchema>;

export const defaultRevokePolicy: RevokePolicy = RevokePolicySchema.parse({});

export const LicenseStatusSchema = z.enum([
  "active",
  "grace",
  "canceling",
  "updates_ended",
  "ended",
  "refunded",
  "disputed",
  "charged_back",
  "revoked"
]);

export type LicenseStatus = z.infer<typeof LicenseStatusSchema>;

export interface LicenseState {
  status: LicenseStatus;
  access: "present" | "absent";
}

export interface LicenseForGrants {
  id: string;
  status: LicenseStatus;
  updatesUntil: Date | null;
}

export interface Seat {
  id: string;
  userId: string | null;
  releasedAt: Date | null;
}

export type DeliverableType = "github_team" | "registry" | "download";

export interface Deliverable {
  id: string;
  type: DeliverableType;
}

export interface DesiredGrant {
  seatId: string;
  deliverableId: string;
  desired: "present" | "absent";
}
