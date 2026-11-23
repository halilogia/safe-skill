# Roadmap — safe-skill

Versioned by milestone. Shipped items stay visible to keep scope honest.

## v1.0 — Security Baseline ✅ (current)

- [x] S0/S1 static gate: prompt injection, destructive commands, exfiltration, hidden content
- [x] SHA-256 `passport.json` sealing + TOCTOU integrity verification
- [x] Multi-ecosystem targets: Claude Code, Cursor (`.mdc`), Google Antigravity
- [x] Project stack detection (Node, Python, Godot, Rust, Android, MCP)
- [x] `scan`, `install`, `check`, `update`, `doctor`, `search`, `match`, `advisories`, `passport`
- [x] Zero-dependency interactive TUI
- [x] Native STDIO MCP server (JSON-RPC 2.0, 8 tools)
- [x] CI on Node 22.x / 24.x

## v1.1 — Rule Depth & Autonomous Discovery ✅

- [x] Autonomous Workflow Radar (`discover` across `skills.sh`, GitHub, Hacker News)
- [x] Real community `install` (`owner/repo@skill`, GitHub/X URLs) with staged S0/S1 gate
- [x] Base64 payload & MCP config poisoning detection
- [x] `--json` output on `scan`, `check`, `doctor`, `advisories`, `discover`, `dataset`
- [x] Windsurf, VS Code Copilot instructions & Codex target adapters
- [ ] AST pass for JS/TS skill scripts (currently regex-only)
- [ ] Severity thresholds configurable via `safe-skill.config.json`

## v1.2 — Supply Chain

- [ ] Signature (minisign/ed25519) on top of SHA-256
- [ ] Upstream diff view before applying `update`
- [ ] Advisory feed fetched from a signed remote index, cached offline
- [ ] Rollback snapshot of the previous installed version
- [ ] `safe-skill audit` aggregate report across all installed skills

## v1.3 — Ecosystem Breadth

- [ ] Windsurf target adapter
- [ ] VS Code Copilot instructions target
- [ ] Skill dependency graph (skills that call other skills)
- [ ] `doctor --fix` for installable missing binaries (opt-in)
- [ ] Turkish-localized advisories and help text

## Non-Goals

- Hosting or mirroring third-party skill content
- Executing skill scripts on the user's behalf
- Becoming a package registry — discovery stays catalog + intent matching

## Principles

1. Security verdicts are deterministic and offline.
2. Every new rule ships with a failing-then-passing test.
3. No feature that silently weakens the gate, including convenience flags.
