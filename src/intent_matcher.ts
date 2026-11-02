import { getAllAnthropicSkills, type AnthropicSkillMeta } from './anthropic_catalog.ts';

export interface IntentMatchResult {
  skill: AnthropicSkillMeta;
  score: number;
  matchedConcepts: string[];
  recommendedReason: string;
}

const INTENT_ONTOLOGY: Record<string, { tags: string[]; skills: string[] }> = {
  frontend_ui: {
    tags: ['arayuz', 'ui', 'ux', 'tasarim', 'design', 'css', 'tailwind', 'html', 'frontend', 'web', 'component', 'stil', 'responsive'],
    skills: ['frontend-design', 'react-best-practices', 'vue-development', 'web-artifacts-builder']
  },
  api_backend: {
    tags: ['backend', 'api', 'rest', 'endpoint', 'graphql', 'express', 'fastapi', 'server', 'sunucu', 'microservice'],
    skills: ['api-design', 'backend-architecture', 'mcp-builder']
  },
  testing_quality: {
    tags: ['test', 'unit', 'integration', 'e2e', 'jest', 'vitest', 'pytest', 'kalite', 'qa', 'coverage', 'mock'],
    skills: ['webapp-testing', 'playwright-testing', 'code-review']
  },
  git_workflow: {
    tags: ['git', 'commit', 'branch', 'pr', 'pull request', 'merge', 'rebase', 'versiyon', 'depo', 'github'],
    skills: ['git-workflow', 'code-review']
  },
  security_audit: {
    tags: ['guvenlik', 'security', 'injection', 'audit', 'tarama', 'zafiyet', 'vulnerability', 's0', 's1', 'auth', 'sifreleme'],
    skills: ['security-guidance', 'safe-skill']
  },
  database_sql: {
    tags: ['veritabani', 'database', 'sql', 'postgres', 'sqlite', 'mysql', 'prisma', 'orm', 'tablo', 'migration'],
    skills: ['database-design', 'sql-optimizer']
  },
  devops_deployment: {
    tags: ['devops', 'docker', 'ci', 'cd', 'pipeline', 'kubernetes', 'deploy', 'dagitim', 'actions', 'workflow'],
    skills: ['docker-dev', 'github-actions']
  },
  refactor_clean_code: {
    tags: ['refactor', 'temiz kod', 'clean code', 'sadelestirme', 'mimari', 'solid', 'dry', 'kod inceleme', 'optimizasyon'],
    skills: ['code-review', 'skill-creator']
  }
};

export function matchUserIntent(prompt: string, limit = 5): IntentMatchResult[] {
  const normalized = prompt.toLowerCase();
  const words = normalized.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 1);
  const allSkills = getAllAnthropicSkills();

  const results: IntentMatchResult[] = [];

  for (const skill of allSkills) {
    let score = 0;
    const matchedConcepts: string[] = [];

    // 1. Isim ve id eslesme kontrolu
    if (normalized.includes(skill.id.toLowerCase()) || normalized.includes(skill.name.toLowerCase())) {
      score += 50;
      matchedConcepts.push(`isim: ${skill.name}`);
    }

    // 2. Aciklama ve tag frekansi
    const descLower = (skill.descriptionEn + ' ' + skill.descriptionTr + ' ' + skill.category + ' ' + skill.tags.join(' ')).toLowerCase();
    for (const w of words) {
      if (descLower.includes(w)) {
        score += 8;
        matchedConcepts.push(w);
      }
    }

    // 3. Semantik Niyet Ontolojisi
    for (const [intentKey, data] of Object.entries(INTENT_ONTOLOGY)) {
      const hasIntentWord = words.some(w => data.tags.some(tag => tag.includes(w) || w.includes(tag)));
      if (hasIntentWord) {
        if (data.skills.includes(skill.id) || data.skills.includes(skill.name.toLowerCase())) {
          score += 30;
          matchedConcepts.push(`niyet: ${intentKey}`);
        } else if (skill.category.toLowerCase().includes(intentKey.split('_')[0])) {
          score += 12;
        }
      }
    }

    if (score > 0) {
      const uniqueConcepts = Array.from(new Set(matchedConcepts));
      results.push({
        skill,
        score,
        matchedConcepts: uniqueConcepts,
        recommendedReason: `${uniqueConcepts.slice(0, 3).join(', ')} gereksinimiyle eslesti.`
      });
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
