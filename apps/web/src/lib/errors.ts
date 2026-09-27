/** The web app's own error types. It never imports server packages into the browser bundle. */
export class WebConfigurationError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "WebConfigurationError";
  }
}

/** A non-2xx API answer. `message` is the API's user-safe message, never a raw body. */
export class ApiError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}
