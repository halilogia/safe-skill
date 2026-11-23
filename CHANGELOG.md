# Changelog

All notable changes to `safe-skill`. Format follows Keep a Changelog; versions follow SemVer.

## [Unreleased]

### Planned
- AST-based scan pass for JS/TS skill scripts
- ed25519 signature layer above SHA-256

## [1.1.0] — 2026-11-23

### Added
- **Autonomous Workflow Radar (`discover`):** Multi-source parallel discovery across `skills.sh`, GitHub `SKILL.md` code index, GitHub repositories, and Hacker News `Show HN`, with 6 domain presets (`3d`, `pixel-vfx`, `audio-sfx`, `shader`, `gamedev`, `video`) in `src/workflow_discovery.ts`.
- **Real Community & URL Install:** `install owner/repo@skill`, `owner/repo`, GitHub URLs, and X/Twitter posts fetch authentic `SKILL.md` or synthesize from `README.md`/posts, staged through S0/S1 security gate (`--dry-run` supported).
- **6-Agent Ecosystem Routing:** Added Windsurf (`.windsurf/rules/*.md`), GitHub Copilot (`.github/instructions/*.instructions.md`), and OpenAI Codex (`.codex/skills/*/SKILL.md`) targets in `src/ecosystem_targets.ts`.
- **S0/S1 Rule Depth:** Added long Base64 decode payload detection and MCP configuration poisoning (`mcp_config.json`) rules in `src/security_scanner.ts`.
- **CI JSON Output & HF Search:** Added `--json` output on `scan`, `check`, `doctor`, `advisories`, `discover`, and `dataset` (`src/huggingface_search.ts`).
- **MCP Tool Expansion:** Added `discover_workflows` tool and remote `install_safe_skill` support in `src/mcp_server.ts` (9 tools total).

## [1.0.0] — 2026-02-14

### Added
- **Security gate (S0/S1):** static regex engine covering `PROMPT_INJECTION`, `DANGEROUS_COMMAND`, `EXFILTRATION`, `DESTRUCTIVE`, `HIDDEN_CONTENT` with `CRITICAL`/`HIGH`/`MEDIUM` severities.
- **Integrity sealing:** `passport.json` with per-file SHA-256 and byte size; `check` re-hashes to detect tampering (TOCTOU).
- **Ecosystem targets:** Claude Code (`./.claude/skills/`, `~/.claude/skills/`), Cursor (`./.cursor/rules/*.mdc`), Google Antigravity (`~/.gemini/config/skills/`), with per-target content adaptation.
- **Project analysis:** tech detection and curated skill matching for Node, Python, Godot, Rust, Android, MCP.
- **Safe upstream sync:** `check` and `update` re-run the gate before promoting a new version.
- **Dependency doctor:** verifies `python`, `node`, `git`, `gh`, `patent`, `ffmpeg`, `yt-dlp`, `deno`.
- **Threat advisories:** built-in blocklist of known-malicious repos and exfiltration payloads.
- **Semantic intent matcher:** maps natural-language requests to candidate skills.
- **Built-in MCP server:** STDIO JSON-RPC 2.0 with 8 tools for agent-native use.
- **Interactive TUI:** zero-dependency terminal menu.
- **Official catalog:** offline Anthropic skill metadata plus SKILL.md generation.

### Changed
- CLI commands unified behind a single `main()` router with numeric exit codes.
- Node engine raised to `>=22.6.0` to use `--experimental-strip-types` (no build step).

### Fixed
- Install promotion is staged so a blocked skill cannot partially land in a target directory.

## [0.1.0] — 2026-01-20

### Added
- Initial commit: scanner skeleton, passport writer, CLI bootstrap.
