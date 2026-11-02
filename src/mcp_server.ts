import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import { scanTextContent, scanSkillDirectory, type SecurityFinding } from './security_scanner.ts';
import { searchAnthropicSkills, getAnthropicSkill, ANTHROPIC_OFFICIAL_SKILLS, generateBuiltinSkillContent } from './anthropic_catalog.ts';
import { resolveTargetInstallPath, adaptContentForTarget, detectEcosystem, type AgentEcosystem } from './ecosystem_targets.ts';
import { verifyPassportIntegrity, generateSkillPassport, saveSkillPassport, loadSkillPassport } from './skill_passport.ts';
import { runSkillDoctor } from './dependency_doctor.ts';
import { checkAllSkillsUpdates, checkSingleSkillUpdate } from './update_checker.ts';
import { matchUserIntent } from './intent_matcher.ts';
import { checkSecurityAdvisories } from './security_advisories.ts';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: string | number | null;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export const MCP_TOOLS = [
  {
    name: 'scan_skill',
    description: 'Statik AST ve Regex guvenlik kapisiyla bir SKILL.md icerigini veya dosyasini tarar. Prompt injection, zararli komut ve sizdirma desenlerini raporlar.',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Taranacak SKILL.md metin icerigi' },
        skillName: { type: 'string', description: 'Istege bagli beceri adi' }
      },
      required: ['content']
    }
  },
  {
    name: 'search_skills',
    description: 'Anthropic resmi katalogunda ve dogrulanmis becerilerde anahtar kelimeye gore arama yapar.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Arama terimi veya teknoloji (orn: frontend, mcp, data, git)' },
        limit: { type: 'number', description: 'Maksimum sonuc sayisi (varsayilan: 10)' }
      },
      required: ['query']
    }
  },
  {
    name: 'match_intent',
    description: 'Dogal dil gelistirici istegini (orn: "PostgreSQL optimize et", "UI tasarimi yap") en uygun becerilerle semantik eslestirir.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Gelistiricinin dogal dil istegi' },
        limit: { type: 'number', description: 'Maksimum eslesme sayisi (varsayilan: 5)' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'install_safe_skill',
    description: 'Bir Anthropic resmi becerisini guvenlik kontrolunden gecirip hedef ajana (.claude, .cursor, antigravity) guvenle kurar.',
    inputSchema: {
      type: 'object',
      properties: {
        skillName: { type: 'string', description: 'Kurulacak beceri adi (orn: frontend-design)' },
        target: { type: 'string', enum: ['claude', 'antigravity', 'cursor', 'auto'], description: 'Hedef ajan ekosistemi' },
        global: { type: 'boolean', description: 'Global olarak kullanici ana dizinine mi kurulsun?' }
      },
      required: ['skillName']
    }
  },
  {
    name: 'verify_passport',
    description: 'Kurulu bir becerinin SHA-256 kriptografik pasaportunu (passport.json) ve butunlugunu denetler.',
    inputSchema: {
      type: 'object',
      properties: {
        skillName: { type: 'string', description: 'Dogrulanacak beceri adi' },
        skillPath: { type: 'string', description: 'Beceri tam dizin yolu (opsiyonel)' },
        target: { type: 'string', enum: ['claude', 'antigravity', 'cursor'] }
      }
    }
  },
  {
    name: 'diagnose_dependencies',
    description: 'Bir becerinin ihtiyac duydugu calisma zamani araclarini (node, python, git, gh, ffmpeg vb.) onceden teshis eder.',
    inputSchema: {
      type: 'object',
      properties: {
        skillName: { type: 'string', description: 'Analiz edilecek beceri adi' },
        skillDir: { type: 'string', description: 'Analiz edilecek beceri dizini (opsiyonel)' }
      }
    }
  },
  {
    name: 'check_updates',
    description: 'Kurulu becerilerin guncellik ve sabotaj (tamper) durumlarini kontrol eder.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', enum: ['claude', 'antigravity', 'cursor'] }
      }
    }
  },
  {
    name: 'check_advisories',
    description: 'Bir beceri kaynagini veya SHA-256 ozetini bilinen zararli repo ve guvenlik bultenlerine karsi sorgular.',
    inputSchema: {
      type: 'object',
      properties: {
        skillIdentifier: { type: 'string', description: 'Beceri repo adi veya URL' },
        content: { type: 'string', description: 'Istege bagli incelenecek icerik' }
      },
      required: ['skillIdentifier']
    }
  }
];

