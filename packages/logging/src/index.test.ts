import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { createLogger } from "./index.js";

describe("createLogger", () => {
  it("redacts secrets before writing a log entry", () => {
    const entries: string[] = [];
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        const entry = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
        entries.push(entry);
        callback();
      }
    });
    const logger = createLogger(destination);

    logger.info(
      {
        authorization: "Bearer top-secret",
        cookie: "session=top-secret",
        provider: {
          api_key_enc: "encrypted-provider-key",
          secret: "nested-secret",
          token: "nested-token"
        },
        secret: "top-secret",
        token: "top-secret"
      },
      "request completed"
    );

    const entry = entries.join("");
    expect(entry).toContain("[REDACTED]");
    expect(entry).not.toContain("top-secret");
    expect(entry).not.toContain("encrypted-provider-key");
  });
});
