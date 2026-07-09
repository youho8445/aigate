import * as fs from "fs";
import * as path from "path";
import { findRepoRoot, hooksDir } from "../gitRepo";

const MARKER = "# managed-by: aigate";

export async function runUninstall(): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd());
  const dir = hooksDir(repoRoot);
  const hookPath = path.join(dir, "pre-push");
  const backupPath = path.join(dir, "pre-push.aigate-backup");

  if (!fs.existsSync(hookPath)) {
    console.log("No pre-push hook installed — nothing to do.");
    return;
  }

  const content = fs.readFileSync(hookPath, "utf-8");
  if (!content.includes(MARKER)) {
    console.log("pre-push hook exists but was not installed by aigate — leaving it unchanged.");
    return;
  }

  fs.unlinkSync(hookPath);

  if (fs.existsSync(backupPath)) {
    fs.renameSync(backupPath, hookPath);
    console.log(`Removed aigate hook and restored the previous pre-push hook from backup.`);
  } else {
    console.log("Removed aigate pre-push hook.");
  }
}
