import { ApiError } from "./errors";

export const fixtureSellerId = "5e11e700-0000-4000-8000-000000000001";

const products = [
  { id: "9d000000-0000-4000-8000-000000000001", name: "Starter Kit Pro", status: "active" },
  { id: "9d000000-0000-4000-8000-000000000002", name: "UI Blocks", status: "active" },
  { id: "9d000000-0000-4000-8000-000000000003", name: "Invoice Kit", status: "draft" }
];

const people: [string | null, string, string, string][] = [
  // login, email, observed, status
  ["bilal-k", "bilal@example.com", "active", "active"],
  ["sara-dev", "sara@example.com", "removed", "refunded"],
  ["mkhan", "m.khan@example.com", "needs_attention", "active"],
  ["team-orbit", "ops@example.com", "active", "active"],
  ["nadia-codes", "nadia@example.com", "invited", "active"],
  [null, "leo@example.com", "none", "active"],
  ["prisha", "prisha@example.com", "active", "active"],
  ["dmitri-v", "dmitri@example.com", "active", "canceling"],
  ["kofi", "kofi@example.com", "active", "active"],
  ["yuki-t", "yuki@example.com", "queued", "active"],
  ["felix-dev", "felix@example.com", "active", "active"],
  ["noor", "noor@example.com", "active", "active"],
  ["jt-builds", "jt@example.com", "needs_attention", "active"],
  ["sam-b", "sam@example.com", "active", "active"],
  ["ivy-labs", "hello@example.com", "active", "active"],
  ["marco", "marco@example.com", "removed", "charged_back"],
  ["zainab", "zainab@example.com", "active", "active"],
  ["theo-io", "theo@example.com", "invited", "active"],
  ["arun99", "arun@example.com", "active", "active"],
  ["ohm", "ohm@example.com", "active", "active"],
  [null, "wei@example.com", "none", "active"],
  ["lena-writes-code", "lena@example.com", "active", "active"]
];

const licenses = people.map(([login, email, observed, status], index) => {
  const product = products[index % 2];
  const teamSeats = login === "team-orbit" ? 5 : 1;
  return {
    id: `11c00000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    productName: product?.name ?? "Starter Kit Pro",
    status,
    purchaseEmail: email,
    purchasedAt: new Date(Date.UTC(2026, 8, 28, 14, 4) - index * 7.3 * 3600_000).toISOString(),
    githubLogin: login,
    seatsTotal: teamSeats,
    seatsClaimed: login === null ? 0 : teamSeats === 5 ? 3 : 1,
    observed
  };
});

const drift = [
  {
    id: "d0000000-0000-4000-8000-000000000001",
    kind: "removed_externally",
    details: { organization: "aisha-studio" },
    status: "open",
    licenseId: "11c00000-0000-4000-8000-000000000013",
    githubLogin: "jt-builds"
  },
  {
    id: "d0000000-0000-4000-8000-000000000002",
    kind: "unmapped_product",
    details: { externalProductId: "pro_01j9x" },
    status: "open"
  },
  {
    id: "d0000000-0000-4000-8000-000000000003",
    kind: "download_zip_missing",
    details: { tag: "v2.1.0" },
    status: "resolved"
  }
];

const timeline = (licenseId: string) => {
  const license = licenses.find((item) => item.id === licenseId);
  if (license === undefined) throw new ApiError(404, "not_found", "License was not found.");
  const start = Date.parse(license.purchasedAt);
  const at = (minutes: number) => new Date(start + minutes * 60_000).toISOString();
  const activity = [
    {
      action: "paid",
      reason: `Paid on Paddle, order 4f1c, with ${license.purchaseEmail}`,
      createdAt: at(0)
    }
  ];
  if (license.githubLogin !== null) {
    activity.push({
      action: "claimed",
      reason: `Signed in as @${license.githubLogin}. Matched on their GitHub account number, so a rename changes nothing.`,
      createdAt: at(2)
    });
    activity.push({
      action: "invited",
      reason: "Invite sent to join the buyers team with read only access.",
      createdAt: at(2)
    });
  }
  if (license.observed === "active")
    activity.push({
      action: "reconciled_active",
      reason: "Invite accepted. They can open the repo.",
      createdAt: at(9)
    });
  if (license.status === "refunded")
    activity.push({
      action: "reconciled_removed",
      reason: "Refunded in full on Paddle, so access was removed.",
      createdAt: at(3 * 24 * 60)
    });
  if (license.observed === "needs_attention")
    activity.push({
      action: "needs_attention",
      reason: "The invite ran out three times without being accepted. We stopped resending.",
      createdAt: at(21 * 24 * 60)
    });
  return {
    license: { id: license.id, productName: license.productName, status: license.status },
    activity: activity.reverse()
  };
};

const claims: Record<
  string,
  { state: "available" | "expired" | "unavailable"; signedIn: boolean }
> = {
  "sample-claim-signed-out-000000000": { state: "available", signedIn: false },
  "sample-claim-signed-in-0000000000": { state: "available", signedIn: true },
  "sample-claim-expired-000000000000": { state: "expired", signedIn: false },
  "sample-claim-used-000000000000000": { state: "unavailable", signedIn: true }
};

const purchases = [
  {
    id: "a0000000-0000-4000-8000-000000000001",
    observed: "active",
    productName: "Starter Kit Pro",
    sellerSlug: "aisha-studio"
  },
  {
    id: "a0000000-0000-4000-8000-000000000002",
    observed: "invited",
    productName: "UI Blocks",
    sellerSlug: "aisha-studio"
  },
  {
    id: "a0000000-0000-4000-8000-000000000003",
    observed: "queued",
    productName: "Chart Components",
    sellerSlug: "north-pixel"
  },
  {
    id: "a0000000-0000-4000-8000-000000000004",
    observed: "removed",
    productName: "Email Templates",
    sellerSlug: "north-pixel"
  }
];

/** Answers the same paths as the real API with sample data. Unknown paths are a 404. */
export const fixtureResponse = (path: string): unknown => {
  const [pathname = ""] = path.split("?");
  const parts = pathname.split("/").filter(Boolean);
  if (pathname === "/me")
    return {
      githubUserId: "40011",
      login: "aisha",
      sellers: [{ id: fixtureSellerId, role: "owner", slug: "aisha-studio" }]
    };
  if (pathname === "/purchases") return purchases;
  if (parts[0] === "access" && parts[1] !== undefined) {
    const found = purchases.find((item) => item.id === parts[1]);
    if (found === undefined) throw new ApiError(404, "not_found", "This purchase was not found.");
    return found;
  }
  if (parts[0] === "claim" && parts[1] !== undefined) {
    const claim = claims[parts[1]];
    if (claim === undefined)
      throw new ApiError(404, "not_found", "This claim link is not available.");
    return { ...claim, productName: "Starter Kit Pro", expiresAt: "2026-10-28T14:02:00.000Z" };
  }
  if (parts[0] === "sellers" && parts[1] === fixtureSellerId) {
    const [, , section, id] = parts;
    if (section === "onboarding")
      return {
        github: true,
        provider: true,
        product: true,
        mapping: true,
        testPurchase: true,
        testRefund: false,
        ready: false
      };
    if (section === "banners") return [];
    if (section === "drift") return drift;
    if (section === "products") return products;
    if (section === "members")
      return [
        { userId: "u1", role: "owner", login: "aisha" },
        { userId: "u2", role: "viewer", login: "rehan-support" }
      ];
    if (section === "licenses" && id !== undefined) return timeline(id);
    if (section === "licenses") return licenses;
  }
  throw new ApiError(404, "not_found", "Not found.");
};
