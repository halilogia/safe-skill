import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  searchAnthropicSkills,
  getAnthropicSkill,
  downloadAnthropicSkillMd,
  type AnthropicSkillMeta
} from './anthropic_catalog.ts';
import { scanSkillDirectory, scanTextContent } from './security_scanner.ts';
import {
  generateSkillPassport,
  saveSkillPassport,
  loadSkillPassport,
  verifyPassportIntegrity
} from './skill_passport.ts';
import { runSkillDoctor } from './dependency_doctor.ts';
import {
  resolveTargetInstallPath,
  adaptContentForTarget,
  detectEcosystem,
  type AgentEcosystem
} from './ecosystem_targets.ts';
import {
  checkAllSkillsUpdates,
  checkSingleSkillUpdate,
  applySkillUpdate
} from './update_checker.ts';
import {
  runInteractiveMenu,
  askQuestion,
  type MenuItem
} from './interactive_tui.ts';
import { startMcpServer } from './mcp_server.ts';
import { matchUserIntent } from './intent_matcher.ts';
import { checkSecurityAdvisories, KNOWN_ADVISORIES } from './security_advisories.ts';

export interface TechDetection {
  technology: string;
  category: string;
  evidence: string[];
}

export interface SkillMatch {
  name: string;
  source: 'global' | 'builtin' | 'plugin' | 'workspace';
  path: string;
  reason: string;
  recommended: boolean;
}

export interface AnalysisReport {
  targetPath: string;
  technologies: TechDetection[];
  matchedSkills: SkillMatch[];
  missingWorkflow: boolean;
  detectedEcosystem: AgentEcosystem;
}

const GLOBAL_SKILLS_DIR = path.join(os.homedir(), '.gemini', 'config', 'skills');
const BUILTIN_SKILLS_DIR = path.join(os.homedir(), '.gemini', 'antigravity', 'builtin', 'skills');

export function detectTechnologies(targetDir: string): TechDetection[] {
  const detections: TechDetection[] = [];
  const check = (fileName: string): boolean => fs.existsSync(path.join(targetDir, fileName));

  // Node & TypeScript
  const hasPackageJson = check('package.json');
  const hasTsConfig = check('tsconfig.json');
  if (hasPackageJson || hasTsConfig) {
    const evidence: string[] = [];
    if (hasPackageJson) evidence.push('package.json');
    if (hasTsConfig) evidence.push('tsconfig.json');

    let isTs = hasTsConfig;
    let hasZod = false;

    if (hasPackageJson) {
      try {
        const pkg = JSON.parse(fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'));
        if (pkg.dependencies?.typescript || pkg.devDependencies?.typescript) isTs = true;
        if (pkg.dependencies?.zod || pkg.devDependencies?.zod) hasZod = true;
      } catch {}
    }

    detections.push({
      technology: isTs ? 'TypeScript (Node.js)' : 'JavaScript (Node.js)',
      category: 'Runtime / Dil',
      evidence
    });

    if (hasZod) {
      detections.push({
        technology: 'Zod Runtime Validator',
        category: 'Doğrulama & Şema',
        evidence: ['package.json: dependencies.zod']
      });
    }
  }

  // Python
  if (check('pyproject.toml') || check('requirements.txt') || check('setup.py')) {
    const evidence = ['pyproject.toml', 'requirements.txt', 'setup.py'].filter(check);
    detections.push({
      technology: 'Python',
      category: 'Runtime / Dil',
      evidence
    });
  }

  // Godot Engine
  if (check('project.godot')) {
    detections.push({
      technology: 'Godot Engine',
      category: 'Oyun Motoru',
      evidence: ['project.godot']
    });
  }

  // Rust
  if (check('Cargo.toml')) {
    detections.push({
      technology: 'Rust',
      category: 'Sistem Dili',
      evidence: ['Cargo.toml']
    });
  }

  // Android
  if (check('build.gradle') || check('build.gradle.kts') || check('AndroidManifest.xml')) {
    const evidence = ['build.gradle', 'build.gradle.kts', 'AndroidManifest.xml'].filter(check);
    detections.push({
      technology: 'Android SDK / Gradle',
      category: 'Mobil',
      evidence
    });
  }

  // Git Repository
  if (check('.git')) {
    detections.push({
      technology: 'Git Versiyon Kontrolü',
      category: 'VCS',
      evidence: ['.git/']
    });
  }

  // MCP Entegrasyonu
  if (check('mcp_config.json') || (hasPackageJson && checkPackageJsonForMcp(targetDir))) {
    detections.push({
      technology: 'Model Context Protocol (MCP)',
      category: 'Ajan Protokolü',
      evidence: ['mcp_config.json veya @modelcontextprotocol/sdk']
    });
  }

  return detections;
}

function checkPackageJsonForMcp(targetDir: string): boolean {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(targetDir, 'package.json'), 'utf8'));
    return !!(pkg.dependencies?.['@modelcontextprotocol/sdk'] || pkg.devDependencies?.['@modelcontextprotocol/sdk']);
  } catch {
    return false;
  }
}

