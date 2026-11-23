import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { scanSkillDirectory, type ScanResult } from './security_scanner.ts';
import { checkSecurityAdvisories, type AdvisoryCheckResult } from './security_advisories.ts';
import {
  resolveTargetInstallPath,
  adaptContentForTarget,
  detectEcosystem,
  type AgentEcosystem
} from './ecosystem_targets.ts';
import { generateSkillPassport, saveSkillPassport } from './skill_passport.ts';

const execFileAsync = promisify(execFile);

export const WORKFLOW_DOMAINS: Record<string, string[]> = {
  'pixel-vfx': ['pixel vfx', 'pixelfx', 'procedural pixel art', 'sprite sheet generator'],
  '3d': ['procedural 3d', 'blender mcp', '3d foliage', 'gltf generator'],
  'audio-sfx': ['sound effects', 'sfxr', 'procedural audio', 'game audio generator'],
  'shader': ['godot shader', 'glsl vfx', 'procedural shader'],
  'gamedev': ['godot mcp', 'game asset pipeline', 'gamedev skills'],
  'video': ['ffmpeg workflow', 'remotion video', 'ai video pipeline']
};

export type DiscoveryKind = 'SKILL_MD' | 'AGENT_TOOL' | 'WORKFLOW_REPO' | 'SHOW_HN';

export interface DiscoveredWorkflow {
  id: string;
  title: string;
  kind: DiscoveryKind;
  source: 'skills.sh' | 'github-skill' | 'github-repo' | 'hacker-news';
  url: string;
  description: string;
  popularityLabel: string;
  score: number;
  installCmd: string;
}

export interface DiscoverOptions {
  domain?: string;
  limit?: number;
}

export interface SynthesizedSkill {
  skillName: string;
  sourceUrl: string;
  detectedStack: string[];
  content: string;
  synthesized: boolean;
}

export interface InstallRemoteResult {
  ok: boolean;
  blocked: boolean;
  skillName: string;
  sourceUrl: string;
  synthesized: boolean;
  scanResult: ScanResult;
  advisoryResult: AdvisoryCheckResult;
  installedPath?: string;
  passportSha256?: string;
  previewContent?: string;
  error?: string;
}

const STACK_KEYWORDS: { pattern: RegExp; label: string }[] = [
  { pattern: /\bblender\b/i, label: 'Blender' },
  { pattern: /\bgodot\b/i, label: 'Godot 4' },
  { pattern: /\bunity\b/i, label: 'Unity' },
  { pattern: /\bmeshy(?:\s*ai)?\b/i, label: 'Meshy AI' },
  { pattern: /\bpixelfx\b/i, label: 'pixelfx' },
  { pattern: /\bffmpeg\b/i, label: 'FFmpeg' },
  { pattern: /\bshader\b|\bglsl\b/i, label: 'Shader/GLSL' },
  { pattern: /\bmcp\b/i, label: 'MCP' },
  { pattern: /\bgltf\b|\bglb\b/i, label: 'glTF/GLB' },
  { pattern: /\btypescript\b/i, label: 'TypeScript' },
  { pattern: /\bpython\b/i, label: 'Python' }
];

export function toSkillSlug(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return cleaned || 'discovered-workflow';
}

export function extractLocalSkillName(identifier: string): string {
  if (identifier.includes('@')) {
    const parts = identifier.split('@');
    return toSkillSlug(parts[parts.length - 1]);
  }
  if (/^https?:\/\//i.test(identifier)) {
    const xMatch = identifier.match(/(?:x\.com|twitter\.com)\/([^/]+)\/status\/(\d+)/i);
    if (xMatch) return toSkillSlug(`${xMatch[1]}-${xMatch[2].slice(-6)}`);
    const ghMatch = identifier.match(/github\.com\/[^/]+\/([^/]+)/i);
    if (ghMatch) return toSkillSlug(ghMatch[1].replace(/\.git$/i, ''));
    return toSkillSlug(identifier.split('/').filter(Boolean).pop() || 'web-workflow');
  }
  if (identifier.includes('/')) {
    return toSkillSlug(identifier.split('/').pop() || identifier);
  }
  return toSkillSlug(path.basename(identifier, path.extname(identifier)));
}

