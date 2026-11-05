# aigate

A git `pre-push` gate for AI-generated code. It runs your typecheck and build before every push and blocks the push if either fails. Optionally, it asks Claude to review the pushed diff against your `CLAUDE.md` rules and prints warnings (never blocks).

[한국어 README](./README.ko.md)

## Why

I build a production app (Next.js + NestJS) mostly with Claude Code. Looking back at the repo's history: **219 commits, 86 of them `fix:`/`revert` commits (39%)**.

I wanted a cheap check between "the agent says it's done" and "it's on the remote", so I wrote the smallest gate I could, then measured retroactively how many of those 86 fixes it would have caught before push:

| | Count |
|---|---|
| Would have been caught by typecheck/build (v0.1) | 8 |
| `CLAUDE.md` violation precisely flagged by the LLM review (v0.2) | 1 of 3 |
| Out of scope (logic bugs, library/env compatibility, UI, infra…) | 75 |
| **Total** | **86** |

**9 of 86.** Not a silver bullet. The deterministic part does most of the work; the LLM review tends to fall back on generic rules when it misses the domain-specific defect. Full methodology, query, and caveats: [RESULTS.md](./RESULTS.md).

## What it does

- **v0.1 — deterministic gate.** On `git push`, runs `typecheck` and `build` for each configured target, in order. Any failure → push blocked, last 40 lines of output printed.
- **v0.2 — rules review (optional).** Sends the diff of the commits being pushed, plus your rules file (e.g. `CLAUDE.md`), to the Claude API. Violations are printed as **warnings only — the push is never blocked**. Skipped silently (with a one-line warning) if there is no API key, the API call fails, or the diff exceeds ~30k tokens.

## Install

Not on npm yet. Build a tarball from source and install it as a devDependency:

```sh
# 1) Build aigate and pack it
git clone https://github.com/youho8445/aigate
cd aigate
npm install
npm run build
npm pack            # produces aigate-<version>.tgz

# 2) Install into your repo
#    Keep the tarball inside the repo (e.g. vendor/) so the relative path
#    resolves on other machines and CI as well.
cd /path/to/your-repo
mkdir -p vendor
cp /path/to/aigate/aigate-<version>.tgz vendor/
npm install --save-dev ./vendor/aigate-<version>.tgz
```

Requires Node.js. Works on macOS/Linux and on Windows with Git for Windows (commands are run through Git's bundled bash; override with `AIGATE_SHELL`).

## Usage

Run from anywhere inside the target repo; the repo root is found by walking up to the nearest `.git`.

| Command | What it does |
|---|---|
| `npx aigate init` | Creates a minimal `aigate.config.json` at the repo root. Leaves an existing one untouched. |
| `npx aigate install` | Installs `.git/hooks/pre-push`. An existing non-aigate hook is backed up to `pre-push.aigate-backup`; an existing aigate hook is refreshed. |
| `npx aigate run` | Runs the gate. The hook calls this; you can also run it manually to check before pushing (v0.2 is skipped when run manually, since there is no push range). |
| `npx aigate uninstall` | Removes the hook and restores the backup if there is one. |

## Configuration (`aigate.config.json`)

```json
{
  "targets": [
    { "name": "backend",  "cwd": ".",        "typecheck": "npx tsc --noEmit", "build": "npm run build" },
    { "name": "frontend", "cwd": "frontend", "typecheck": "npx tsc --noEmit", "build": "npm run build" }
  ],
  "claudeReview": {
    "enabled": true,
    "rulesFile": "CLAUDE.md",
    "model": "claude-sonnet-5"
  }
}
```

| Field | Required | Notes |
|---|---|---|
| `targets[].name` | yes | Label shown in logs |
| `targets[].cwd` | yes | Path relative to repo root (`"."` for the root) |
| `targets[].typecheck` | no | Omit to run build only |
| `targets[].build` | yes | Build command |
| `claudeReview` | no | Omit the whole section to run v0.1 only |
| `claudeReview.enabled` | yes (if section present) | `false` skips v0.2 |
| `claudeReview.rulesFile` | yes (if section present) | Rules file path relative to repo root |
| `claudeReview.model` | yes (if section present) | Claude model ID |

`aigate init` only writes a single-target example. For monorepos or non-`tsc` setups, edit the file yourself. Commands are arbitrary shell commands, so nothing here is TypeScript-specific.

### v0.2 needs `ANTHROPIC_API_KEY`

Set `ANTHROPIC_API_KEY` in the environment where you run `git push`. Without it, v0.2 prints one warning line and is skipped. The push is never blocked by v0.2, whatever happens.

## Limitations

- **Local gate, not enforcement.** `git push --no-verify` skips the hook entirely. This catches honest mistakes; it does not stop someone (or an agent) who bypasses it. For enforcement, run the same checks in CI.
- **The LLM review is a judgment call.** Expect both false positives (generic warnings) and false negatives (missing the specific violation). In the retroactive test it warned on 3/3 diffs but hit the intended violation in only 1/3.
- **It only sees what compiles and what's in the diff.** Runtime behavior, deploy/infra issues and logic bugs (the 75 above) are out of reach.
- Targets run sequentially; on a large repo every push can take minutes.
- Multi-ref pushes: v0.2 reviews only the first ref.

## License

MIT — see [LICENSE](./LICENSE).
