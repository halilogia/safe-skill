---
name: safe-skill
version: 1.0.0
theme:
  mode: dark
  palette:
    canvas: "#0B0D10"
    surface: "#141A23"
    borderSubtle: "#232B38"
    primaryAccent: "#38BDF8"
    textMain: "#E6EAF2"
    textMuted: "#8B95A7"
    success: "#34D399"
    danger: "#F87171"
  terminal:
    reset: "\u001b[0m"
    dim: "\u001b[2m"
    bold: "\u001b[1m"
    accent: "\u001b[36m"
    ok: "\u001b[32m"
    warn: "\u001b[33m"
    fail: "\u001b[31m"
typography:
  family:
    mono: "JetBrains Mono, ui-monospace, SFMono-Regular, monospace"
    ui: "Inter, system-ui, -apple-system, sans-serif"
  sizes:
    display: 24px
    heading: 18px
    body: 14px
    caption: 12px
  numbers:
    feature: tabular-nums
    weight: 500
spacing:
  unit: 4px
  scale: [0, 4, 8, 12, 16, 24, 32, 48]
radii:
  sm: 4px
  md: 8px
  lg: 12px
---

# Design Specification — safe-skill

## 1. Visual Atmosphere & Philosophy

**A checkpoint, not a dashboard.** The interface exists to answer one question fast: *is this skill safe to install?* Everything that does not serve that answer is removed.

The mood is quiet instrumentation — a border control terminal, not a hacker movie. Dark canvas, one cool accent, and colour reserved for verdicts. Red is never decoration; it means the gate blocked something.

**Three principles**

1. **Verdict before detail.** The result line (`BLOCKED`, `CLEAN`, `TAMPERED`) appears before any finding list. A user should be able to stop reading after line one.
2. **Density over decoration.** Monospace alignment, no ASCII art in output paths, no progress spinners that outlive the work. Boxes only for grouping, drawn with `─│┌┐└┘` at 1px weight.
3. **Silence is a feature.** Zero output on success unless something changed. No banners on every command; the TUI banner belongs only to the interactive entry.

**Motion.** None in output. The TUI may animate a single-line cursor but never a spinner that implies work it is not doing. Latency is communicated by the result, not by theatre.

**Tone.** Second person, present tense, no exclamation marks, no emoji in machine-readable output. Errors state the fact, the file, and the next action.

## 2. Component Guidelines

**Verdict badge** — the anchor of every report.

```
✔ CLEAN      safe-skill@1.0.0  14 files   sealed
✖ BLOCKED    3 critical, 1 high   not installed
⚠ TAMPERED   passport mismatch   2 files changed
```

Uppercase label, 12px mono, `success` / `danger` / `warn` only. Left-aligned with a two-space gutter after the glyph.

**Finding row** — `severity · category · file:line`. Severity column fixed at 8 characters so rows align. Description on the next line, indented 2 spaces, `textMuted`. Never truncate a finding; a hidden finding is a broken finding.

**Command result** — one summary line, then optional detail block indented 2 spaces. Exit code carries the same truth as the text; they must never disagree.

**Table** — header `textMuted` uppercase 12px, hairline separator in `borderSubtle`, body `textMain` 14px. Numbers right-aligned with `tabular-nums`. Cap at terminal width; wrap descriptions rather than clipping columns.

**TUI menu** — numbered list, no cursor-jumping redraw. Selected item marked with `›` and `primaryAccent`; unselected items stay `textMuted`. One-line description per item. `q` always exits, `Ctrl+C` always exits cleanly.

**Card / panel** — `surface` background, 1px `borderSubtle`, `radii.md`. Used only for grouped diagnostics (doctor, advisories). No shadows, no gradients.

**MCP responses** — pure data. No colour, no box drawing, no glyphs. The protocol consumer is a program.

## 3. Do's & Don'ts

**Do**

- Lead with the verdict; details support it.
- Keep colour semantic: green = passed, red = blocked, amber = warning, cyan = action.
- Align columns with monospace widths, not tabs.
- Print the file path and line number for every finding.
- State the exact next command when something fails.
- Keep contrast at or above 4.5:1 for body text against `canvas`.

**Don't**

- Don't use red for branding, highlights, or "important" labels.
- Don't print a success banner when nothing happened.
- Don't animate loading states that could be a single blocking line.
- Don't hide findings behind `--verbose`; gate output is complete by default.
- Don't mix glyph sets — one family (`✔ ✖ ⚠ › ·`) across all output.
- Don't emit colour when `NO_COLOR` is set or stdout is not a TTY.
- Don't render partial verdicts: if the scan errored, say `SCAN_ERROR`, never `CLEAN`.
- Don't exceed 100 columns; wrap at 80 for finding descriptions.