function scoreCandidate(text: string, baseScore: number, popularity: number): number {
  let score = baseScore;
  const lower = text.toLowerCase();
  if (/\bmcp\b|coding agent|claude|antigravity|cursor|skill\.md/i.test(lower)) score += 25;
  if (/\bgodot\b|\bblender\b|\bgltf\b|\bglb\b|\bffmpeg\b|\bpixel\b|\bshader\b|\bsfxr\b/i.test(lower)) score += 20;
  if (/procedural|generator|pipeline|workflow|sprite/i.test(lower)) score += 10;
  if (popularity > 0) score += Math.min(25, Math.round(Math.log10(popularity + 1) * 6));
  return score;
}

async function querySkillsSh(queries: string[]): Promise<DiscoveredWorkflow[]> {
  const out: DiscoveredWorkflow[] = [];
  await Promise.all(
    queries.slice(0, 2).map(async (q) => {
      try {
        const res = await fetch(`https://skills.sh/api/search?q=${encodeURIComponent(q)}`, {
          headers: { 'User-Agent': 'safe-skill/1.1' },
          signal: AbortSignal.timeout(6000)
        });
        if (!res.ok) return;
        const data = (await res.json()) as any;
        if (!Array.isArray(data.skills)) return;
        for (const s of data.skills) {
          if (s.isDuplicate) continue;
          const id = `${s.source}@${s.skillId}`;
          const installs = Number(s.installs || 0);
          out.push({
            id,
            title: s.name || s.skillId,
            kind: 'SKILL_MD',
            source: 'skills.sh',
            url: `https://github.com/${s.source}`,
            description: `Agent Skill (${s.source})`,
            popularityLabel: `${installs.toLocaleString()} indirme`,
            score: scoreCandidate(`${s.name} ${s.source}`, 45, installs),
            installCmd: `safe-skill install ${id}`
          });
        }
      } catch (err) {
        process.stderr.write(`[safe-skill] skills.sh arama uyarısı: ${(err as Error).message}\n`);
      }
    })
  );
  return out;
}

async function queryGitHubSkillCode(query: string): Promise<DiscoveredWorkflow[]> {
  try {
    const { stdout } = await execFileAsync(
      'gh',
      ['search', 'code', 'SKILL.md', query, '--limit', '6', '--json', 'repository,path,url'],
      { timeout: 8000, windowsHide: true }
    );
    const items = JSON.parse(stdout || '[]') as any[];
    return items.map((item) => {
      const repoName = item.repository?.nameWithOwner || 'unknown/repo';
      const skillFolder = item.path && item.path.includes('/') ? item.path.split('/').slice(-2, -1)[0] : repoName.split('/')[1];
      const id = `${repoName}@${skillFolder}`;
      return {
        id,
        title: `${skillFolder} (${repoName})`,
        kind: 'SKILL_MD' as const,
        source: 'github-skill' as const,
        url: item.url || `https://github.com/${repoName}`,
        description: `GitHub canlı SKILL.md (${item.path || 'SKILL.md'})`,
        popularityLabel: 'Canlı GitHub Skill',
        score: scoreCandidate(`${repoName} ${item.path}`, 42, 10),
        installCmd: `safe-skill install ${repoName}`
      };
    });
  } catch (err) {
    process.stderr.write(`[safe-skill] gh code search uyarısı: ${(err as Error).message}\n`);
    return [];
  }
}