export async function handleToolCall(name: string, args: any): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }> {
  try {
    switch (name) {
      case 'scan_skill': {
        const content = args.content || '';
        const skillName = args.skillName || 'skill-content';
        const findings = scanTextContent(content, skillName);
        const advisory = checkSecurityAdvisories(skillName, content);
        const hasCritical = findings.some(f => f.severity === 'CRITICAL');
        const hasHigh = findings.some(f => f.severity === 'HIGH');
        const passed = !hasCritical && !hasHigh && advisory.safe;

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              passed,
              verdict: !passed ? 'DANGEROUS' : findings.length > 0 ? 'FLAGGED' : 'CLEAN',
              findingsCount: findings.length,
              findings,
              advisorySafe: advisory.safe,
              advisoryFindings: advisory.findings
            }, null, 2)
          }],
          isError: !passed
        };
      }

      case 'search_skills': {
        const query = args.query || '';
        const results = searchAnthropicSkills(query);
        const limit = typeof args.limit === 'number' ? args.limit : 10;
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(results.slice(0, limit), null, 2)
          }]
        };
      }

      case 'match_intent': {
        const prompt = args.prompt || '';
        const limit = typeof args.limit === 'number' ? args.limit : 5;
        const matches = matchUserIntent(prompt, limit);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(matches, null, 2)
          }]
        };
      }

      case 'install_safe_skill': {
        const target = (args.target === 'auto' || !args.target ? detectEcosystem() : args.target) as AgentEcosystem;
        const found = getAnthropicSkill(args.skillName);

        if (!found) {
          return {
            content: [{ type: 'text', text: `[ERROR] Beceri '${args.skillName}' Anthropic resmi katalogunda bulunamadi.` }],
            isError: true
          };
        }

        const template = generateBuiltinSkillContent(found);
        const findings = scanTextContent(template, found.name);
        const advisory = checkSecurityAdvisories(found.name, template);
        const hasCritical = findings.some(f => f.severity === 'CRITICAL');
        const hasHigh = findings.some(f => f.severity === 'HIGH');

        if (hasCritical || hasHigh || !advisory.safe) {
          return {
            content: [{
              type: 'text',
              text: `[SECURITY BLOCK] Beceri '${found.name}' guvenlik kapisindan gecemedi.\n` + JSON.stringify({ findings, advisory: advisory.findings }, null, 2)
            }],
            isError: true
          };
        }

        const installPath = resolveTargetInstallPath({
          ecosystem: target,
          isGlobal: Boolean(args.global),
          skillName: found.name
        });

        fs.mkdirSync(installPath, { recursive: true });
        const targetFile = target === 'cursor' ? path.join(installPath, `${found.name}.mdc`) : path.join(installPath, 'SKILL.md');
        const adapted = adaptContentForTarget(template, target, found.name);
        fs.writeFileSync(targetFile, adapted, 'utf8');

        const passport = generateSkillPassport(installPath, {
          name: found.name,
          sourceUrl: `https://github.com/anthropics/anthropic-quickstarts/tree/main/skills/${found.name}`,
          installedTarget: target,
          allowedTools: []
        });
        saveSkillPassport(installPath, passport);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              status: 'SUCCESS',
              message: `Beceri '${found.name}' basariyla kuruldu ve pasaportu muhurlendi.`,
              skill: found.name,
              target,
              installPath,
              sha256: passport.fileSha256
            }, null, 2)
          }]
        };
      }

      case 'verify_passport': {
        let dir = args.skillPath;
        if (!dir && args.skillName) {
          const target = (args.target || detectEcosystem()) as AgentEcosystem;
          const candidateLocal = resolveTargetInstallPath({ ecosystem: target, isGlobal: false, skillName: args.skillName });
          const candidateGlobal = resolveTargetInstallPath({ ecosystem: target, isGlobal: true, skillName: args.skillName });
          dir = fs.existsSync(candidateLocal) ? candidateLocal : candidateGlobal;
        }

        if (!dir || !fs.existsSync(dir)) {
          return {
            content: [{ type: 'text', text: `[ERROR] Beceri dizini bulunamadi: ${dir || args.skillName}` }],
            isError: true
          };
        }

        const integrity = verifyPassportIntegrity(dir);
        const passport = loadSkillPassport(dir);

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              skillPath: dir,
              valid: integrity.valid,
              reason: integrity.reason || 'Integrity OK',
              passport
            }, null, 2)
          }],
          isError: !integrity.valid
        };
      }

      case 'diagnose_dependencies': {
        let skillDir = args.skillDir;
        if (!skillDir && args.skillName) {
          const target = detectEcosystem();
          const candidate = resolveTargetInstallPath({ ecosystem: target, isGlobal: false, skillName: args.skillName });
          if (fs.existsSync(candidate)) skillDir = candidate;
        }

        const report = runSkillDoctor(skillDir);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(report, null, 2)
          }]
        };
      }

      case 'check_updates': {
        const target = (args.target || detectEcosystem()) as AgentEcosystem;
        const reports = await checkAllSkillsUpdates(target);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(reports, null, 2)
          }]
        };
      }

      case 'check_advisories': {
        const res = checkSecurityAdvisories(args.skillIdentifier || 'unknown', args.content || '');
        return {
          content: [{
            type: 'text',
            text: JSON.stringify(res, null, 2)
          }],
          isError: !res.safe
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `[ERROR] Bilinmeyen arac: ${name}` }],
          isError: true
        };
    }
  } catch (err: any) {
    return {
      content: [{ type: 'text', text: `[ERROR] Arac yurutme hatasi: ${err.message}` }],
      isError: true
    };
  }
}

export function startMcpServer(): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  const sendResponse = (res: JsonRpcResponse) => {
    process.stdout.write(JSON.stringify(res) + '\n');
  };

  rl.on('line', async (line) => {
    line = line.trim();
    if (!line) return;

    let req: JsonRpcRequest;
    try {
      req = JSON.parse(line);
    } catch {
      sendResponse({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error: Gecersiz JSON' }
      });
      return;
    }

    const { id, method, params } = req;

    switch (method) {
      case 'initialize':
        sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {}
            },
            serverInfo: {
              name: 'safe-skill',
              version: '1.0.0'
            }
          }
        });
        break;

      case 'notifications/initialized':
        // Bildirim cevabi gerektirmez
        break;

      case 'ping':
        sendResponse({
          jsonrpc: '2.0',
          id,
          result: {}
        });
        break;

      case 'tools/list':
        sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            tools: MCP_TOOLS
          }
        });
        break;

      case 'tools/call': {
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};
        const callResult = await handleToolCall(toolName, toolArgs);
        sendResponse({
          jsonrpc: '2.0',
          id,
          result: callResult
        });
        break;
      }

      default:
        sendResponse({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`
          }
        });
        break;
    }
  });

  process.stderr.write('[safe-skill] MCP Server running on STDIO (JSON-RPC 2.0)...\n');
}