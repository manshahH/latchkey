import { expect, test } from "vitest";
import { FakeGitHub } from "./index.js";
test("fake github tracks invitations by numeric identity", () => {
  const github = new FakeGitHub();
  github.invite(7n);
  expect(github.observe(7n)).toBe("invited");
  github.accept(7n);
  expect(github.observe(7n)).toBe("active");
  github.remove(7n);
  expect(github.observe(7n)).toBe("none");
});
