import { expect, test } from "vitest";
import { FakeGitHub } from "@latchkey/github";
import { createTaskList } from "./index.js";

test("worker exposes the Graphile M2 and M3 task identifiers", () => {
  const tasks = createTaskList({
    sql: {} as never,
    github: new FakeGitHub(),
    now: () => new Date("2026-01-01T00:00:00Z")
  });
  expect(Object.keys(tasks).sort()).toEqual([
    "generate_export",
    "invite_watchdog",
    "notify_buyer",
    "notify_seller",
    "process_event",
    "process_github_webhook",
    "reconcile_grant",
    "reconcile_sweep"
  ]);
});
