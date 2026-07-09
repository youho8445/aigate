import { spawnSync } from "child_process";
import * as fs from "fs";

const ZERO_SHA = "0".repeat(40);

export interface PushRef {
  localRef: string;
  localSha: string;
  remoteRef: string;
  remoteSha: string;
}

/**
 * git invokes pre-push hooks with ref updates on stdin, one line per ref:
 *   <local ref> SP <local sha1> SP <remote ref> SP <remote sha1> LF
 * When aigate is run manually (stdin is a TTY, no piped data), there is no
 * ref info to read — return null rather than blocking on stdin forever.
 * On multi-ref pushes, only the first ref is used (v0.2 scope).
 */
export function readPushRefFromStdin(): PushRef | null {
  if (process.stdin.isTTY) return null;

  let raw: string;
  try {
    raw = fs.readFileSync(0, "utf-8");
  } catch {
    return null;
  }

  const firstLine = raw.split(/\r?\n/).find((line) => line.trim().length > 0);
  if (!firstLine) return null;

  const parts = firstLine.trim().split(/\s+/);
  if (parts.length !== 4) return null;

  const [localRef, localSha, remoteRef, remoteSha] = parts;
  return { localRef, localSha, remoteRef, remoteSha };
}

export type DiffRangeResult =
  | { ok: true; range: string }
  | { ok: false; reason: string };

export function computeDiffRange(repoRoot: string, ref: PushRef): DiffRangeResult {
  if (ref.localSha === ZERO_SHA) {
    return { ok: false, reason: "branch deletion push, nothing to review" };
  }

  if (ref.remoteSha !== ZERO_SHA) {
    return { ok: true, range: `${ref.remoteSha}..${ref.localSha}` };
  }

  // New branch: no remote sha to diff against. Fall back to the merge-base
  // with origin/main.
  const mergeBase = spawnSync("git", ["merge-base", "origin/main", ref.localSha], {
    cwd: repoRoot,
    encoding: "utf-8",
  });

  if (mergeBase.status !== 0 || !mergeBase.stdout.trim()) {
    return {
      ok: false,
      reason: "diff base unavailable (merge-base with origin/main failed)",
    };
  }

  return { ok: true, range: `${mergeBase.stdout.trim()}..${ref.localSha}` };
}

export function getDiffText(repoRoot: string, range: string): string | null {
  const result = spawnSync("git", ["diff", range], {
    cwd: repoRoot,
    encoding: "utf-8",
    maxBuffer: 1024 * 1024 * 64,
  });

  if (result.status !== 0) return null;
  return result.stdout;
}
