# Tasks — safe-skill

Living checklist. `[x]` verified against code or a passing test, not intent.

## Now

- [x] S0/S1 scanner with six finding categories and three severities
- [x] SHA-256 passport write/load/verify (`skill_passport.ts`)
- [x] Ecosystem routing for Claude Code, Cursor, Antigravity
- [x] Safe update path that re-gates upstream content
- [x] Dependency doctor for eight external binaries
- [x] Built-in MCP server with 8 tools over STDIO
- [x] Intent matcher and offline Anthropic catalog
- [x] Interactive TUI with no dependencies
- [x] CI matrix on Node 22.x / 24.x
- [x] `--json` flag on `scan`, `check`, `doctor`, `advisories`, `discover`, `dataset`
- [x] Base64/obfuscated payload & MCP config poisoning detection
- [x] Autonomous Workflow Radar (`discover`) & real community `install`
- [x] Windsurf, Copilot instructions & Codex targets in `ecosystem_targets.ts`
- [ ] Ruleset versioning in `passport.json`

## Next

- [ ] AST pass for `.js` / `.ts` skill scripts (reduce regex false negatives)
- [ ] Upstream diff preview before `update` applies
- [ ] Rollback snapshot of the prior installed version
- [ ] `safe-skill audit` aggregate report across installed skills
- [ ] Config file (`safe-skill.config.json`) for severity thresholds
- [ ] Advisory index fetched from a signed remote, cached offline

## Later

- [ ] ed25519 signature layer above SHA-256
- [ ] Windsurf and Copilot-instructions targets
- [ ] Skill dependency graph
- [ ] Turkish-localized help and advisory text
- [ ] `doctor --fix` for opt-in binary installation

## Housekeeping

- [ ] Trim `src/cli.ts` (≈820 lines) into command modules — currently above the 200-line guideline
- [ ] Keep every doc under 200 lines; check before commit
- [ ] Add `.gitattributes` to pin line endings for reproducible hashes
- [ ] Document exit codes in README

## Definition of Done

1. Change is covered by a test in `test/`.
2. `npm test` is green on Node 22 and 24.
3. `scan .` on the repo itself is clean.
4. Docs updated when a public command or data shape changes.
5. No new runtime dependency without a written justification.
