import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface ToolCheck {
  tool: string;
  required: boolean;
  installed: boolean;
  version?: string;
  path?: string;
  notes?: string;
}

export interface DoctorReport {
  skillName?: string;
  status: 'READY' | 'MISSING_DEPS' | 'WARNING';
  checks: ToolCheck[];
  summary: string;
}

function probeCommand(cmd: string, args: string[]): { ok: boolean; version?: string; path?: string } {
  try {
    const isWin = process.platform === 'win32';
    // Where komutu ile dosya yolunu al
    let execPath = '';
    try {
      execPath = execFileSync(isWin ? 'where.exe' : 'which', [cmd], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split(/\r?\n/)[0];
    } catch {}

    const stdout = execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 }).trim();
    const versionLine = stdout.split(/\r?\n/)[0].slice(0, 80);
    return { ok: true, version: versionLine, path: execPath || cmd };
  } catch {
    return { ok: false };
  }
}

export function inspectSystemTools(): Record<string, ToolCheck> {
  const tools: Record<string, ToolCheck> = {};

  const definitions: { name: string; cmd: string; args: string[]; desc: string }[] = [
    { name: 'python', cmd: 'python', args: ['--version'], desc: 'Python Çalışma Zamanı' },
    { name: 'node', cmd: 'node', args: ['--version'], desc: 'Node.js Çalışma Zamanı' },
    { name: 'git', cmd: 'git', args: ['--version'], desc: 'Git Versiyon Kontrol Sistemi' },
    { name: 'gh', cmd: 'gh', args: ['--version'], desc: 'GitHub CLI (Canlı Repo Arama)' },
    { name: 'patent', cmd: 'patent', args: ['--version'], desc: 'Patent CLI (Prior-Art Arama)' },
    { name: 'ffmpeg', cmd: 'ffmpeg', args: ['-version'], desc: 'FFmpeg Multimedya Motoru' },
    { name: 'yt-dlp', cmd: 'yt-dlp', args: ['--version'], desc: 'yt-dlp Medya İndirici' },
    { name: 'deno', cmd: 'deno', args: ['--version'], desc: 'Deno Runtime' }
  ];

  for (const def of definitions) {
    const probe = probeCommand(def.cmd, def.args);
    tools[def.name] = {
      tool: def.name,
      required: false,
      installed: probe.ok,
      version: probe.version,
      path: probe.path,
      notes: def.desc
    };
  }

  return tools;
}

export function runSkillDoctor(skillDir?: string): DoctorReport {
  const sysTools = inspectSystemTools();
  const checks: ToolCheck[] = [];

  let skillName = 'Genel Sistem';
  const requiredTools = new Set<string>();

  if (skillDir && fs.existsSync(skillDir)) {
    skillName = path.basename(path.resolve(skillDir));
    const skillMdPath = path.join(skillDir, 'SKILL.md');
    let skillText = '';
    if (fs.existsSync(skillMdPath)) {
      try {
        skillText = fs.readFileSync(skillMdPath, 'utf8').toLowerCase();
      } catch {}
    }

    const scriptsDir = path.join(skillDir, 'scripts');
    if (fs.existsSync(scriptsDir)) {
      try {
        const scriptFiles = fs.readdirSync(scriptsDir);
        if (scriptFiles.some((f) => f.endsWith('.py'))) requiredTools.add('python');
        if (scriptFiles.some((f) => f.endsWith('.ts') || f.endsWith('.js'))) requiredTools.add('node');
        if (scriptFiles.some((f) => f.endsWith('.sh') || f.endsWith('.ps1'))) requiredTools.add('git');
      } catch {}
    }

    if (skillText.includes('ffmpeg') || skillText.includes('ffprobe')) requiredTools.add('ffmpeg');
    if (skillText.includes('yt-dlp')) requiredTools.add('yt-dlp');
    if (skillText.includes('patent')) requiredTools.add('patent');
    if (skillText.includes('github') || skillText.includes('gh api')) requiredTools.add('gh');
  }

  // Eğer belirli bir skill verilmediyse temel araçların durumunu göster
  if (requiredTools.size === 0) {
    requiredTools.add('python');
    requiredTools.add('node');
    requiredTools.add('git');
    requiredTools.add('gh');
    requiredTools.add('patent');
  }

  let missingCount = 0;
  for (const toolName of Object.keys(sysTools)) {
    const isRequired = requiredTools.has(toolName);
    const item = { ...sysTools[toolName], required: isRequired };
    checks.push(item);
    if (isRequired && !item.installed) {
      missingCount++;
    }
  }

  let status: DoctorReport['status'] = 'READY';
  let summary = `✔ Tüm bağımlılıklar hazır (${skillName}).`;
  if (missingCount > 0) {
    status = 'MISSING_DEPS';
    summary = `⚠️ ${missingCount} zorunlu bağımlılık eksik (${skillName}).`;
  }

  return {
    skillName,
    status,
    checks,
    summary
  };
}