export function matchSkills(targetDir: string, techs: TechDetection[]): SkillMatch[] {
  const matches: SkillMatch[] = [];
  const techNames = techs.map((t) => t.technology.toLowerCase());

  if (techNames.some((t) => t.includes('git'))) {
    matches.push({
      name: 'safe-git',
      source: 'global',
      path: path.join(GLOBAL_SKILLS_DIR, 'safe-git', 'SKILL.md'),
      reason: 'Git reposunda yıkıcı olmayan (non-destructive) güvenli Git akışını sağlar.',
      recommended: true
    });
  }

  const hasReadme = fs.existsSync(path.join(targetDir, 'README.md'));
  const hasArch = fs.existsSync(path.join(targetDir, 'ARCHITECTURE.md'));
  if (!hasReadme || !hasArch) {
    matches.push({
      name: 'core-docs',
      source: 'global',
      path: path.join(GLOBAL_SKILLS_DIR, 'core-docs', 'SKILL.md'),
      reason: 'Eksik olan 8 temel mimari dokümanı ve Zod/TypeScript standartlarını kurar.',
      recommended: true
    });
  }

  if (techNames.length > 0) {
    matches.push({
      name: 'chatgpt-redteam',
      source: 'global',
      path: path.join(GLOBAL_SKILLS_DIR, 'chatgpt-redteam', 'SKILL.md'),
      reason: 'Kod değişikliklerini yerel ChatGPT Web (High reasoning) ile otonom denetler.',
      recommended: true
    });
  }

  matches.push({
    name: 'verification-efficiency',
    source: 'global',
    path: path.join(GLOBAL_SKILLS_DIR, 'verification-efficiency', 'SKILL.md'),
    reason: 'Gereksiz disk taramalarını önler ve tek seferlik hızlı doğrulamayı zorunlu kılar.',
    recommended: false
  });

  if (techNames.some((t) => t.includes('godot') || t.includes('mobil'))) {
    matches.push({
      name: 'windows-gui-launcher',
      source: 'global',
      path: path.join(GLOBAL_SKILLS_DIR, 'windows-gui-launcher', 'SKILL.md'),
      reason: 'Pencereleri fiziksel monitöre (WinSta0\\Default) taşır.',
      recommended: true
    });
  }

  if (techNames.some((t) => t.includes('mcp'))) {
    matches.push({
      name: 'mcp-builder',
      source: 'global',
      path: path.join(GLOBAL_SKILLS_DIR, 'mcp-builder', 'SKILL.md'),
      reason: 'Anthropic Resmi: MCP stdio/SSE sunucuları ve araç şemaları geliştirme standardı.',
      recommended: true
    });
  }

  if (techNames.some((t) => t.includes('typescript') || t.includes('javascript'))) {
    matches.push({
      name: 'frontend-design',
      source: 'global',
      path: path.join(GLOBAL_SKILLS_DIR, 'frontend-design', 'SKILL.md'),
      reason: 'Anthropic Resmi: Üretim kalitesinde UI/UX tasarımı, tipografi ve modern CSS rehberliği.',
      recommended: false
    });
  }

  return matches;
}

export function analyzeProject(targetDir: string): AnalysisReport {
  const resolved = path.resolve(targetDir);
  const techs = detectTechnologies(resolved);
  const matches = matchSkills(resolved, techs);

  const workflowDir = path.join(resolved, '.agent', 'skills');
  const hasWorkflow = fs.existsSync(workflowDir) && fs.readdirSync(workflowDir).length > 0;
  const eco = detectEcosystem(resolved);

  return {
    targetPath: resolved,
    technologies: techs,
    matchedSkills: matches,
    missingWorkflow: !hasWorkflow,
    detectedEcosystem: eco
  };
}

