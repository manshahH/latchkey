export abstract class LatchkeyError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends LatchkeyError {
  readonly code = "validation_error";
  readonly statusCode = 422;
}

export class AuthError extends LatchkeyError {
  readonly code = "auth_error";
  readonly statusCode = 401;
}

export class NotFoundError extends LatchkeyError {
  readonly code = "not_found";
  readonly statusCode = 404;
}

export class ConflictError extends LatchkeyError {
  readonly code = "conflict";
  readonly statusCode = 409;
}

export class ExternalTransientError extends LatchkeyError {
  readonly code = "external_transient";
  readonly statusCode = 503;
}

export class ExternalPermanentError extends LatchkeyError {
  readonly code = "external_permanent";
  readonly statusCode = 422;
}

export class InvariantViolation extends LatchkeyError {
  readonly code = "invariant_violation";
  readonly statusCode = 500;
}
