import { describe, expect, it } from "vitest";

import {
  AuthError,
  ConflictError,
  ExternalPermanentError,
  ExternalTransientError,
  InvariantViolation,
  NotFoundError,
  ValidationError
} from "./index.js";

describe("application errors", () => {
  it.each([
    [ValidationError, "validation_error", 422],
    [AuthError, "auth_error", 401],
    [NotFoundError, "not_found", 404],
    [ConflictError, "conflict", 409],
    [ExternalTransientError, "external_transient", 503],
    [ExternalPermanentError, "external_permanent", 422],
    [InvariantViolation, "invariant_violation", 500]
  ])("creates %p with its stable error shape", (ErrorClass, code, statusCode) => {
    const error = new ErrorClass("safe message");

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ code, message: "safe message", statusCode });
  });
});
