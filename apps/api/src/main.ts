import { ConfigurationError, loadConfig } from "@latchkey/config";

if (process.env.LATCHKEY_LISTEN === "true") {
  void import("./server.js").then(({ startHostedApi }) => {
    startHostedApi();
  });
} else {
  try {
    loadConfig(process.env);
  } catch (error) {
    if (error instanceof ConfigurationError) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
    } else {
      throw error;
    }
  }
}
