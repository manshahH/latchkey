import { expect, test } from "vitest";
import { FakeClock } from "@latchkey/testing";
import { FakeGitHub } from "./index.js";

const target = { organization: "seller-org", teamSlug: "buyers" };

test("fake github implements organization and team membership endpoints by numeric identity", () => {
  const github = new FakeGitHub();
  github.inviteToTeam(target, 7n);
  expect(github.getPendingInvitation(target, 7n)).toBe(true);
  github.acceptInvitation("seller-org", 7n);
  expect(github.getOrganizationMembership("seller-org", 7n)).toBe(true);
  expect(github.getTeamMembership(target, 7n)).toBe(true);
  expect(github.listTeamMembers(target)).toEqual([7n]);
  github.removeTeamMember(target, 7n);
  expect(github.getTeamMembership(target, 7n)).toBe(false);
  github.removeOrganizationMember("seller-org", 7n);
  expect(github.getOrganizationMembership("seller-org", 7n)).toBe(false);
});

test("fake github expires invitations, injects errors, and keeps renamed numeric identities", () => {
  const clock = new FakeClock(new Date("2026-01-01T00:00:00Z"));
  const github = new FakeGitHub(clock, 1);
  github.setUser(7n, "before");
  github.inviteToTeam(target, 7n);
  clock.advanceDays(7);
  expect(github.getPendingInvitation(target, 7n)).toBe(false);
  github.renameUser(7n, "after");
  expect(github.loginFor(7n)).toBe("after");
  github.failNext(8n, "server_error");
  expect(() => {
    github.inviteToTeam(target, 8n);
  }).toThrow("temporarily unavailable");
  github.deleteUser(9n);
  expect(() => {
    github.inviteToTeam(target, 9n);
  }).toThrow("not found");
});
