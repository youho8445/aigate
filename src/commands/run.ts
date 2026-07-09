import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { findRepoRoot } from "../gitRepo";
import { loadConfig, Target } from "../config";
import { runClaudeReview } from "../claudeReview";

const TAIL_LINES = 40;

// On Windows, spawnSync's default shell is cmd.exe, which does not understand
// POSIX-style relative paths (e.g. "./node_modules/.bin/nest") that npm
// scripts commonly use. Git for Windows hooks already run under its bundled
// sh — resolve the same bash so build/typecheck commands see consistent
// shell semantics with the hook that invoked them. npm additionally spawns
// its OWN internal shell to execute the script body of "npm run <script>"
// regardless of the parent's shell, so the resolved bash is also forced via
// npm_config_script_shell for that case.
function resolveWindowsBash(): string | undefined {
  if (process.platform !== "win32") return undefined;
  if (process.env.AIGATE_SHELL) return process.env.AIGATE_SHELL;
  const candidates = [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files\\Git\\usr\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

export async function runRun(): Promise<void> {
  const repoRoot = findRepoRoot(process.cwd());
  const config = loadConfig(repoRoot);

  if (config.targets.length === 0) {
    console.log("aigate: no targets configured — nothing to check.");
    return;
  }

  for (const target of config.targets) {
    const cwd = path.join(repoRoot, target.cwd);

    if (target.typecheck) {
      const ok = runStep(target, "typecheck", target.typecheck, cwd);
      if (!ok) fail();
    }

    const ok = runStep(target, "build", target.build, cwd);
    if (!ok) fail();
  }

  console.log("aigate: all targets passed. Proceeding with push.");

  // v0.2: CLAUDE.md diff review. Independent of the typecheck/build gate
  // above — it only warns, and any failure inside it is swallowed so it can
  // never block or delay the push beyond its own best-effort attempt.
  await runClaudeReview(repoRoot, config.claudeReview);
}

function runStep(target: Target, stepName: string, command: string, cwd: string): boolean {
  console.log(`aigate: [${target.name}] running ${stepName}: ${command}`);
  const bash = resolveWindowsBash();
  const result = spawnSync(command, {
    cwd,
    shell: bash ?? true,
    encoding: "utf-8",
    env: bash ? { ...process.env, npm_config_script_shell: bash } : process.env,
  });

  if (result.error || result.status !== 0) {
    console.error(`\naigate: [${target.name}] ${stepName} FAILED (${command})`);
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
    console.error(tail(output, TAIL_LINES));
    return false;
  }

  console.log(`aigate: [${target.name}] ${stepName} passed.`);
  return true;
}

function tail(output: string, lines: number): string {
  const allLines = output.split(/\r?\n/);
  return allLines.slice(-lines).join("\n");
}

function fail(): never {
  console.error("\naigate: push blocked.");
  process.exit(1);
}
