# AGENTS.md

## Project docs

- Build, run, verify: `docs/running.md` — the three commands, the boot pitfalls, environment variables, and why the sandbox is fully open.
- Upgrade history: `docs/dsh-upgrades.md` — what each dsh version changed, and how it was verified.
- Why it is built this way: `docs/adr/` — read before changing the profile, the sandbox mode, or the dsh-ops patch.
- Model-facing PTC usage: `skill/SKILL.md` (installed at `~/.workbuddy/skills/wbptc/`).
- Tool signatures a program may call: `mcp/tools-sdk.md` (generated; never hand-edit).
- Regression check: `bash scripts/check.sh` after touching `profile/` or `runner/`.

## Conventions

- Long text goes in files: multi-line code or regexes go to a script file (`.scratch/` or `scripts/`) and run from there; commit messages go through `git commit -F <file>`; the same applies to any command whose text must name `pwsh` or `cmd.exe`.
- Reading content goes through the Grep/Read tools; bash stays for execution. A shell command whose text merely *mentions* `pwsh`, `cmd.exe` or `PowerShell` is rejected by the filter, even when it only searches text.
- Paths handed to Node are repo-relative or `pwd -W` (Windows form). MSYS paths (`/d/...`) stay inside the shell: `require`/`fs` fail on them, and a `2>/dev/null || echo` fallback turns that into a silent wrong value.
- Try the smallest experiment first: when an outside app's behaviour is unclear, run a minimal probe — a one-shot launch under an empty environment beats reading its packaged code.

## Agent skills

### Issue tracker

Issues and specs for this repo live as GitHub issues on `eggacheb/WorkbuddyPTC`, operated through the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, each label string equal to its role name. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: one `GLOSSARY.md` plus `docs/adr/` at the repo root. See `docs/agents/domain.md`.
