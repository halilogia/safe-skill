import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export type AgentEcosystem = 'claude' | 'antigravity' | 'cursor';

export interface TargetResolution {
  ecosystem: AgentEcosystem;
  scope: 'global' | 'workspace';
  skillsDir: string;
  targetDir: string;
  targetFile: string;
  isCursorRule: boolean;
}

/**
 * Mevcut proje dizinindeki ajan yapılandırma izlerini inceler ve varsayılan hedefi belirler.
 */
export function detectEcosystem(cwd: string = process.cwd()): AgentEcosystem {
  if (fs.existsSync(path.join(cwd, '.claude')) || fs.existsSync(path.join(cwd, 'CLAUDE.md'))) {
    return 'claude';
  }
  if (fs.existsSync(path.join(cwd, '.cursor'))) {
    return 'cursor';
  }
  if (fs.existsSync(path.join(cwd, '.gemini')) || fs.existsSync(path.join(cwd, '.agent'))) {
    return 'antigravity';
  }
  return 'antigravity';
}

/**
 * Verilen hedef ajan ve kapsama göre kurulum dizinini ve hedef dosya yolunu belirler.
 */
export function resolveTargetInstallPath(options: {
  ecosystem?: AgentEcosystem | 'auto';
  skillName: string;
  scope?: 'global' | 'workspace' | null;
  customPath?: string | null;
  cwd?: string;
}): TargetResolution {
  const cwd = options.cwd ? path.resolve(options.cwd) : process.cwd();
  const home = os.homedir();
  const rawEco = options.ecosystem && options.ecosystem !== 'auto' ? options.ecosystem : detectEcosystem(cwd);
  const ecosystem: AgentEcosystem = rawEco;
  const scope: 'global' | 'workspace' = options.scope ?? (options.customPath ? 'workspace' : 'global');
  const skillName = options.skillName;

  if (options.customPath) {
    const customDir = path.resolve(options.customPath);
    return {
      ecosystem,
      scope,
      skillsDir: customDir,
      targetDir: path.join(customDir, skillName),
      targetFile: path.join(customDir, skillName, 'SKILL.md'),
      isCursorRule: false
    };
  }

  if (ecosystem === 'claude') {
    const skillsDir = scope === 'workspace'
      ? path.join(cwd, '.claude', 'skills')
      : path.join(home, '.claude', 'skills');
    return {
      ecosystem: 'claude',
      scope,
      skillsDir,
      targetDir: path.join(skillsDir, skillName),
      targetFile: path.join(skillsDir, skillName, 'SKILL.md'),
      isCursorRule: false
    };
  }

  if (ecosystem === 'cursor') {
    const rulesDir = scope === 'workspace'
      ? path.join(cwd, '.cursor', 'rules')
      : path.join(home, '.cursor', 'rules');
    return {
      ecosystem: 'cursor',
      scope,
      skillsDir: rulesDir,
      targetDir: rulesDir,
      targetFile: path.join(rulesDir, `${skillName}.mdc`),
      isCursorRule: true
    };
  }

  // Antigravity (Varsayılan)
  const skillsDir = scope === 'workspace'
    ? path.join(cwd, '.gemini', 'skills')
    : path.join(home, '.gemini', 'config', 'skills');

  return {
    ecosystem: 'antigravity',
    scope,
    skillsDir,
    targetDir: path.join(skillsDir, skillName),
    targetFile: path.join(skillsDir, skillName, 'SKILL.md'),
    isCursorRule: false
  };
}

/**
 * İndirilen markdown içeriğini hedef ajana (Cursor .mdc veya standart SKILL.md) uyarlar.
 */
export function adaptContentForTarget(content: string, ecosystem: AgentEcosystem, skillName: string): string {
  if (ecosystem !== 'cursor') {
    return content;
  }

  // Cursor .mdc formatı: description, globs, alwaysApply alanlarını içerir.
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!fmMatch) {
    return `---\ndescription: ${skillName} skill instructions\nglobs: "*"\nalwaysApply: false\n---\n\n${content}`;
  }

  const existingFm = fmMatch[1];
  const body = fmMatch[2];

  let desc = `${skillName} skill instructions`;
  const descMatch = existingFm.match(/description:\s*(.+)/);
  if (descMatch) {
    desc = descMatch[1].trim();
  }

  const newFm = [
    '---',
    `description: ${desc}`,
    'globs: "*"',
    'alwaysApply: false',
    '---'
  ].join('\n');

  return `${newFm}\n\n${body}`;
}
