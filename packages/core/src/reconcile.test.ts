import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { planReconcile, type ReconcileContext } from "./index.js";

const context = (overrides: Partial<ReconcileContext> = {}): ReconcileContext => ({
  hasOtherPresentGrants: false,
  hasUnmanagedTeams: false,
  invitationCreatedByUs: true,
  inviteNearExpiry: false,
  isOrgMember: false,
  provenance: "added_by_us",
  removeFromOrgWhenNoGrants: true,
  ...overrides
});

const actionTypes = (
  desired: "present" | "absent",
  observed: Parameters<typeof planReconcile>[1],
  overrides: Partial<ReconcileContext> = {}
) => planReconcile({ desired }, observed, context(overrides)).map((entry) => entry.type);

describe("planReconcile", () => {
  it("plans the smallest present-access action for every observed state class", () => {
    expect(actionTypes("present", "none")).toEqual(["invite"]);
    expect(actionTypes("present", "none", { isOrgMember: true })).toEqual(["add_team_only"]);
    expect(actionTypes("present", "active")).toEqual(["noop"]);
    expect(actionTypes("present", "invited")).toEqual(["noop"]);
    expect(actionTypes("present", "inviting", { inviteNearExpiry: true })).toEqual([
      "cancel_invite",
      "reinvite"
    ]);
    expect(actionTypes("present", "invite_expired")).toEqual(["reinvite"]);
    expect(actionTypes("present", "removed_externally")).toEqual(["needs_attention"]);
    expect(actionTypes("present", "invite_failed")).toEqual(["needs_attention"]);
    expect(actionTypes("present", "needs_attention")).toEqual(["needs_attention"]);
    expect(actionTypes("present", "removing")).toEqual(["needs_attention"]);
    expect(actionTypes("present", "error_retrying")).toEqual(["needs_attention"]);
    expect(actionTypes("present", "removed")).toEqual(["invite"]);
  });

  it("only removes an org member after every provenance safety condition passes", () => {
    expect(actionTypes("absent", "active")).toEqual(["remove_team", "remove_org"]);
    expect(actionTypes("absent", "active", { provenance: "pre_existing" })).toEqual([
      "remove_team"
    ]);
    expect(actionTypes("absent", "active", { hasOtherPresentGrants: true })).toEqual([
      "remove_team"
    ]);
    expect(actionTypes("absent", "active", { hasUnmanagedTeams: true })).toEqual([
      "remove_team"
    ]);
    expect(actionTypes("absent", "active", { removeFromOrgWhenNoGrants: false })).toEqual([
      "remove_team"
    ]);
  });

  it("never removes an org member without safe provenance inputs", () => {
    const contextArbitrary = fc.record({
      hasOtherPresentGrants: fc.boolean(),
      hasUnmanagedTeams: fc.boolean(),
      invitationCreatedByUs: fc.boolean(),
      inviteNearExpiry: fc.boolean(),
      isOrgMember: fc.boolean(),
      provenance: fc.constantFrom("added_by_us", "pre_existing"),
      removeFromOrgWhenNoGrants: fc.boolean()
    });

    fc.assert(
      fc.property(contextArbitrary, (candidate) => {
        const actions = planReconcile({ desired: "absent" }, "active", candidate);
        const unsafe =
          candidate.provenance === "pre_existing" ||
          candidate.hasOtherPresentGrants ||
          candidate.hasUnmanagedTeams ||
          !candidate.removeFromOrgWhenNoGrants;

        expect(actions.some((entry) => entry.type === "remove_org")).toBe(!unsafe);
      })
    );
  });

  it("does not touch an invitation that was not created by us", () => {
    expect(actionTypes("absent", "invited", { invitationCreatedByUs: false })).toEqual(["noop"]);
    expect(actionTypes("absent", "inviting")).toEqual(["cancel_invite"]);
    expect(actionTypes("absent", "none")).toEqual(["noop"]);
    expect(actionTypes("absent", "removed")).toEqual(["noop"]);
    expect(actionTypes("absent", "removed_externally")).toEqual(["noop"]);
    expect(actionTypes("absent", "invite_expired")).toEqual(["needs_attention"]);
  });
});
