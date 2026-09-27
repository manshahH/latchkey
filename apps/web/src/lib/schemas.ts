import { z } from "zod";

// Every API response is parsed at the boundary, so a change on the API side fails loudly in one
// place instead of rendering "undefined" to a buyer.

export const viewerSchema = z.object({
  githubUserId: z.string(),
  login: z.string().nullable(),
  sellers: z.array(z.object({ id: z.string(), role: z.string(), slug: z.string() }))
});
export type Viewer = z.infer<typeof viewerSchema>;

export const claimSchema = z.object({
  expiresAt: z.string(),
  productName: z.string(),
  signedIn: z.boolean(),
  state: z.enum(["available", "expired", "unavailable"])
});
export type Claim = z.infer<typeof claimSchema>;

export const buyerAccessSchema = z.object({
  id: z.string(),
  observed: z.string(),
  productName: z.string(),
  sellerSlug: z.string()
});
export type BuyerAccess = z.infer<typeof buyerAccessSchema>;
export const purchasesSchema = z.array(buyerAccessSchema);

export const sellerLicenseSchema = z.object({
  id: z.string(),
  productName: z.string(),
  status: z.string(),
  purchaseEmail: z.string().nullable(),
  purchasedAt: z.string(),
  githubLogin: z.string().nullable(),
  seatsTotal: z.number(),
  seatsClaimed: z.number(),
  observed: z.string()
});
export type SellerLicense = z.infer<typeof sellerLicenseSchema>;
export const sellerLicensesSchema = z.array(sellerLicenseSchema);

export const timelineSchema = z.object({
  license: z.object({ id: z.string(), productName: z.string(), status: z.string() }),
  activity: z.array(z.object({ action: z.string(), reason: z.string(), createdAt: z.string() }))
});
export type Timeline = z.infer<typeof timelineSchema>;

export const driftSchema = z.array(
  z.object({
    id: z.string(),
    kind: z.string(),
    details: z.record(z.unknown()),
    status: z.string(),
    licenseId: z.string().nullable().default(null),
    githubLogin: z.string().nullable().default(null)
  })
);
export type DriftItem = z.infer<typeof driftSchema>[number];

export const onboardingSchema = z.object({
  github: z.boolean(),
  provider: z.boolean(),
  product: z.boolean(),
  mapping: z.boolean(),
  testPurchase: z.boolean(),
  testRefund: z.boolean(),
  ready: z.boolean()
});
export type Onboarding = z.infer<typeof onboardingSchema>;

export const bannersSchema = z.array(z.object({ kind: z.string(), message: z.string() }));

export const productsSchema = z.array(
  z.object({ id: z.string(), name: z.string(), status: z.string() })
);
export type Product = z.infer<typeof productsSchema>[number];

export const membersSchema = z.array(
  z.object({ userId: z.string(), role: z.string(), login: z.string().nullable() })
);
export type Member = z.infer<typeof membersSchema>[number];

export const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() })
});
