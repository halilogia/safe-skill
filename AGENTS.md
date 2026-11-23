# AGENTS.md — safe-skill

Instructions for any agent working in this repository.

## Read Order

1. `README.md` — what the tool promises.
2. `ARCHITECTURE.md` — module boundaries and the security gate flow.
3. `DESIGN.md` — terminal output and TUI visual rules.
4. `KNOWLEDGE.md` — decisions and known failure modes before touching scanner rules.
5. `TASKS.md` — what is actually done vs. planned.

## Commands

```bash
npm test                                   # full suite (node --test)
npm test -- test/security_scanner.test.ts  # one module
npm start                                  # run the CLI (TUI)
npx safe-skill scan .                       # self-scan smoke test
```

No build step, no install step beyond `npm i` for tooling. Node ≥ 22.6 required.

## Hard Rules

- **Never weaken the gate** to make a skill install. Narrow the rule and add a negative test instead.
- **No new runtime dependency.** Prefer `node:fs`, `node:path`, `node:crypto`, `node:readline`.
- **No `catch {}`.** Log with context or rethrow. Silent failure in a security tool is a vulnerability.
- **Deterministic verdicts.** No network access inside `scan`, `passport`, or `check`.
- **Stage before promote.** Do not write into `.claude/`, `.cursor/`, or `~/.gemini/` before a clean scan.
- **Raw-byte hashing.** Never normalize line endings before computing SHA-256.
- **stdout is protocol.** The MCP server writes JSON-RPC to stdout; all logs go to stderr.

## Editing Conventions

- One responsibility per module. If a file grows past ~200 lines, split it and say what moved.
- TypeScript only; `import type` for type-only imports (type stripping strips them at runtime).
- Add a test in `test/` for every behavior change. Rule changes need a positive *and* a negative case.
- Match existing naming: `cmdX` for commands, `scanX` / `verifyX` / `generateX` for operations.
- Comments explain *why*, not *what*. No decorative banners.

## Module Map

| File | Touch it when |
| :--- | :--- |
| `src/cli.ts` | Adding a command or changing output format |
| `src/security_scanner.ts` | Adding/changing detection rules |
| `src/skill_passport.ts` | Changing manifest fields or hashing |
| `src/security_advisories.ts` | Adding a known-bad source |
| `src/ecosystem_targets.ts` | Supporting a new agent ecosystem |
| `src/update_checker.ts` | Changing update discovery or apply policy |
| `src/dependency_doctor.ts` | Adding a checked binary |
| `src/intent_matcher.ts` | Tuning intent scoring |
| `src/anthropic_catalog.ts` | Curating official skill metadata |
| `src/mcp_server.ts` | Adding an MCP tool |
| `src/interactive_tui.ts` | Changing menu behavior |

## Definition of Done

`npm test` green · `scan .` clean · docs updated if a public surface changed · no line-ending drift.

## Out of Scope

Executing third-party skill code, hosting skill content, and any change that hides findings from the user.
