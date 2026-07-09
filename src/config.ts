import * as fs from "fs";
import * as path from "path";

export interface Target {
  name: string;
  cwd: string;
  typecheck?: string;
  build: string;
}

export interface ClaudeReviewConfig {
  enabled: boolean;
  rulesFile: string;
  model: string;
}

export interface AigateConfig {
  targets: Target[];
  claudeReview?: ClaudeReviewConfig;
}

export const CONFIG_FILENAME = "aigate.config.json";

export function configPath(repoRoot: string): string {
  return path.join(repoRoot, CONFIG_FILENAME);
}

export function loadConfig(repoRoot: string): AigateConfig {
  const file = configPath(repoRoot);
  if (!fs.existsSync(file)) {
    throw new Error(
      `${CONFIG_FILENAME} not found in ${repoRoot}. Run "aigate init" first.`
    );
  }
  const raw = fs.readFileSync(file, "utf-8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse ${CONFIG_FILENAME}: ${(err as Error).message}`);
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !Array.isArray((parsed as AigateConfig).targets)
  ) {
    throw new Error(`${CONFIG_FILENAME} must contain a "targets" array.`);
  }
  const targets = (parsed as AigateConfig).targets;
  for (const t of targets) {
    if (!t.name || !t.cwd || !t.build) {
      throw new Error(
        `Each target in ${CONFIG_FILENAME} requires "name", "cwd", and "build".`
      );
    }
  }

  const claudeReview = (parsed as AigateConfig).claudeReview;
  if (claudeReview !== undefined) {
    if (
      typeof claudeReview !== "object" ||
      claudeReview === null ||
      typeof claudeReview.enabled !== "boolean" ||
      typeof claudeReview.rulesFile !== "string" ||
      typeof claudeReview.model !== "string"
    ) {
      throw new Error(
        `"claudeReview" in ${CONFIG_FILENAME} must be an object with "enabled" (boolean), "rulesFile" (string), and "model" (string).`
      );
    }
  }

  return { targets, claudeReview };
}

export function defaultConfig(): AigateConfig {
  return {
    targets: [
      {
        name: "app",
        cwd: ".",
        typecheck: "npx tsc --noEmit",
        build: "npm run build",
      },
    ],
  };
}