async function queryGitHubRepos(query: string): Promise<DiscoveredWorkflow[]> {
  try {
    const { stdout } = await execFileAsync(
      'gh',
      ['search', 'repos', query, '--sort', 'stars', '--limit', '8', '--json', 'fullName,description,stargazersCount,url'],
      { timeout: 8000, windowsHide: true }
    );
    const items = JSON.parse(stdout || '[]') as any[];
    return items.map((r) => {
      const stars = Number(r.stargazersCount || 0);
      const desc = r.description || 'Açık kaynak iş akışı / araç deposu';
      const isAgentTool = /\bmcp\b|agent|claude|skill|ai\b/i.test(`${r.fullName} ${desc}`);
      return {
        id: r.fullName,
        title: r.fullName,
        kind: isAgentTool ? ('AGENT_TOOL' as const) : ('WORKFLOW_REPO' as const),
        source: 'github-repo' as const,
        url: r.url,
        description: desc,
        popularityLabel: `${stars.toLocaleString()} yıldız`,
        score: scoreCandidate(`${r.fullName} ${desc}`, isAgentTool ? 35 : 22, stars),
        installCmd: `safe-skill install ${r.fullName}`
      };
    });
  } catch (err) {
    process.stderr.write(`[safe-skill] gh repo search uyarısı: ${(err as Error).message}\n`);
    return [];
  }
}

