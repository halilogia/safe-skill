import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { scanSkillDirectory } from './security_scanner.ts';
import type { ScanResult } from './security_scanner.ts';

export interface SkillPassport {
  schemaVersion: '1.0';
  id: string;
  name: string;
  version: string;
  sourceUrl?: string;
  commitSha?: string;
  contentSha256: string;
  verifiedAt: string;
  securityVerdict: 'CLEAN' | 'FLAGGED' | 'DANGEROUS';
  findingsCount: number;
  allowedTools: string[];
  files: {
    path: string;
    sha256: string;
    bytes: number;
  }[];
}

export function computeFileSha256(filePath: string): { sha256: string; bytes: number } {
  const buffer = fs.readFileSync(filePath);
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  return { sha256: hash, bytes: buffer.length };
}

export function parseAllowedToolsFromSkillMd(content: string): string[] {
  const match = content.match(/^allowed-tools:\s*([^\r\n]+)/m);
  if (match) {
    return match[1].split(',').map((t) => t.trim()).filter(Boolean);
  }
  return [];
}

export function generateSkillPassport(skillDir: string, sourceMeta?: Partial<SkillPassport>): SkillPassport {
  const resolved = path.resolve(skillDir);
  const skillName = path.basename(resolved);

  const skillMdPath = path.join(resolved, 'SKILL.md');
  let allowedTools: string[] = [];
  if (fs.existsSync(skillMdPath)) {
    try {
      const content = fs.readFileSync(skillMdPath, 'utf8');
      allowedTools = parseAllowedToolsFromSkillMd(content);
    } catch {}
  }

  // Dosya listesi ve hashleri
  const files: SkillPassport['files'] = [];
  const hasher = crypto.createHash('sha256');

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!['.git', 'node_modules', '__pycache__', '.venv'].includes(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        if (entry.name === 'passport.json') continue; // pasaportun kendisini hash'e dahil etme
        const relPath = path.relative(resolved, fullPath).replace(/\\/g, '/');
        const { sha256, bytes } = computeFileSha256(fullPath);
        files.push({ path: relPath, sha256, bytes });
        hasher.update(`${relPath}:${sha256}`);
      }
    }
  }

  walk(resolved);

  const aggregateSha256 = hasher.digest('hex');
  const scanResult: ScanResult = scanSkillDirectory(resolved);

  return {
    schemaVersion: '1.0',
    id: skillName,
    name: sourceMeta?.name || skillName,
    version: sourceMeta?.version || '1.0.0',
    sourceUrl: sourceMeta?.sourceUrl,
    commitSha: sourceMeta?.commitSha || 'pinned-local-snapshot',
    contentSha256: aggregateSha256,
    verifiedAt: new Date().toISOString(),
    securityVerdict: scanResult.verdict,
    findingsCount: scanResult.findings.length,
    allowedTools,
    files
  };
}

export function saveSkillPassport(skillDir: string, passport: SkillPassport): string {
  const dest = path.join(skillDir, 'passport.json');
  fs.writeFileSync(dest, JSON.stringify(passport, null, 2), 'utf8');
  return dest;
}

export function loadSkillPassport(skillDir: string): SkillPassport | null {
  const dest = path.join(skillDir, 'passport.json');
  if (!fs.existsSync(dest)) return null;
  try {
    return JSON.parse(fs.readFileSync(dest, 'utf8'));
  } catch {
    return null;
  }
}

export function verifyPassportIntegrity(skillDir: string): { valid: boolean; reason?: string } {
  const passport = loadSkillPassport(skillDir);
  if (!passport) {
    return { valid: false, reason: 'Pasaport dosyası (passport.json) bulunamadı.' };
  }

  const currentPassport = generateSkillPassport(skillDir, passport);
  if (currentPassport.contentSha256 !== passport.contentSha256) {
    return {
      valid: false,
      reason: `İçerik bütünlüğü bozulmuş (Beklenen Hash: ${passport.contentSha256.slice(0, 10)}..., Mevcut: ${currentPassport.contentSha256.slice(0, 10)}...). Dosyalar sonradan değiştirilmiş olabilir.`
    };
  }

  return { valid: true };
}