export function searchInternetSkills(query: string, limit = 8): { name: string; installs: number; cmd: string }[] {
  try {
    const rawJson = execFileSync('curl.exe', ['-s', `https://skills.sh/api/search?q=${encodeURIComponent(query)}`], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore']
    });

    const data = JSON.parse(rawJson);
    if (!data.skills || !Array.isArray(data.skills)) return [];

    return data.skills.slice(0, limit).map((s: any) => ({
      name: `${s.source}@${s.skillId}`,
      installs: s.installs || 0,
      cmd: `safe-skill install ${s.source}@${s.skillId}`
    }));
  } catch {
    return [];
  }
}

export function sanitizeQuery(q: string): string {
  return q.replace(/[^\p{L}\p{N} _.@\/-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
}

export function techToKeyword(tech: string): string {
  const map: [RegExp, string][] = [
    [/typescript/i, 'typescript'],
    [/javascript/i, 'javascript'],
    [/zod/i, 'zod'],
    [/python/i, 'python'],
    [/godot/i, 'godot'],
    [/rust/i, 'rust'],
    [/android/i, 'android'],
    [/git/i, 'git'],
    [/mcp|model context/i, 'mcp']
  ];
  for (const [re, kw] of map) if (re.test(tech)) return kw;
  return sanitizeQuery(tech.split(' ')[0]).toLowerCase();
}

const INSTALL_NAME_RE = /^[A-Za-z0-9][\w.-]*$/;
const truncate = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function resolveSkillDir(targetArg?: string): string {
  if (!targetArg) return process.cwd();
  if (fs.existsSync(targetArg) && fs.statSync(targetArg).isDirectory()) {
    return path.resolve(targetArg);
  }
  const globalPath = path.join(GLOBAL_SKILLS_DIR, targetArg);
  if (fs.existsSync(globalPath) && fs.statSync(globalPath).isDirectory()) {
    return globalPath;
  }
  const claudePath = path.join(os.homedir(), '.claude', 'skills', targetArg);
  if (fs.existsSync(claudePath) && fs.statSync(claudePath).isDirectory()) {
    return claudePath;
  }
  return path.resolve(targetArg);
}

export async function cmdScan(rest: string[]): Promise<number> {
  const target = resolveSkillDir(rest[0]);
  console.log(`\n🛡️ GÜVENLİK VE PROMPT INJECTION TARAMASI (S0/S1 Gate)`);
  console.log(`📂 Hedef: ${target}\n`);

  const result = scanSkillDirectory(target);
  if (result.findings.length === 0) {
    console.log(`✔ ${result.summary}\n`);
    return 0;
  }

  const icon = result.verdict === 'DANGEROUS' ? '🛑' : '⚠️';
  console.log(`${icon} Sonuç: ${result.verdict} (${result.findings.length} bulgu)`);
  for (const f of result.findings) {
    const sevIcon = f.severity === 'CRITICAL' ? '🔴' : '🟡';
    console.log(`  ${sevIcon} [${f.severity}] ${f.category} (${f.file}:${f.line || '?'})`);
    console.log(`     └─ ${f.description}`);
    console.log(`     └─ Eşleşen Kod: "${f.match.slice(0, 80)}"`);
  }
  console.log('');
  return result.verdict === 'DANGEROUS' ? 1 : 0;
}

export async function cmdDoctor(rest: string[]): Promise<number> {
  const target = rest[0] ? resolveSkillDir(rest[0]) : undefined;
  console.log(`\n🩺 ÇALIŞMA ZAMANI VE BAĞIMLILIK DOKTORU (Dependency Doctor)\n`);

  const report = runSkillDoctor(target);
  console.log(`📦 İncelenen: ${report.skillName}`);
  console.log(`📊 Durum: ${report.status === 'READY' ? '🟢 READY' : '🟡 ' + report.status}`);
  console.log(`\nAraç Denetimleri:`);
  for (const c of report.checks) {
    const icon = c.installed ? '✔' : c.required ? '❌' : '⚪';
    const reqText = c.required ? '[Zorunlu]' : '[İsteğe Bağlı]';
    console.log(`  ${icon} ${c.tool.padEnd(8)} ${reqText.padEnd(16)} ${c.version || 'Kurulu Değil'}`);
    if (c.path && c.installed) console.log(`     └─ Yol: ${c.path}`);
  }
  console.log(`\n${report.summary}\n`);
  return report.status === 'READY' ? 0 : 1;
}

export async function cmdPassport(rest: string[]): Promise<number> {
  const name = rest[0];
  if (!name) {
    console.error('Hata: İncelenecek beceri adını veya dizinini belirtin. Örn: safe-skill passport safe-git');
    return 2;
  }
  const target = resolveSkillDir(name);
  console.log(`\n🛂 BECERİ PASAPORTU VE BÜTÜNLÜK DOĞRULAMASI`);
  console.log(`📂 Dizin: ${target}\n`);

  const passport = loadSkillPassport(target);
  if (!passport) {
    console.log(`⚠️ Pasaport (passport.json) bulunamadı. Yeni bir doğrulanmış pasaport oluşturuluyor...`);
    const newPassport = generateSkillPassport(target);
    saveSkillPassport(target, newPassport);
    console.log(`✔ Pasaport başarıyla oluşturuldu ve mühürlendi: ${path.join(target, 'passport.json')}`);
    console.log(`  └─ SHA-256 İçerik Hash: ${newPassport.contentSha256}`);
    console.log(`  └─ Güvenlik Durumu: ${newPassport.securityVerdict}\n`);
    return 0;
  }

  const integrity = verifyPassportIntegrity(target);
  console.log(`📦 Beceri: ${passport.name} (v${passport.version})`);
  console.log(`🔗 Kaynak: ${passport.sourceUrl || 'Yerel'}`);
  console.log(`📌 Commit SHA: ${passport.commitSha || 'Yerel Snapshot'}`);
  console.log(`🔒 İçerik SHA-256: ${passport.contentSha256}`);
  console.log(`🕒 Mühürlenme Tarihi: ${passport.verifiedAt}`);
  console.log(`🛡️ Güvenlik Durumu: ${passport.securityVerdict}`);
  console.log(`📁 İndekslenen Dosya: ${passport.files.length} adet`);

  if (integrity.valid) {
    console.log(`\n✔ BÜTÜNLÜK DOĞRULANDI: Beceri dosyaları mühürlenen hash ile birebir eşleşiyor.\n`);
    return 0;
  } else {
    console.log(`\n🛑 BÜTÜNLÜK İHLALİ: ${integrity.reason}\n`);
    return 1;
  }
}

export async function cmdSearch(rest: string[]): Promise<number> {
  const query = rest.join(' ').trim() || 'testing';
  console.log(`\n🌐 BECERİ ARAMASI: "${query}"...\n`);

  const anthropicResults = searchAnthropicSkills(query);
  if (anthropicResults.length > 0) {
    console.log(`⭐ ANTHROPIC RESMİ BECERİLERİ (anthropics/skills - ${anthropicResults.length} adet):`);
    for (const s of anthropicResults) {
      console.log(`  📦 ${s.id} [Anthropic Resmi] (${s.category})`);
      console.log(`     ${truncate(s.descriptionTr, 140)}`);
      console.log(`     Kaynak: ${s.githubUrl}`);
      console.log(`     └─ Yükle: safe-skill install ${s.id}`);
    }
    console.log('');
  }

  const internetSkills = searchInternetSkills(query, 6);
  if (internetSkills.length > 0) {
    console.log(`🌍 TOPLULUK BECERİLERİ (skills.sh - ${internetSkills.length} adet):`);
    for (const r of internetSkills) {
      console.log(`  🌐 ${r.name} (${r.installs.toLocaleString()} indirme)`);
      console.log(`     └─ Yükle: ${r.cmd}`);
    }
    console.log('');
  }

  return 0;
}

export async function cmdCheck(rest: string[]): Promise<number> {
  let targetEco: AgentEcosystem | 'auto' = 'auto';
  let scope: 'global' | 'workspace' = 'global';

  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--target' || a === '-t') {
      targetEco = rest[++i] as any;
    } else if (a === '--workspace') {
      scope = 'workspace';
    } else if (a === '--global') {
      scope = 'global';
    }
  }

  const resolvedTarget = resolveTargetInstallPath({
    ecosystem: targetEco,
    skillName: 'dummy',
    scope
  });

  console.log(`\n🔄 GÜNCELLEME DENETİMİ (Update Check)`);
  console.log(`📂 Taranan Dizin: ${resolvedTarget.skillsDir} (Hedef Ajan: ${resolvedTarget.ecosystem.toUpperCase()})\n`);

  const reports = await checkAllSkillsUpdates(resolvedTarget.skillsDir);
  if (reports.length === 0) {
    console.log(`  Bu dizinde kurulu beceri veya pasaport bulunamadı.\n`);
    return 0;
  }

  let updatesCount = 0;
  for (const r of reports) {
    let icon = '✔';
    let label = '\x1b[32mGÜNCEL\x1b[0m';
    if (r.status === 'UPDATE_AVAILABLE') {
      icon = '⬆️';
      label = '\x1b[33mGÜNCELLEME MEVCUT\x1b[0m';
      updatesCount++;
    } else if (r.status === 'TAMPERED') {
      icon = '🛑';
      label = '\x1b[31mBÜTÜNLÜK İHLALİ (TAMPERED)\x1b[0m';
    }

    console.log(`  ${icon} ${r.name.padEnd(24)} [${label}] (v${r.currentVersion})`);
    console.log(`     └─ ${r.details}`);
    if (r.status === 'UPDATE_AVAILABLE') {
      console.log(`     └─ Güncelleme Komutu: safe-skill update ${r.name} --target ${resolvedTarget.ecosystem}`);
    }
  }

  console.log(`\nToplam ${reports.length} beceri denetlendi; ${updatesCount} güncelleme mevcut.\n`);
  return 0;
}