async function queryHackerNews(query: string): Promise<DiscoveredWorkflow[]> {
  try {
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=5`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'safe-skill/1.1' },
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) return [];
    const data = (await res.json()) as any;
    const hits = Array.isArray(data.hits) ? data.hits : [];
    return hits
      .filter((h: any) => h.url && h.title)
      .map((h: any) => {
        const points = Number(h.points || 0);
        return {
          id: h.url,
          title: h.title,
          kind: 'SHOW_HN' as const,
          source: 'hacker-news' as const,
          url: h.url,
          description: `Hacker News paylaşımı (${points} puan)`,
          popularityLabel: `${points} puan`,
          score: scoreCandidate(h.title, 15, points),
          installCmd: `safe-skill install "${h.url}"`
        };
      });
  } catch (err) {
    process.stderr.write(`[safe-skill] Hacker News arama uyarısı: ${(err as Error).message}\n`);
    return [];
  }
}

/**
 * Discovers workflows across skills.sh, GitHub SKILL.md index, GitHub repos, and Hacker News.
 */
export async function discoverWorkflows(
  queryOrDomain: string,
  options: DiscoverOptions = {}
): Promise<{ queries: string[]; results: DiscoveredWorkflow[] }> {
  const domainKey = options.domain?.toLowerCase();
  const domainQueries = domainKey && WORKFLOW_DOMAINS[domainKey] ? WORKFLOW_DOMAINS[domainKey] : null;
  const cleanQuery = queryOrDomain.trim();
  const queries = domainQueries
    ? cleanQuery
      ? [cleanQuery, ...domainQueries.slice(0, 2)]
      : domainQueries
    : [cleanQuery || 'procedural 3d'];

  const primaryQuery = queries[0];
  const secondaryQuery = queries[1] || primaryQuery;

  const [skillsSh, ghCode, ghRepos, hn] = await Promise.all([
    querySkillsSh(queries),
    queryGitHubSkillCode(primaryQuery),
    queryGitHubRepos(secondaryQuery),
    queryHackerNews(primaryQuery)
  ]);

  const combined = [...skillsSh, ...ghCode, ...ghRepos, ...hn];
  const deduped = new Map<string, DiscoveredWorkflow>();
  for (const item of combined) {
    const key = item.id.toLowerCase();
    const existing = deduped.get(key);
    if (!existing || item.score > existing.score) {
      deduped.set(key, item);
    }
  }

  const limit = options.limit ?? 15;
  const results = Array.from(deduped.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return { queries, results };
}

function synthesizeFromText(skillName: string, sourceUrl: string, title: string, rawText: string, author?: string): SynthesizedSkill {
  const detectedStack: string[] = [];
  for (const s of STACK_KEYWORDS) {
    if (s.pattern.test(rawText) && !detectedStack.includes(s.label)) {
      detectedStack.push(s.label);
    }
  }

  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const bullets = lines
    .filter((l) => /^(?:[•\-\*]|\d+[.)])\s+/.test(l))
    .map((l) => l.replace(/^(?:[•\-\*]|\d+[.)])\s+/, '').trim())
    .filter((l) => l.length >= 8)
    .slice(0, 12);

  const stackText = detectedStack.length > 0 ? detectedStack.join(', ') : 'Genel İş Akışı';
  const desc = `Discovered workflow: ${title.replace(/["\r\n]/g, ' ').slice(0, 130)} (${stackText}).`;
  const bulletsBlock = bullets.length > 0 ? bullets.map((b) => `- ${b}`).join('\n') : '- Kaynak özeti aşağıdadır.';

  const content = `---
name: ${skillName}
description: "${desc}"
---

# ${title}

| Özellik | Değer |
| :--- | :--- |
| **Kaynak** | ${sourceUrl} |
| **Yazar** | ${author || 'Topluluk'} |
| **Teknoloji Yığını** | ${stackText} |

## Öne Çıkan Adımlar & Kısıtlar

${bulletsBlock}

## Kaynak Dokümantasyonu

\`\`\`text
${rawText.trim().slice(0, 4500)}
\`\`\`
`;

  return { skillName, sourceUrl, detectedStack, content, synthesized: true };
}

async function fetchTextIfOk(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'safe-skill/1.1' },
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Fetches an authentic SKILL.md from GitHub/skills.sh or synthesizes one from README, X post, web URL, or local file.
 */
export async function fetchOrSynthesizeSkill(identifierOrUrl: string, customName?: string): Promise<SynthesizedSkill> {
  const input = identifierOrUrl.trim();
  const skillName = customName ? toSkillSlug(customName) : extractLocalSkillName(input);

  // 1. Local file
  if (!/^https?:\/\//i.test(input) && fs.existsSync(path.resolve(input)) && fs.statSync(path.resolve(input)).isFile()) {
    const resolved = path.resolve(input);
    const raw = fs.readFileSync(resolved, 'utf8');
    if (/^---\r?\n[\s\S]*?name:/m.test(raw)) {
      return { skillName, sourceUrl: resolved, detectedStack: [], content: raw, synthesized: false };
    }
    const title = raw.match(/^#\s+(.+)$/m)?.[1]?.trim() || skillName;
    return synthesizeFromText(skillName, resolved, title, raw);
  }

  // 2. X / Twitter post
  const xMatch = input.match(/^https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/([A-Za-z0-9_]+)\/status\/(\d+)/i);
  if (xMatch) {
    const endpoints = [
      `https://api.fxtwitter.com/${xMatch[1]}/status/${xMatch[2]}`,
      `https://api.vxtwitter.com/${xMatch[1]}/status/${xMatch[2]}`
    ];
    for (const ep of endpoints) {
      const txt = await fetchTextIfOk(ep);
      if (!txt) continue;
      try {
        const data = JSON.parse(txt);
        const tweet = data.tweet ?? data;
        const body: string = tweet.text || tweet.raw_text?.text || '';
        if (body) {
          const title = body.split(/\r?\n/)[0]?.slice(0, 90) || `${xMatch[1]} Workflow`;
          return synthesizeFromText(skillName, input, title, body, `@${xMatch[1]}`);
        }
      } catch {
        continue;
      }
    }
    throw new Error(`X gönderisi okunamadı: ${input}`);
  }

  // 3. Community skill identifier: owner/repo@skillId or owner/repo or GitHub URL
  let repo = '';
  let subSkill = '';
  const ghUrlMatch = input.match(/^https?:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git|\/)?$/i);
  if (ghUrlMatch) {
    repo = ghUrlMatch[1];
  } else if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[A-Za-z0-9_.-]+$/.test(input)) {
    const [r, s] = input.split('@');
    repo = r;
    subSkill = s;
  } else if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(input)) {
    repo = input;
  }

  if (repo) {
    const rawCandidates: string[] = [];
    if (subSkill) {
      rawCandidates.push(
        `https://raw.githubusercontent.com/${repo}/HEAD/skills/${subSkill}/SKILL.md`,
        `https://raw.githubusercontent.com/${repo}/HEAD/${subSkill}/SKILL.md`,
        `https://raw.githubusercontent.com/${repo}/HEAD/.claude/skills/${subSkill}/SKILL.md`,
        `https://raw.githubusercontent.com/${repo}/HEAD/.agent/skills/${subSkill}/SKILL.md`,
        `https://raw.githubusercontent.com/${repo}/HEAD/SKILL.md`
      );
    } else {
      rawCandidates.push(`https://raw.githubusercontent.com/${repo}/HEAD/SKILL.md`);
    }

    for (const url of rawCandidates) {
      const content = await fetchTextIfOk(url);
      if (content && content.trim().length > 20) {
        return { skillName, sourceUrl: url, detectedStack: [], content, synthesized: false };
      }
    }

    const readme = await fetchTextIfOk(`https://raw.githubusercontent.com/${repo}/HEAD/README.md`);
    if (readme) {
      const title = readme.match(/^#\s+(.+)$/m)?.[1]?.trim() || repo;
      return synthesizeFromText(skillName, `https://github.com/${repo}`, title, readme, repo.split('/')[0]);
    }
    throw new Error(`GitHub deposundan SKILL.md veya README.md indirilemedi: ${repo}`);
  }

  // 4. Generic Web URL
  if (/^https?:\/\//i.test(input)) {
    const body = await fetchTextIfOk(input);
    if (!body) throw new Error(`Web kaynağı indirilemedi: ${input}`);
    const stripped = body
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '\n')
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const title = body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || skillName;
    return synthesizeFromText(skillName, input, title, stripped);
  }

  throw new Error(`Desteklenmeyen kaynak biçimi: ${input}`);
}

/**
 * Stages remote/synthesized skill, runs S0/S1 security gate & advisories, and installs with SHA-256 passport.
 */
export async function stageAndInstallSkill(
  identifierOrUrl: string,
  options: {
    name?: string;
    target?: AgentEcosystem | 'auto';
    scope?: 'global' | 'workspace';
    customPath?: string | null;
    force?: boolean;
    dryRun?: boolean;
    cwd?: string;
  } = {}
): Promise<InstallRemoteResult> {
  const fetched = await fetchOrSynthesizeSkill(identifierOrUrl, options.name);
  const stageDir = fs.mkdtempSync(path.join(os.tmpdir(), `safe-skill-stage-${fetched.skillName}-`));

  try {
    fs.writeFileSync(path.join(stageDir, 'SKILL.md'), fetched.content, 'utf8');
    const scanResult = scanSkillDirectory(stageDir);
    const advisoryResult = checkSecurityAdvisories(identifierOrUrl, fetched.content);
    const blocked = (!scanResult.ok || advisoryResult.blocked) && !options.force;

    if (blocked) {
      return {
        ok: false,
        blocked: true,
        skillName: fetched.skillName,
        sourceUrl: fetched.sourceUrl,
        synthesized: fetched.synthesized,
        scanResult,
        advisoryResult
      };
    }

    if (options.dryRun) {
      return {
        ok: true,
        blocked: false,
        skillName: fetched.skillName,
        sourceUrl: fetched.sourceUrl,
        synthesized: fetched.synthesized,
        scanResult,
        advisoryResult,
        previewContent: fetched.content
      };
    }

    const targetEco = options.target && options.target !== 'auto'
      ? options.target
      : detectEcosystem(options.cwd || process.cwd());

    const resolved = resolveTargetInstallPath({
      ecosystem: targetEco,
      skillName: fetched.skillName,
      scope: options.scope ?? 'global',
      customPath: options.customPath ?? null,
      cwd: options.cwd
    });

    const adapted = adaptContentForTarget(fetched.content, resolved.ecosystem, fetched.skillName);
    fs.mkdirSync(resolved.targetDir, { recursive: true });
    fs.writeFileSync(resolved.targetFile, adapted, 'utf8');

    const passport = generateSkillPassport(resolved.targetDir, {
      name: fetched.skillName,
      sourceUrl: fetched.sourceUrl
    });
    saveSkillPassport(resolved.targetDir, passport);

    return {
      ok: true,
      blocked: false,
      skillName: fetched.skillName,
      sourceUrl: fetched.sourceUrl,
      synthesized: fetched.synthesized,
      scanResult,
      advisoryResult,
      installedPath: resolved.targetFile,
      passportSha256: passport.contentSha256
    };
  } finally {
    try {
      fs.rmSync(stageDir, { recursive: true, force: true });
    } catch (err) {
      process.stderr.write(`[safe-skill] Geçici dizin temizlenemedi: ${(err as Error).message}\n`);
    }
  }
}
