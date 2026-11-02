import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const binPath = path.resolve(__dirname, '..', 'bin', 'safe-skill.ts');

test('safe-skill CLI bin - prints help message with exit code 0', () => {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', binPath, '--help'], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10000
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /SAFE-SKILL: The Security-First Multi-Agent Skill Manager/);
  assert.match(result.stdout, /Kullanım:/);
});

test('safe-skill CLI bin - returns exit code 1 on unknown command', () => {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', binPath, 'unknown-test-cmd-xyz'], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10000
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr + result.stdout, /bilinen bir komut veya var olan bir dizin değil/);
});

test('safe-skill CLI bin - search execution succeeds with exit code 0', () => {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', binPath, 'search', 'frontend'], {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 15000
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /BECERİ ARAMASI/);
  assert.match(result.stdout, /frontend-design/);
});