export async function cmdUpdate(rest: string[]): Promise<number> {
  let name = '';
  let targetEco: AgentEcosystem | 'auto' = 'auto';
  let scope: 'global' | 'workspace' = 'global';
  let force = false;

  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--target' || a === '-t') {
      targetEco = rest[++i] as any;
    } else if (a === '--force' || a === '-f') {
      force = true;
    } else if (a === '--workspace') {
      scope = 'workspace';
    } else if (a === '--global') {
      scope = 'global';
    } else if (!name && !a.startsWith('-')) {
      name = a;
    }
  }

  if (!name) {
    console.error('Hata: Güncellenecek beceri adını belirtin veya --all kullanın.');
    return 2;
  }

  const resolvedTarget = resolveTargetInstallPath({
    ecosystem: targetEco,
    skillName: name,
    scope
  });

  console.log(`\n🔄 GÜNCELLEME BAŞLATILIYOR: "${name}"`);
  console.log(`📂 Konum: ${resolvedTarget.targetDir}\n`);

  const res = await applySkillUpdate(resolvedTarget.targetDir, undefined, { force });
  if (res.success) {
    console.log(`${res.message}\n`);
    return 0;
  } else {
    console.error(`\x1b[31m${res.message}\x1b[0m`);
    if (res.blockedReason) {
      console.error(`\x1b[33mDetaylar: ${res.blockedReason}\x1b[0m\n`);
    }
    return 1;
  }
}

