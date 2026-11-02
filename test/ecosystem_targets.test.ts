import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTargetInstallPath, adaptContentForTarget, detectEcosystem } from '../src/ecosystem_targets.ts';

test('ecosystem_targets - path resolution', () => {
  const claudeRes = resolveTargetInstallPath({
    ecosystem: 'claude',
    skillName: 'safe-git',
    scope: 'workspace',
    cwd: 'C:/mock/project'
  });
  assert.equal(claudeRes.ecosystem, 'claude');
  assert.match(claudeRes.targetFile, /\.claude[\\\/]skills[\\\/]safe-git[\\\/]SKILL\.md$/);
  assert.equal(claudeRes.isCursorRule, false);

  const cursorRes = resolveTargetInstallPath({
    ecosystem: 'cursor',
    skillName: 'safe-git',
    scope: 'workspace',
    cwd: 'C:/mock/project'
  });
  assert.equal(cursorRes.ecosystem, 'cursor');
  assert.match(cursorRes.targetFile, /\.cursor[\\\/]rules[\\\/]safe-git\.mdc$/);
  assert.equal(cursorRes.isCursorRule, true);

  const agyRes = resolveTargetInstallPath({
    ecosystem: 'antigravity',
    skillName: 'safe-git',
    scope: 'workspace',
    cwd: 'C:/mock/project'
  });
  assert.equal(agyRes.ecosystem, 'antigravity');
  assert.match(agyRes.targetFile, /\.gemini[\\\/]skills[\\\/]safe-git[\\\/]SKILL\.md$/);
});

test('ecosystem_targets - adaptContentForTarget for cursor .mdc', () => {
  const original = `---
name: sample-skill
description: Performs safe git operations
---

# Instruction
Always be safe.`;

  const cursorAdapted = adaptContentForTarget(original, 'cursor', 'sample-skill');
  assert.ok(cursorAdapted.includes('description: Performs safe git operations'));
  assert.ok(cursorAdapted.includes('globs: "*"'));
  assert.ok(cursorAdapted.includes('alwaysApply: false'));
  assert.ok(cursorAdapted.includes('# Instruction'));

  const claudeAdapted = adaptContentForTarget(original, 'claude', 'sample-skill');
  assert.equal(claudeAdapted, original);
});
