import test from 'node:test';
import assert from 'node:assert/strict';
import { matchUserIntent } from '../src/intent_matcher.ts';

test('intent_matcher - maps frontend prompt to frontend-design skill', () => {
  const matches = matchUserIntent('modern UI responsive tailwind ve css arayuz tasarimi');
  assert.ok(matches.length > 0);
  const topMatch = matches[0];
  assert.ok(
    topMatch.skill.id === 'frontend-design' || topMatch.skill.id === 'web-artifacts-builder',
    `Expected frontend-design or web-artifacts-builder, got: ${topMatch.skill.id}`
  );
  assert.ok(topMatch.score > 20);
});

test('intent_matcher - maps mcp protocol prompt to mcp-builder', () => {
  const matches = matchUserIntent('MCP stdio protocol tools ve server gelistirmek istiyorum');
  assert.ok(matches.length > 0);
  const found = matches.find((m) => m.skill.id === 'mcp-builder');
  assert.ok(found, 'Should find mcp-builder in matches');
});

test('intent_matcher - limits results to requested count', () => {
  const matches = matchUserIntent('web test ve gelistirme', 2);
  assert.ok(matches.length <= 2);
});
