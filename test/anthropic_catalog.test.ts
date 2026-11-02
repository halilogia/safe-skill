import assert from 'node:assert';
import {
  ANTHROPIC_OFFICIAL_SKILLS,
  searchAnthropicSkills,
  getAnthropicSkill,
  generateBuiltinSkillContent
} from '../src/anthropic_catalog.ts';

console.log('🧪 Anthropic Catalog Testleri Başlatılıyor...\n');

// 1. Katalog bütünlüğü
assert.ok(ANTHROPIC_OFFICIAL_SKILLS.length >= 24, 'En az 24 Anthropic becerisi bulunmalı');
console.log(`✔ Toplam ${ANTHROPIC_OFFICIAL_SKILLS.length} Anthropic resmi becerisi yüklendi.`);

// 2. "anthropic" geniş arama testi
const allSkills = searchAnthropicSkills('anthropic');
assert.strictEqual(allSkills.length, ANTHROPIC_OFFICIAL_SKILLS.length, 'Geniş anthropic araması tüm kataloğu dönmeli');
console.log('✔ "anthropic" genel sorgusu tüm kataloğu getirdi.');

// 3. Hedefli aramalar
const frontendMatches = searchAnthropicSkills('frontend');
assert.ok(frontendMatches.some(s => s.id === 'frontend-design'), 'frontend araması frontend-design içermeli');
console.log('✔ "frontend" araması doğrulandı.');

const mcpMatches = searchAnthropicSkills('mcp');
assert.ok(mcpMatches.some(s => s.id === 'mcp-builder'), 'mcp araması mcp-builder içermeli');
console.log('✔ "mcp" araması doğrulandı.');

const dataMatches = searchAnthropicSkills('data');
assert.ok(dataMatches.some(s => s.id === 'data'), 'data araması data içermeli');
console.log('✔ "data" araması doğrulandı.');

const engMatches = searchAnthropicSkills('engineering');
assert.ok(engMatches.some(s => s.id === 'engineering'), 'engineering araması engineering içermeli');
console.log('✔ "engineering" araması doğrulandı.');

// 4. getAnthropicSkill normalizasyon testi
const byRaw = getAnthropicSkill('frontend-design');
assert.ok(byRaw && byRaw.id === 'frontend-design');

const byPrefix = getAnthropicSkill('anthropic:frontend-design');
assert.ok(byPrefix && byPrefix.id === 'frontend-design');

const byNamespace = getAnthropicSkill('anthropics/skills@frontend-design');
assert.ok(byNamespace && byNamespace.id === 'frontend-design');
console.log('✔ İsim normalizasyonları (prefix, namespace, ham isim) doğrulandı.');

// 5. SKILL.md şablon üretimi
const sample = ANTHROPIC_OFFICIAL_SKILLS.find(s => s.id === 'engineering')!;
const sampleMd = generateBuiltinSkillContent(sample);
assert.ok(sampleMd.startsWith('---'), 'Markdown frontmatter ile başlamalı');
assert.ok(sampleMd.includes('name: engineering'), 'name alanı bulunmalı');
assert.ok(sampleMd.includes('Claude Engineering'), 'Başlık bulunmalı');
console.log('✔ Builtin SKILL.md şablon üretimi doğrulandı.');

console.log('\n🎉 TÜM TESTLER BAŞARIYLA GEÇTİ!');
