import test from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../src/cli.ts';

test('cli - --help returns code 0', async () => {
  const code = await main(['--help']);
  assert.equal(code, 0);
});

test('cli - search query returns code 0', async () => {
  const code = await main(['search', 'frontend']);
  assert.equal(code, 0);
});

test('cli - invalid command returns error code 1', async () => {
  const code = await main(['nonexistent-command-xyz']);
  assert.equal(code, 1);
});
