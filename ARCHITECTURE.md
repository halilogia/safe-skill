# Architecture — safe-skill

Security-first skill manager for agent ecosystems (Claude Code, Cursor, Google Antigravity).
Zero runtime dependencies, Node ≥ 22.6 with native TypeScript stripping (`--experimental-strip-types`).

## 1. Layered Flow

```
bin/safe-skill.ts            entry → main()
  └─ src/cli.ts              command router + project analysis
       ├─ security_scanner   S0/S1 static gate (regex families)
       ├─ skill_passport     SHA-256 sealing + TOCTOU verification
       ├─ security_advisories  known-malicious blocklist
       ├─ ecosystem_targets  target path resolution + content adapters
       ├─ update_checker     safe upstream sync
       ├─ dependency_doctor  binary/runtime health
       ├─ intent_matcher     prompt → skill semantic matcher
       ├─ anthropic_catalog  official skill catalog (built-in, no network)
       ├─ interactive_tui    zero-dependency terminal menu
       └─ mcp_server         STDIO JSON-RPC 2.0 server (8 tools)
```

Dependency direction is strictly one-way: `bin → cli → modules`. No module imports `cli`.

## 2. Module Responsibilities

| Module | Owns | Must not |
| :--- | :--- | :--- |
| `security_scanner.ts` | Pattern rules, severity, findings | Perform I/O writes, decide install policy |
| `skill_passport.ts` | Hashing, passport read/write | Scan content |
| `security_advisories.ts` | Advisories, blocklist matching | Execute updates |
| `ecosystem_targets.ts` | Paths, ecosystem detection, `.mdc` adaptation | Scan or hash |
| `update_checker.ts` | Update discovery, gated apply | Own scanning rules |
| `dependency_doctor.ts` | Tool detection and version check | Mutate system state |
| `intent_matcher.ts` | Keyword/intent scoring | Read the filesystem |
| `anthropic_catalog.ts` | Static catalog + generated SKILL.md | Network calls |
| `workflow_discovery.ts` | Multi-source discovery + staged remote install | Bypass security gate |
| `huggingface_search.ts` | Hugging Face dataset/model search | Execute remote code |
| `mcp_server.ts` | Tool schemas, JSON-RPC loop | Contain business rules |
| `cli.ts` | Orchestration, output, exit codes | Hold scanner regexes |

## 3. Security Gate (S0/S1)

1. **Collect** — walk the skill directory, skip binaries by extension.
2. **Scan** — six categories: `PROMPT_INJECTION`, `DANGEROUS_COMMAND`, `EXFILTRATION`, `DESTRUCTIVE`, `HIDDEN_CONTENT`, `SCAN_ERROR`.
3. **Decide** — `CRITICAL`/`HIGH` blocks install or update; findings always print with file + severity.
4. **Seal** — on pass, `passport.json` records per-file SHA-256 + size.
5. **Verify** — `check` recomputes hashes; mismatch ⇒ tamper alert (TOCTOU).

Installs are staged, scanned, then promoted. A blocked skill never lands in the target directory.

## 4. Data Contracts

- `SecurityFinding` — `{ severity, category, file, line, description }`
- `ScanResult` — findings + aggregate verdict
- `SkillPassport` — `{ name, source, installedAt, files: [{ path, sha256, bytes }], allowedTools }`
- `SkillUpdateStatus` — `{ dir, name, currentVersion, upstreamVersion, state }`

Shapes are declared once at the top of their module; consumers import the type, never re-declare.

## 5. Extension Points

- **New rule** → add to the relevant pattern array in `security_scanner.ts`; add a unit test.
- **New ecosystem** → extend `AgentEcosystem`, add a case in `resolveTargetInstallPath` + `adaptContentForTarget`.
- **New command** → write `cmdX` in `cli.ts` (thin), wire it in the router, add `test/cli.test.ts` coverage.
- **New MCP tool** → add schema to `MCP_TOOLS` and a handler branch in `handleToolCall`.

## 6. Engineering Constraints

- File limit: 200 lines of documentation, modules split by responsibility.
- No `catch {}`; every failure is printed with context or rethrown.
- Deterministic scanning: no network in the gate, no randomness in verdicts.
- Tests: `node --test`; one file per module in `test/`.
