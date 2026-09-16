import { expect, test } from "vitest";
import { FakeGitHub } from "@latchkey/github";
import { createTaskList } from "./index.js";

test("worker exposes only the Graphile M2 task identifiers", () => {
  const tasks = createTaskList({
    sql: {} as never,
    github: new FakeGitHub(),
    now: () => new Date("2026-01-01T00:00:00Z")
  });
  expect(Object.keys(tasks).sort()).toEqual(["process_event", "reconcile_grant"]);
});