export async function cmdInstall(rest: string[]): Promise<number> {
  let name = '';
  let targetEco: AgentEcosystem | 'auto' = 'auto';
  let scope: 'global' | 'workspace' | null = null;
  let customPath: string | null = null;
  let force = false;

  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--global' || a === '--workspace') {
      scope = a === '--global' ? 'global' : 'workspace';
    } else if (a === '--target' || a === '-t') {
      targetEco = rest[++i] as any;
    } else if (a === '--force' || a === '-f') {
      force = true;
    } else if (a === '--path') {
      customPath = rest[++i] ?? null;
    } else if (!name && !a.startsWith('-')) {
      name = a;
    }
  }

  if (!name || name.includes('..')) {
    console.error('Hata: Geçersiz veya eksik beceri adı.');
    return 2;
  }

  const anthropicMeta = getAnthropicSkill(name);
  const targetSkillName = anthropicMeta ? anthropicMeta.id : name;

  if (!INSTALL_NAME_RE.test(targetSkillName)) {
    console.error('Hata: Geçersiz beceri adı formatı. Yalnızca harf, rakam, _ . - kullanılabilir.');
    return 2;
  }

  const resolvedTarget = resolveTargetInstallPath({
    ecosystem: targetEco,
    skillName: targetSkillName,
    scope,
    customPath
  });

  console.log(`\n⬇️ BECERİ KURULUMU: ${targetSkillName}`);
  console.log(`🎯 Hedef Ekosistem: ${resolvedTarget.ecosystem.toUpperCase()}`);
  console.log(`📂 Hedef Dosya: ${resolvedTarget.targetFile}\n`);

  if (fs.existsSync(resolvedTarget.targetFile) && !force) {
    console.warn(`⚠️ Hedef zaten mevcut, üzerine yazılmadı: ${resolvedTarget.targetFile}`);
    console.warn('   └─ Üzerine yazmak için --force ekleyin.\n');
    return 1;
  }

  // İçeriği al (Anthropic resmi veya şablon)
  let rawContent: string | null = null;
  if (anthropicMeta) {
    rawContent = downloadAnthropicSkillMd(anthropicMeta);
  } else {
    rawContent = `---\nname: ${targetSkillName}\ndescription: Community skill ${targetSkillName}\n---\n\n# ${targetSkillName}\n\nSkill implementation.`;
  }

  if (!rawContent) {
    console.error(`Hata: ${targetSkillName} içeriği alınamadı.`);
    return 1;
  }

  // Hedef ajana göre içeriği uyarla (örn. Cursor için .mdc formatı)
  const finalContent = adaptContentForTarget(rawContent, resolvedTarget.ecosystem, targetSkillName);

  // Güvenlik bülteni ve bilinen tehdit istihbaratı denetimi
  const advCheck = checkSecurityAdvisories(targetSkillName, finalContent);
  if (advCheck.blocked && !force) {
    console.error(`\n[SECURITY] GUVENLIK BULTENI ENGELI: "${targetSkillName}" bilinen bir tehdit deseniyle eslesti!`);
    for (const a of advCheck.advisories) {
      console.error(`  [KRITIK] [${a.id}] ${a.title} - ${a.description}`);
    }
    console.error(`Kurulum Guvenlik Kapisi tarafindan durduruldu.\n`);
    return 1;
  }

  // Güvenlik kapısı taraması (S0/S1)
  const scan = scanTextContent(finalContent, 'SKILL.md');
  if (!scan.ok && !force) {
    console.error(`\n🛑 GÜVENLİK KAPISI ENGELİ: "${targetSkillName}" içeriğinde güvenlik riski tespit edildi!`);
    for (const f of scan.findings) {
      console.error(`  🔴 [${f.severity}] ${f.category} - ${f.description}`);
      console.error(`     └─ Eşleşme: "${f.match.slice(0, 80)}"`);
    }
    console.error(`\nİşlem güvenliği için kurulum iptal edildi. Zorlamak için --force kullanın.\n`);
    return 1;
  }

  fs.mkdirSync(resolvedTarget.targetDir, { recursive: true });
  fs.writeFileSync(resolvedTarget.targetFile, finalContent, 'utf8');

  // Pasaport mühürleme
  const passport = generateSkillPassport(resolvedTarget.targetDir, {
    name: targetSkillName,
    sourceUrl: anthropicMeta?.githubUrl
  });
  saveSkillPassport(resolvedTarget.targetDir, passport);

  console.log(`✔ Kurulum tamamlandı: ${resolvedTarget.targetFile}`);
  console.log(`🛂 SHA-256 Pasaport Mühürlendi (${passport.contentSha256.slice(0, 16)}...)`);

  // Dependency Doctor
  const doctor = runSkillDoctor(resolvedTarget.targetDir);
  console.log(`🩺 Bağımlılık Durumu: ${doctor.summary}\n`);
  return 0;
}

