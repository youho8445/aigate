import * as fs from "fs";
import { configPath, defaultConfig, CONFIG_FILENAME } from "../config";
import { findRepoRoot } from "../gitRepo";

export async function runInit(): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd());
  const file = configPath(repoRoot);

  if (fs.existsSync(file)) {
    console.log(`${CONFIG_FILENAME} already exists at ${file} — leaving it unchanged.`);
    return;
  }

  fs.writeFileSync(file, JSON.stringify(defaultConfig(), null, 2) + "\n", "utf-8");
  console.log(`Created ${file}.`);
  console.log(`Edit "targets" to match your project (one entry per build unit), then run "aigate install".`);
}
