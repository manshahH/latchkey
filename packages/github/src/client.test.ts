import { generateKeyPairSync } from "node:crypto";
import { expect, test } from "vitest";
import { ExternalPermanentError, ExternalTransientError } from "@latchkey/core";
import { GitHubAppClient } from "./index.js";

const target = { installationId: 99n, organization: "seller-org", teamSlug: "buyers" };
const urlFor = (input: string | URL | Request): string =>
  typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
const privateKey = generateKeyPairSync("rsa", { modulusLength: 2048 })
  .privateKey.export({ format: "pem", type: "pkcs1" })
  .toString();

test("real client caches installation tokens, resolves numeric identities, and adds members as members", async () => {
  const calls: Array<{
    authorization: string | null;
    body: string | undefined;
    method: string;
    url: string;
  }> = [];
  const client = new GitHubAppClient({
    appId: 123,
    privateKey,
    now: () => new Date("2026-01-01T00:00:00Z"),
    fetch: (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const url = urlFor(input);
      calls.push({
        authorization: new Headers(init?.headers).get("authorization"),
        body: typeof init?.body === "string" ? init.body : undefined,
        method: init?.method ?? "GET",
        url
      });
      if (url.endsWith("/access_tokens"))
        return Promise.resolve(
          Response.json({ token: "installation-token", expires_at: "2026-01-01T01:00:00Z" })
        );
      if (url.endsWith("/user/7"))
        return Promise.resolve(Response.json({ id: 7, login: "renamed-user" }));
      if (url.endsWith("/memberships/renamed-user"))
        return Promise.resolve(Response.json({ state: "pending" }));
      return Promise.reject(new Error("Unexpected test request."));
    }
  });

  await client.inviteToTeam(target, 7n);
  expect(await client.getPendingInvitation(target, 7n)).toBe(true);
  expect(await client.getTeamMembership(target, 7n)).toBe(false);

  expect(calls.filter((call) => call.url.endsWith("/access_tokens"))).toHaveLength(1);
  expect(calls).toContainEqual(
    expect.objectContaining({
      body: JSON.stringify({ role: "member" }),
      method: "PUT",
      url: "https://api.github.com/orgs/seller-org/teams/buyers/memberships/renamed-user"
    })
  );
  expect(calls[0]?.authorization).toMatch(
    /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/
  );
});

test("real client maps retryable and permanent GitHub responses without exposing response bodies", async () => {
  const tokenOrRateLimited = (input: string | URL | Request): Promise<Response> =>
    urlFor(input).endsWith("/access_tokens")
      ? Promise.resolve(Response.json({ token: "token", expires_at: "2026-01-01T01:00:00Z" }))
      : Promise.resolve(
          new Response("sensitive upstream body", { headers: { "retry-after": "3" }, status: 429 })
        );
  const transient = new GitHubAppClient({
    appId: 123,
    privateKey,
    fetch: tokenOrRateLimited,
    now: () => new Date("2026-01-01T00:00:00Z")
  });
  await expect(transient.getTeamMembership(target, 7n)).rejects.toMatchObject({
    name: ExternalTransientError.name,
    retryAfterMs: 3_000
  });

  const tokenOrPermanent = (input: string | URL | Request): Promise<Response> =>
    urlFor(input).endsWith("/access_tokens")
      ? Promise.resolve(Response.json({ token: "token", expires_at: "2026-01-01T01:00:00Z" }))
      : Promise.resolve(new Response("sensitive upstream body", { status: 422 }));
  const permanent = new GitHubAppClient({
    appId: 123,
    privateKey,
    fetch: tokenOrPermanent,
    now: () => new Date("2026-01-01T00:00:00Z")
  });
  await expect(permanent.inviteToTeam(target, 7n)).rejects.toMatchObject({
    name: ExternalPermanentError.name,
    message: "GitHub could not complete this access change."
  });
});

test("real client decodes a repository file's base64 content and returns null when it is missing", async () => {
  const repoTarget = { installationId: 99n, organization: "seller-org", repo: "widget-kit" };
  const encoded = Buffer.from('{"name":"widget"}', "utf8").toString("base64");
  const client = new GitHubAppClient({
    appId: 123,
    privateKey,
    now: () => new Date("2026-01-01T00:00:00Z"),
    fetch: (input: string | URL | Request): Promise<Response> => {
      const url = urlFor(input);
      if (url.endsWith("/access_tokens"))
        return Promise.resolve(
          Response.json({ token: "installation-token", expires_at: "2026-01-01T01:00:00Z" })
        );
      if (url.includes("/contents/registry.json"))
        return Promise.resolve(
          Response.json({ type: "file", encoding: "base64", content: encoded })
        );
      if (url.includes("/contents/missing.json"))
        return Promise.resolve(new Response("", { status: 404 }));
      return Promise.reject(new Error("Unexpected test request."));
    }
  });

  expect(await client.getRepositoryFile(repoTarget, "registry.json", "v1.0.0")).toBe(
    '{"name":"widget"}'
  );
  expect(await client.getRepositoryFile(repoTarget, "missing.json", "v1.0.0")).toBeNull();
});

test("real client resolves a login to its numeric id and returns null for a 404", async () => {
  const client = new GitHubAppClient({
    appId: 123,
    privateKey,
    now: () => new Date("2026-01-01T00:00:00Z"),
    fetch: (input: string | URL | Request): Promise<Response> => {
      const url = urlFor(input);
      if (url.endsWith("/users/octocat")) return Promise.resolve(Response.json({ id: 583231 }));
      if (url.endsWith("/users/nobody-by-this-name"))
        return Promise.resolve(new Response("", { status: 404 }));
      return Promise.reject(new Error("Unexpected test request."));
    }
  });

  expect(await client.resolveUserByLogin("octocat")).toBe(583231n);
  expect(await client.resolveUserByLogin("nobody-by-this-name")).toBeNull();
});