export async function cmdAnalyze(targetArg: string = process.cwd()): Promise<number> {
  const report = analyzeProject(targetArg);

  console.log(`\n🔍 PROJE BECERİ ANALİZ RAPORU (Safe-Skill)`);
  console.log(`📂 Dizin: ${report.targetPath}`);
  console.log(`🎯 Tespit Edilen Ekosistem: \x1b[1;36m${report.detectedEcosystem.toUpperCase()}\x1b[0m\n`);

  console.log(`🛠️ Tespit Edilen Teknolojiler (${report.technologies.length}):`);
  if (report.technologies.length === 0) {
    console.log('  - Herhangi bir standart teknoloji tespit edilemedi.');
  } else {
    for (const t of report.technologies) {
      console.log(`  ✔ [${t.category}] ${t.technology} (Kanıt: ${t.evidence.join(', ')})`);
    }
  }

  console.log(`\n🎯 Projeye Önerilen Beceriler (${report.matchedSkills.length}):`);
  for (const s of report.matchedSkills) {
    const star = s.recommended ? '⭐ [ÖNERİLEN]' : '  [İSTEĞE BAĞLI]';
    console.log(`  ${star} ${s.name} (${s.source})`);
    console.log(`     └─ Neden: ${s.reason}`);
    console.log(`     └─ Kur: safe-skill install ${s.name} --target ${report.detectedEcosystem}`);
  }

  if (report.missingWorkflow) {
    console.log(`\n⚠️ UYARI: Bu projede yerel bir iş akışı (.agent/skills/<proje>-workflow/SKILL.md) bulunamadı.`);
    console.log(`   └─ 'core-docs' kurarak projenin özel iş akışı dosyasını üretebilirsiniz.`);
  } else {
    console.log(`\n✔ Proje-özel yerel iş akışı (.agent/skills/) aktif.`);
  }
  console.log('');
  return 0;
}

