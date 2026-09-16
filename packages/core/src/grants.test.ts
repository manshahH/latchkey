import { describe, expect, it } from "vitest";

import { desiredGrants, type Deliverable, type LicenseForGrants, type Seat } from "./index.js";

const now = new Date("2026-01-05T00:00:00.000Z");
const license: LicenseForGrants = { id: "license-1", status: "active", updatesUntil: null };
const deliverables: Deliverable[] = [
  { id: "team", type: "github_team" },
  { id: "registry", type: "registry" },
  { id: "download", type: "download" }
];
const assignedSeat: Seat = { id: "seat-1", releasedAt: null, userId: "user-1" };

describe("desiredGrants", () => {
  it("returns a grant decision for every seat and deliverable", () => {
    expect(desiredGrants(license, [assignedSeat], deliverables, now)).toEqual([
      { deliverableId: "team", desired: "present", seatId: "seat-1" },
      { deliverableId: "registry", desired: "present", seatId: "seat-1" },
      { deliverableId: "download", desired: "present", seatId: "seat-1" }
    ]);
  });

  it("keeps pinned registry and download access after updates end", () => {
    expect(
      desiredGrants({ ...license, status: "updates_ended" }, [assignedSeat], deliverables, now)
    ).toEqual([
      { deliverableId: "team", desired: "absent", seatId: "seat-1" },
      { deliverableId: "registry", desired: "present", seatId: "seat-1" },
      { deliverableId: "download", desired: "present", seatId: "seat-1" }
    ]);
  });

  it("expires a one time update window even when the stored status is active", () => {
    expect(
      desiredGrants(
        { ...license, updatesUntil: new Date("2026-01-04T00:00:00.000Z") },
        [assignedSeat],
        deliverables,
        now
      )[0]
    ).toEqual({ deliverableId: "team", desired: "absent", seatId: "seat-1" });
  });

  it("denies unassigned, released, and inactive license grants", () => {
    const seats: Seat[] = [
      { id: "unassigned", releasedAt: null, userId: null },
      { id: "released", releasedAt: now, userId: "user-2" }
    ];

    expect(desiredGrants({ ...license, status: "refunded" }, seats, deliverables, now)).toEqual([
      { deliverableId: "team", desired: "absent", seatId: "unassigned" },
      { deliverableId: "registry", desired: "absent", seatId: "unassigned" },
      { deliverableId: "download", desired: "absent", seatId: "unassigned" },
      { deliverableId: "team", desired: "absent", seatId: "released" },
      { deliverableId: "registry", desired: "absent", seatId: "released" },
      { deliverableId: "download", desired: "absent", seatId: "released" }
    ]);
  });
});
