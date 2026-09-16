import { ConfigurationError, loadConfig } from "@latchkey/config";

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