export function startInteractiveCli(): Promise<void> {
  const items: MenuItem[] = [
    {
      key: '1',
      label: '🔍 Projeyi Analiz Et ve Becerileri Öner',
      description: 'Mevcut dizinin teknoloji yığınını tara ve eksik becerileri listele.',
      action: async () => { await cmdAnalyze(process.cwd()); }
    },
    {
      key: '2',
      label: '🔎 Beceri Ara (Anthropic Resmi + Topluluk)',
      description: 'Resmi Anthropic ve küresel topluluk deposunda beceri arayın.',
      action: async () => {
        const q = await askQuestion('\x1b[32mAramak istediğiniz terimi girin (örn: frontend, test, mcp): \x1b[0m');
        if (q) await cmdSearch([q]);
      }
    },
    {
      key: '3',
      label: '🛡️ Güvenlik ve Prompt Injection Taraması',
      description: 'Bir becerinin dosyalarını S0/S1 güvenlik kapısıyla tarayın.',
      action: async () => {
        const target = await askQuestion('\x1b[32mTaranacak beceri adı veya dizin yolu: \x1b[0m');
        if (target) await cmdScan([target]);
      }
    },
    {
      key: '4',
      label: '🔄 Güncellemeleri Denetle (Update Check)',
      description: 'Kurulu becerilerin upstream sürümlerini ve pasaport bütünlüğünü kontrol et.',
      action: async () => { await cmdCheck([]); }
    },
    {
      key: '5',
      label: '🩺 Sistem Bağımlılık Doktoru (Dependency Doctor)',
      description: 'Gerekli CLI araçlarının (git, node, python, ffmpeg vb.) varlığını test edin.',
      action: async () => { await cmdDoctor([]); }
    },
    {
      key: '6',
      label: '📦 Güvenli Beceri Kur (Install with S0/S1 Gate)',
      description: 'Hedef platformu seçerek (Claude/Antigravity/Cursor) doğrulanmış beceri yükleyin.',
      action: async () => {
        const name = await askQuestion('\x1b[32mKurulacak beceri adı (örn: safe-git, mcp-builder): \x1b[0m');
        const target = await askQuestion('\x1b[32mHedef platform [claude | antigravity | cursor] (Enter: varsayılan): \x1b[0m');
        if (name) {
          const args = [name];
          if (target) args.push('--target', target);
          await cmdInstall(args);
        }
      }
    }
  ];

  return runInteractiveMenu(items);
}

export async function cmdMatch(rest: string[]): Promise<number> {
  const query = rest.join(' ').trim();
  if (!query) {
    console.error('Kullanim: safe-skill match "<ne yapmak istediginizi anlatin>"');
    return 1;
  }
  console.log(`\n[INTENT] DOGAL DIL NIYET ANALIZI: "${query}"\n`);
  const matches = matchUserIntent(query, 5);
  if (matches.length === 0) {
    console.log('Eslesen belirgin bir beceri bulunamadi. Lutfen farkli anahtar kelimelerle deneyin.');
    return 0;
  }

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    console.log(`  ${i + 1}. [SKILL] ${m.skill.name} (Skor: ${m.score}) [${m.skill.category}]`);
    console.log(`     ${m.skill.descriptionTr || m.skill.descriptionEn}`);
    console.log(`     Gerekce: ${m.recommendedReason}`);
    console.log(`     -> Kur: safe-skill install ${m.skill.name}\n`);
  }
  return 0;
}

