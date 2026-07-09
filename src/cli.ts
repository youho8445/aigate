#!/usr/bin/env node
import { runInit } from "./commands/init";
import { runInstall } from "./commands/install";
import { runRun } from "./commands/run";
import { runUninstall } from "./commands/uninstall";

const command = process.argv[2];

async function main(): Promise<void> {
  switch (command) {
    case "init":
      await runInit();
      break;
    case "install":
      await runInstall();
      break;
    case "run":
      await runRun();
      break;
    case "uninstall":
      await runUninstall();
      break;
    default:
      console.error(`Unknown command: ${command ?? "(none)"}`);
      console.error("Usage: aigate <init|install|run|uninstall>");
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(`aigate: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
