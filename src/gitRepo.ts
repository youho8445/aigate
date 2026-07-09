import * as fs from "fs";
import * as path from "path";

export function findRepoRoot(startDir: string): string {
  let dir = startDir;
  while (true) {
    if (fs.existsSync(path.join(dir, ".git"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error("Not inside a git repository (no .git directory found).");
    }
    dir = parent;
  }
}

export function hooksDir(repoRoot: string): string {
  return path.join(repoRoot, ".git", "hooks");
}
