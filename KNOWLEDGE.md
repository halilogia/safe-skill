# Knowledge Base — safe-skill

Durable decisions and gotchas. Read before changing scanner rules or install flow.

## 1. Design Decisions

**Zero dependencies.** No runtime `dependencies` block. Fast `npx` cold start and no supply chain of our own — ironic to ship a security tool with 40 transitive packages. Anything added must justify itself against plain `node:` APIs.

**No build step.** `--experimental-strip-types` runs `.ts` directly. Consequence: no enums, no decorators, no `namespace`, no runtime type imports. Use `import type` for type-only imports.

**Regex gate, not a sandbox.** The scanner is a *triage* layer that stops known-bad patterns. It is not a sandbox and must never be described as one. Defense in depth: gate + passport + advisories + human review.

**Deterministic verdicts.** The gate performs no network calls. Same bytes in, same findings out. Any remote feed must be cached and signed before it can affect a verdict.

**Staging before promotion.** Installs land in a temp directory, get scanned, then move into the target. Never write to `.claude/`, `.cursor/`, or `~/.gemini/` before a pass.

**Passport is per-file.** A directory-level hash hides which file changed. Per-file SHA-256 lets `check` name the tampered file.

## 2. Platform Notes

- **Windows:** paths come from `os.homedir()`; never hardcode `/`. Prefer `path.join`. PowerShell is the shell — no bash-only syntax in scripts.
- **CRLF:** hash the bytes as written. Do not normalize line endings before hashing, or passports break across platforms.
- **Case sensitivity:** NTFS is case-insensitive, ext4 is not. Compare skill names case-insensitively; compare paths as-is.
- **Symlinks:** hash the resolved target; skip broken links and report them as `SCAN_ERROR`, never as clean.

## 3. Scanner Rules — Maintenance

1. A rule needs: regex, human description, severity, category.
2. Prefer narrow patterns. `rm -rf /` is a rule; `rm ` is noise that trains users to ignore output.
3. Add the test first (`test/security_scanner.test.ts`), including a negative case that must stay clean.
4. `CRITICAL` blocks. `HIGH` blocks. `MEDIUM` warns only. Do not reclassify to reduce friction.
5. Never build a regex from unescaped user input — regex injection is a real bypass.

## 4. Common Failure Modes

| Symptom | Likely cause | Fix |
| :--- | :--- | :--- |
| Passport fails after `git clone` | line-ending conversion | add `.gitattributes` or re-seal |
| `check` reports every file changed | hash over normalized text | hash raw bytes |
| Install blocked on a benign skill | pattern too broad | narrow the rule + add negative test |
| `.mdc` renders empty in Cursor | missing frontmatter adaptation | check `adaptContentForTarget` |
| MCP server exits immediately | non-JSON on stdout | log to stderr only |
| Tests pass locally, fail in CI | Node 22 vs 24 loader differences | keep engines accurate, test both |

## 5. Verification Recipe

```bash
npm test                          # full suite, node --test
npm test -- test/security_scanner.test.ts   # single module
npx tsx bin/safe-skill.ts scan .   # self-scan must be clean
```

Self-scan is the smoke test: the repo's own docs and sources must never trip the gate. If they do, either the rule is too broad or the content is genuinely risky.

## 6. Vocabulary

- **S0** — content-level threat (injection, hidden instructions).
- **S1** — action-level threat (commands, exfiltration, destruction).
- **Passport** — signed-by-hash manifest of an installed skill.
- **Seal** — write the passport after a clean scan.
- **Verify** — recompute hashes and compare; detects TOCTOU drift.
- **Block** — refuse install/update and leave the target untouched.