export async function cmdAdvisories(): Promise<number> {
  console.log(`\n[SECURITY] GUNCEL GUVENLIK BULTENI VE TEHDIT ISTIHBARATI (${KNOWN_ADVISORIES.length} Kayit):\n`);
  for (const adv of KNOWN_ADVISORIES) {
    const tag = adv.severity === 'CRITICAL' ? '[KRITIK]' : '[UYARI]';
    console.log(`  ${tag} [${adv.id}] ${adv.title} (${adv.severity})`);
    console.log(`     Desen: "${adv.targetPattern}" | Tur: ${adv.type} | Tarih: ${adv.publishedAt}`);
    console.log(`     Aciklama: ${adv.description}\n`);
  }
  return 0;
}

const USAGE = `SAFE-SKILL: The Security-First Multi-Agent Skill Manager
For Claude Code, Cursor, Windsurf & Google Antigravity

Kullanım:
  safe-skill                                Etkilesimli TUI menusu (veya analiz)
  safe-skill <projeDizini>                  Belirtilen projeyi analiz et ve beceri oner
  safe-skill search <sorgu>                 Anthropic resmi & topluluk becerilerini ara
  safe-skill match <istek/prompt>           Dogal dil ile semantik beceri onerisi
  safe-skill scan [dizin|beceri]            S0/S1 Guvenlik & Prompt Injection taramasi
  safe-skill check [secenekler]             Kurulu becerilerin guncellik durumunu denetle
  safe-skill update <isim> [secenekler]     Beceriyi guvenlik kapisiyla guncelle
  safe-skill install <isim> [secenekler]    Beceriyi dogrulanmis guvenlik kapisiyla yukle
  safe-skill advisories                     Guncel guvenlik tehdit bultenini listele
  safe-skill mcp | --mcp                    STDIO Model Context Protocol sunucusunu baslat
  safe-skill doctor [beceri]                Calisma zamani arac ve bagimliliklarini denetle
  safe-skill passport <beceri>              SHA-256 butunluk pasaportunu dogrula
  safe-skill menu | interactive             Etkilesimli terminal menusunu ac
  safe-skill --help | -h                    Bu yardim mesajini goster

Seçenekler:
  --target, -t <claude|antigravity|cursor>  Hedef ajan ekosistemi (varsayılan: otomatik tespit)
  --global                                  Kullanıcı ana dizinine global kur
  --workspace                               Mevcut çalışma alanına kur
  --force, -f                               Mevcut kurulumun üzerine yaz / uyarıları zorla
  --path <dizin>                            Özel hedef dizini belirt
`;

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const arg = argv[0];
  const rest = argv.slice(1);

  if (arg === undefined) {
    if (process.stdin.isTTY) {
      await startInteractiveCli();
      return 0;
    }
    return cmdAnalyze(process.cwd());
  }

  if (arg === '--help' || arg === '-h' || arg === 'help') {
    console.log(USAGE);
    return 0;
  }

  if (arg === 'menu' || arg === 'interactive') {
    await startInteractiveCli();
    return 0;
  }

  if (arg === 'search') return cmdSearch(rest);
  if (arg === 'match' || arg === 'suggest') return cmdMatch(rest);
  if (arg === 'advisories' || arg === 'advisory') return cmdAdvisories();
  if (arg === 'mcp' || arg === '--mcp') {
    startMcpServer();
    return 0;
  }
  if (arg === 'scan') return cmdScan(rest);
  if (arg === 'doctor') return cmdDoctor(rest);
  if (arg === 'passport') return cmdPassport(rest);
  if (arg === 'check') return cmdCheck(rest);
  if (arg === 'update') return cmdUpdate(rest);
  if (arg === 'install') return cmdInstall(rest);

  let isDir = false;
  try {
    isDir = fs.statSync(arg).isDirectory();
  } catch {}
  if (isDir) {
    return cmdAnalyze(arg);
  }

  console.error(`Hata: "${arg}" bilinen bir komut veya var olan bir dizin değil.\n`);
  console.log(USAGE);
  return 1;
}

if (process.argv[1] && (process.argv[1].endsWith('cli.ts') || process.argv[1].endsWith('find_skill.ts'))) {
  main().then((code) => {
    if (typeof code === 'number' && code !== 0) process.exit(code);
  }).catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

