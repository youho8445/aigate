import * as fs from "fs";
import * as path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { ClaudeReviewConfig } from "./config";
import { computeDiffRange, getDiffText, readPushRefFromStdin } from "./gitDiff";

const DIFF_TOKEN_LIMIT = 30000;

const VIOLATION_SCHEMA = {
  type: "object",
  properties: {
    violations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          rule: { type: "string", description: "Which CLAUDE.md rule or section is violated" },
          file: { type: "string", description: "File path (from the diff) where the violation appears" },
          evidence: { type: "string", description: "The specific diff line or snippet showing the violation" },
        },
        required: ["rule", "file", "evidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["violations"],
  additionalProperties: false,
} as const;

interface ViolationResult {
  violations: { rule: string; file: string; evidence: string }[];
}

/**
 * v0.2: warns on CLAUDE.md rule violations in the pushed diff. This step
 * NEVER blocks the push and NEVER throws past its own boundary — any
 * failure (missing key, network error, oversized diff, parse error) is
 * reported as a warning and the function returns normally.
 */
export async function runClaudeReview(
  repoRoot: string,
  reviewConfig: ClaudeReviewConfig | undefined
): Promise<void> {
  if (!reviewConfig || !reviewConfig.enabled) return;

  try {
    await runClaudeReviewUnsafe(repoRoot, reviewConfig);
  } catch (err) {
    console.warn(
      `aigate: CLAUDE.md review failed unexpectedly (${errorMessage(err)}) — skipped (push not blocked).`
    );
  }
}

async function runClaudeReviewUnsafe(
  repoRoot: string,
  reviewConfig: ClaudeReviewConfig
): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("aigate: ANTHROPIC_API_KEY not set — skipped CLAUDE.md review.");
    return;
  }

  const rulesPath = path.join(repoRoot, reviewConfig.rulesFile);
  if (!fs.existsSync(rulesPath)) {
    console.warn(`aigate: ${reviewConfig.rulesFile} not found — skipped CLAUDE.md review.`);
    return;
  }
  const rulesContent = fs.readFileSync(rulesPath, "utf-8");

  const pushRef = readPushRefFromStdin();
  if (!pushRef) {
    console.warn(
      "aigate: no push ref info on stdin (not invoked via git push) — skipped CLAUDE.md review."
    );
    return;
  }

  const rangeResult = computeDiffRange(repoRoot, pushRef);
  if (!rangeResult.ok) {
    console.warn(`aigate: ${rangeResult.reason} — skipped CLAUDE.md review.`);
    return;
  }

  const diffText = getDiffText(repoRoot, rangeResult.range);
  if (diffText === null) {
    console.warn("aigate: failed to compute push diff — skipped CLAUDE.md review.");
    return;
  }
  if (diffText.trim().length === 0) {
    return;
  }

  const promptText = buildPrompt(rulesContent, diffText);
  const client = new Anthropic({ apiKey });

  let inputTokens: number;
  try {
    const counted = await client.messages.countTokens({
      model: reviewConfig.model,
      messages: [{ role: "user", content: promptText }],
    });
    inputTokens = counted.input_tokens;
  } catch (err) {
    console.warn(`aigate: token count failed (${errorMessage(err)}) — skipped CLAUDE.md review.`);
    return;
  }

  if (inputTokens > DIFF_TOKEN_LIMIT) {
    console.warn(
      `aigate: diff too large (${inputTokens} tokens > ${DIFF_TOKEN_LIMIT}), skipped CLAUDE.md review.`
    );
    return;
  }

  let response;
  try {
    // No temperature/top_p/top_k, no thinking override: claude-sonnet-5
    // rejects non-default sampling params, and adaptive thinking is already
    // the default when "thinking" is omitted.
    response = await client.messages.create({
      model: reviewConfig.model,
      max_tokens: 4096,
      output_config: { format: { type: "json_schema", schema: VIOLATION_SCHEMA } },
      messages: [{ role: "user", content: promptText }],
    });
  } catch (err) {
    console.warn(`aigate: Claude API call failed (${errorMessage(err)}) — skipped CLAUDE.md review.`);
    return;
  }

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!textBlock) {
    console.warn("aigate: Claude review returned no text output — skipped.");
    return;
  }

  let parsed: ViolationResult;
  try {
    parsed = JSON.parse(textBlock.text) as ViolationResult;
  } catch (err) {
    console.warn(`aigate: failed to parse Claude review response (${errorMessage(err)}) — skipped.`);
    return;
  }

  if (!parsed.violations || parsed.violations.length === 0) {
    console.log("aigate: CLAUDE.md review — no violations detected.");
    return;
  }

  console.warn(
    `\naigate: CLAUDE.md rule violations detected (warning only — push is NOT blocked):`
  );
  for (const v of parsed.violations) {
    console.warn(`  - [${v.rule}] ${v.file}: ${v.evidence}`);
  }
}

function buildPrompt(rulesContent: string, diffText: string): string {
  return [
    "You are reviewing a git diff for compliance with this project's CLAUDE.md development rules.",
    "",
    "<claude_md>",
    rulesContent,
    "</claude_md>",
    "",
    "<diff>",
    diffText,
    "</diff>",
    "",
    "List any violations of the CLAUDE.md rules directly evidenced in the diff above.",
    "Do not speculate about code that is not shown in the diff.",
    'If there are no violations, return {"violations": []}.',
  ].join("\n");
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
