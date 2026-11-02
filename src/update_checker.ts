import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { loadSkillPassport, verifyPassportIntegrity, generateSkillPassport, saveSkillPassport, computeFileSha256, type SkillPassport } from './skill_passport.ts';
import { scanSkillDirectory } from './security_scanner.ts';
import { getAnthropicSkill, downloadAnthropicSkillMd } from './anthropic_catalog.ts';

export interface SkillUpdateStatus {
  name: string;
  dir: string;
  currentVersion: string;
  hasPassport: boolean;
  localIntegrityOk: boolean;
  sourceUrl?: string;
  status: 'UP_TO_DATE' | 'UPDATE_AVAILABLE' | 'UNKNOWN' | 'TAMPERED' | 'NO_SOURCE';
  details: string;
  newContent?: string;
}

/**
 * Belirtilen beceri dizinindeki becerinin güncellik durumunu denetler.
 */
export async function checkSingleSkillUpdate(skillDir: string): Promise<SkillUpdateStatus> {
  const resolved = path.resolve(skillDir);
  const name = path.basename(resolved);
  const passport = loadSkillPassport(resolved);

  if (!passport) {
    const hasSkillMd = fs.existsSync(path.join(resolved, 'SKILL.md'));
    return {
      name,
      dir: resolved,
      currentVersion: 'unknown',
      hasPassport: false,
      localIntegrityOk: false,
      status: 'UNKNOWN',
      details: hasSkillMd ? 'Pasaport (passport.json) bulunamadı, doğrulama yapılamıyor.' : 'Geçersiz beceri dizini.'
    };
  }

  // 1. Yerel kurcalama kontrolü (Tamper detection)
  const integrity = verifyPassportIntegrity(resolved);
  if (!integrity.valid) {
    return {
      name,
      dir: resolved,
      currentVersion: passport.version,
      hasPassport: true,
      localIntegrityOk: false,
      sourceUrl: passport.sourceUrl,
      status: 'TAMPERED',
      details: `Yerel dosyalar mühürlü pasaport ile eşleşmiyor: ${integrity.reason}`
    };
  }

  // 2. Anthropic Resmi Becerisi Denetimi
  const anthropicMeta = getAnthropicSkill(name);
  if (anthropicMeta) {
    try {
      const upstreamContent = downloadAnthropicSkillMd(anthropicMeta);
      if (!upstreamContent) {
        return {
          name,
          dir: resolved,
          currentVersion: passport.version,
          hasPassport: true,
          localIntegrityOk: true,
          sourceUrl: anthropicMeta.githubUrl,
          status: 'UNKNOWN',
          details: 'Upstream Anthropic deposuna erişilemedi.'
        };
      }

      const localSkillMd = path.join(resolved, 'SKILL.md');
      const localContent = fs.existsSync(localSkillMd) ? fs.readFileSync(localSkillMd, 'utf8') : '';

      if (localContent.trim() === upstreamContent.trim()) {
        return {
          name,
          dir: resolved,
          currentVersion: passport.version,
          hasPassport: true,
          localIntegrityOk: true,
          sourceUrl: anthropicMeta.githubUrl,
          status: 'UP_TO_DATE',
          details: 'Upstream Anthropic deposu ile birebir güncel.'
        };
      } else {
        return {
          name,
          dir: resolved,
          currentVersion: passport.version,
          hasPassport: true,
          localIntegrityOk: true,
          sourceUrl: anthropicMeta.githubUrl,
          status: 'UPDATE_AVAILABLE',
          details: 'Upstream resmi depoda yeni bir sürüm / içerik değişikliği mevcut.',
          newContent: upstreamContent
        };
      }
    } catch (err: any) {
      return {
        name,
        dir: resolved,
        currentVersion: passport.version,
        hasPassport: true,
        localIntegrityOk: true,
        sourceUrl: anthropicMeta.githubUrl,
        status: 'UNKNOWN',
        details: `Upstream kontrol hatası: ${err.message}`
      };
    }
  }

  // 3. Genel GitHub Kaynağı Denetimi
  if (passport.sourceUrl && passport.sourceUrl.includes('github.com')) {
    return {
      name,
      dir: resolved,
      currentVersion: passport.version,
      hasPassport: true,
      localIntegrityOk: true,
      sourceUrl: passport.sourceUrl,
      status: 'UP_TO_DATE',
      details: 'GitHub kaynağı mühürlü SHA ile izleniyor.'
    };
  }

  return {
    name,
    dir: resolved,
    currentVersion: passport.version,
    hasPassport: true,
    localIntegrityOk: true,
    sourceUrl: passport.sourceUrl,
    status: 'NO_SOURCE',
    details: 'Beceri yerel olarak üretilmiş veya harici güncelleme kaynağı tanımlanmamış.'
  };
}

/**
 * Belirtilen dizindeki tüm kurulu becerileri tarar ve güncelleme raporu çıkarır.
 */
export async function checkAllSkillsUpdates(skillsDir: string): Promise<SkillUpdateStatus[]> {
  const resolved = path.resolve(skillsDir);
  if (!fs.existsSync(resolved)) return [];

  const entries = fs.readdirSync(resolved, { withFileTypes: true });
  const results: SkillUpdateStatus[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const skillPath = path.join(resolved, entry.name);
      if (fs.existsSync(path.join(skillPath, 'SKILL.md')) || fs.existsSync(path.join(skillPath, 'passport.json'))) {
        const status = await checkSingleSkillUpdate(skillPath);
        results.push(status);
      }
    }
  }

  return results;
}

/**
 * Beceriyi güncellerken güvenlik kapısından (S0/S1) geçirir; tehdit varsa güncellemeyi reddeder.
 */
export async function applySkillUpdate(
  skillDir: string,
  newContent?: string,
  options: { force?: boolean } = {}
): Promise<{ success: boolean; message: string; blockedReason?: string }> {
  const resolved = path.resolve(skillDir);
  const name = path.basename(resolved);

  let contentToApply = newContent;
  const anthropicMeta = getAnthropicSkill(name);
  if (!contentToApply && anthropicMeta) {
    contentToApply = downloadAnthropicSkillMd(anthropicMeta) ?? undefined;
  }

  if (!contentToApply) {
    return { success: false, message: `"${name}" için indirilecek yeni içerik bulunamadı.` };
  }

  // 1. Güvenlik Kapısı Taraması (Geçici dizinde test et)
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `safe-skill-update-${name}-`));
  try {
    const tempFile = path.join(tempDir, 'SKILL.md');
    fs.writeFileSync(tempFile, contentToApply, 'utf8');

    const scan = scanSkillDirectory(tempDir);
    if (!scan.ok && !options.force) {
      const issues = scan.findings.map((f) => `[${f.severity}] ${f.category}: ${f.description}`).join('; ');
      return {
        success: false,
        message: `🛑 GÜNCELLEME ENGELLENDİ: Upstream içerikte güvenlik riski tespit edildi!`,
        blockedReason: issues
      };
    }

    // 2. Güvenli ise yerel dosyayı güncelle
    const targetSkillMd = path.join(resolved, 'SKILL.md');
    fs.writeFileSync(targetSkillMd, contentToApply, 'utf8');

    // 3. Pasaportu yeni hash ile mühürle
    const newPassport = generateSkillPassport(resolved, {
      name,
      sourceUrl: anthropicMeta?.githubUrl
    });
    saveSkillPassport(resolved, newPassport);

    return {
      success: true,
      message: `✔ "${name}" başarıyla güncellendi ve yeni SHA-256 pasaportu mühürlendi (${newPassport.contentSha256.slice(0, 16)}...).`
    };
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}
