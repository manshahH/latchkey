import { type Deliverable, type DesiredGrant, type LicenseForGrants, type Seat } from "./types.js";

const isSeatAssigned = (seat: Seat): boolean => seat.userId !== null && seat.releasedAt === null;

const desiredForDeliverable = (
  license: LicenseForGrants,
  deliverable: Deliverable,
  now: Date
): "present" | "absent" => {
  const updatesEnded =
    license.status === "updates_ended" ||
    (license.status === "active" &&
      license.updatesUntil !== null &&
      now.getTime() >= license.updatesUntil.getTime());

  if (updatesEnded) {
    return deliverable.type === "github_team" ? "absent" : "present";
  }

  return license.status === "active" || license.status === "grace" || license.status === "canceling"
    ? "present"
    : "absent";
};

export const desiredGrants = (
  license: LicenseForGrants,
  seats: readonly Seat[],
  deliverables: readonly Deliverable[],
  now: Date
): DesiredGrant[] =>
  seats.flatMap((seat) =>
    deliverables.map((deliverable) => ({
      deliverableId: deliverable.id,
      desired: isSeatAssigned(seat) ? desiredForDeliverable(license, deliverable, now) : "absent",
      seatId: seat.id
    }))
  );
