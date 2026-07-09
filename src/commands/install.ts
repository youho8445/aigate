import * as fs from "fs";
import * as path from "path";
import { findRepoRoot, hooksDir } from "../gitRepo";

const MARKER = "# managed-by: aigate";

const HOOK_SCRIPT = `#!/bin/sh
${MARKER} (do not edit manually — run "aigate uninstall" to remove)
exec npx aigate run
`;

export async function runInstall(): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd());
  const dir = hooksDir(repoRoot);
  const hookPath = path.join(dir, "pre-push");
  const backupPath = path.join(dir, "pre-push.aigate-backup");

  if (fs.existsSync(hookPath)) {
    const existing = fs.readFileSync(hookPath, "utf-8");
    if (existing.includes(MARKER)) {
      fs.writeFileSync(hookPath, HOOK_SCRIPT, "utf-8");
      console.log(`aigate pre-push hook already installed — refreshed at ${hookPath}.`);
      chmodExecutable(hookPath);
      return;
    }
    if (fs.existsSync(backupPath)) {
      throw new Error(
        `Refusing to overwrite: an existing pre-push hook is present and a backup already exists at ${backupPath}. Resolve manually.`
      );
    }
    fs.renameSync(hookPath, backupPath);
    console.log(`Existing pre-push hook backed up to ${backupPath}.`);
  }

  fs.writeFileSync(hookPath, HOOK_SCRIPT, "utf-8");
  chmodExecutable(hookPath);
  console.log(`Installed pre-push hook at ${hookPath}.`);
}

function chmodExecutable(filePath: string): void {
  try {
    fs.chmodSync(filePath, 0o755);
  } catch {
    // Windows filesystems without POSIX permission bits — Git for Windows
    // executes hooks via sh regardless of the executable bit, so ignore.
  }
}
