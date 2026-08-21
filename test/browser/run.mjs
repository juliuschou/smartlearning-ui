import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const playwrightCli = join(dirname(require.resolve("playwright")), "cli.js");
const child = spawn(
  process.execPath,
  [playwrightCli, "test", ...process.argv.slice(2)],
  {
    stdio: "inherit",
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
