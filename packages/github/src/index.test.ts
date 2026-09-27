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

test("fake github serves a set repository file and returns null when unset, and injects one-shot failures", () => {
  const github = new FakeGitHub();
  const repoTarget = { organization: "seller-org", repo: "widget-kit" };
  github.setRepositoryFile(repoTarget, "v1.0.0", "registry.json", '{"items":[]}');

  expect(github.getRepositoryFile(repoTarget, "registry.json", "v1.0.0")).toBe('{"items":[]}');
  expect(github.getRepositoryFile(repoTarget, "missing.json", "v1.0.0")).toBeNull();
  expect(github.getRepositoryFile(repoTarget, "registry.json", "v2.0.0")).toBeNull();

  github.failNextRepositoryFile("rate_limited");
  expect(() => github.getRepositoryFile(repoTarget, "registry.json", "v1.0.0")).toThrow(
    "rate limit"
  );
  expect(github.getRepositoryFile(repoTarget, "registry.json", "v1.0.0")).toBe('{"items":[]}');
});

test("fake github resolves a set login to its numeric id, and null for an unknown or deleted one", () => {
  const github = new FakeGitHub();
  github.setUser(7n, "octocat");
  expect(github.resolveUserByLogin("octocat")).toBe(7n);
  expect(github.resolveUserByLogin("nobody-by-this-name")).toBeNull();
  github.deleteUser(7n);
  expect(github.resolveUserByLogin("octocat")).toBeNull();
});

test("fake github serves a set repository zip and returns null when unset, sharing failure injection with file fetches", () => {
  const github = new FakeGitHub();
  const repoTarget = { organization: "seller-org", repo: "widget-kit" };
  const zip = new Uint8Array([1, 2, 3]);
  github.setRepositoryZip(repoTarget, "v1.0.0", zip);

  expect(github.getRepositoryZip(repoTarget, "v1.0.0")).toEqual(zip);
  expect(github.getRepositoryZip(repoTarget, "v2.0.0")).toBeNull();

  github.failNextRepositoryFile("server_error");
  expect(() => github.getRepositoryZip(repoTarget, "v1.0.0")).toThrow("temporarily unavailable");
  expect(github.getRepositoryZip(repoTarget, "v1.0.0")).toEqual(zip);
});
