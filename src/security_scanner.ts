import fs from 'node:fs';
import path from 'node:path';

export interface SecurityFinding {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM';
  category: 'PROMPT_INJECTION' | 'DANGEROUS_COMMAND' | 'EXFILTRATION' | 'DESTRUCTIVE' | 'HIDDEN_CONTENT' | 'SCAN_ERROR';
  description: string;
  match: string;
  file?: string;
  line?: number;
}

export interface ScanResult {
  ok: boolean;
  verdict: 'CLEAN' | 'FLAGGED' | 'DANGEROUS';
  findings: SecurityFinding[];
  summary: string;
}

const INJECTION_PATTERNS: { pattern: RegExp; desc: string; severity: 'CRITICAL' | 'HIGH' }[] = [
  {
    pattern: /ignore\s+(?:all\s+)?(?:previous|prior)\s+(?:instructions|prompts|rules)/i,
    desc: 'Prompt Injection: Önceki talimatları ve sistem kurallarını yok sayma girişimi',
    severity: 'CRITICAL'
  },
  {
    pattern: /disregard\s+(?:all\s+)?(?:system|safety)\s+(?:instructions|guidelines)/i,
    desc: 'Prompt Injection: Sistem güvenlik kurallarını geçersiz kılma girişimi',
    severity: 'CRITICAL'
  },
  {
    pattern: /you\s+are\s+now\s+(?:unrestricted|in\s+developer\s+mode|dan\s+mode)/i,
    desc: 'Jailbreak: Modeli kısıtlamasız moda geçirme deseni',
    severity: 'HIGH'
  },
  {
    pattern: /(?:output|print|reveal|leak|exfiltrate)\s+(?:the\s+)?(?:system\s+prompt|developer\s+prompt|hidden\s+instructions)/i,
    desc: 'Prompt Leaking: Sistem istemini veya gizli talimatları dışarı sızdırma girişimi',
    severity: 'HIGH'
  },
  {
    pattern: /forget\s+(?:all\s+)?(?:your\s+)?(?:previous|prior|above)\s+(?:instructions|context|rules)/i,
    desc: 'Prompt Injection: Önceki bağlamı ve kuralları unutturma girişimi',
    severity: 'HIGH'
  },
  {
    pattern: /(?:new|updated)\s+system\s+(?:prompt|instructions?)\s*[:：]/i,
    desc: 'Prompt Injection: Sahte sistem talimatı bloğu enjekte etme',
    severity: 'HIGH'
  },
  {
    pattern: /do\s+not\s+(?:tell|inform)\s+the\s+user|without\s+(?:telling|informing)\s+the\s+user/i,
    desc: 'Prompt Injection: Kullanıcıdan gizli işlem yapma talimatı',
    severity: 'HIGH'
  },
  {
    pattern: /<!--[^>]*(?:ignore|disregard|override)[^>]*(?:instructions|rules|prompt)[^>]*-->/i,
    desc: 'Gizli Prompt Injection: HTML yorumu içine saklanmış talimat geçersiz kılma',
    severity: 'CRITICAL'
  },
  // --- SkillSpector sınıfları: anti-refusal / uyarı bastırma / jailbreak çerçeveleme ---
  {
    pattern: /\b(?:never|do\s+not|don'?t)\s+refuse\b|\balways\s+comply\b|\bdo\s+anything\s+now\b/i,
    desc: 'Anti-Refusal: modelin reddetme davranışını bastırma / jailbreak çerçevesi',
    severity: 'HIGH'
  },
  {
    pattern: /\b(?:omit|skip|remove|suppress)\s+(?:all\s+)?(?:safety\s+|ethical\s+)?(?:warnings?|disclaimers?|caveats)\b/i,
    desc: 'Anti-Refusal: güvenlik uyarılarını ve yasal notları bastırma talimatı',
    severity: 'HIGH'
  }
];

const DANGEROUS_CMD_PATTERNS: { pattern: RegExp; desc: string; severity: 'CRITICAL' | 'HIGH' | 'MEDIUM'; category?: SecurityFinding['category'] }[] = [
  {
    pattern: /curl\s+[^|\n]+\|\s*(?:ba|z)?sh/i,
    desc: 'Zararlı Kod İndirme: curl pipe to shell (uzaktan kontrolsüz kod çalıştırma)',
    severity: 'CRITICAL'
  },
  {
    pattern: /wget\s+[^|\n]+\|\s*(?:ba|z)?sh/i,
    desc: 'Zararlı Kod İndirme: wget pipe to shell (uzaktan kontrolsüz kod çalıştırma)',
    severity: 'CRITICAL'
  },
  {
    pattern: /iex\s*\(\s*(?:iwr|curl|new-object)/i,
    desc: 'PowerShell IEX: Web üzerinden kontrolsüz betik çalıştırma (Invoke-Expression)',
    severity: 'CRITICAL'
  },
  {
    pattern: /powershell(?:\.exe)?\s+-[eE](?:nc(?:odedcommand)?)?\s+[A-Za-z0-9+/=]{20,}/i,
    desc: 'Obfuscated PowerShell: Base64 ile gizlenmiş komut yürütme',
    severity: 'CRITICAL'
  },
  {
    pattern: /(?:webhook\.site|requestbin\.net|pipedream\.net|transfer\.sh|pastebin\.com\/raw)/i,
    desc: 'Veri Sızdırma (Exfiltration): Bilinen geçici veri toplama URL\'si tespiti',
    severity: 'HIGH',
    category: 'EXFILTRATION'
  },
  {
    pattern: /rm\s+-rf\s+(?:\/|~|\$HOME|\*)/i,
    desc: 'Yıkıcı Komut: Kök veya ana dizini zorla silme girişimi (rm -rf)',
    severity: 'CRITICAL',
    category: 'DESTRUCTIVE'
  },
  {
    pattern: /del\s+\/[fF]\s+\/[sS]\s+\/[qQ]\s+[C-Z]:\\/i,
    desc: 'Yıkıcı Komut: Windows kök sürücüyü zorla silme girişimi',
    severity: 'CRITICAL',
    category: 'DESTRUCTIVE'
  },
  // --- Ek kurallar: yorumlayıcıya aktarma, süreç ikamesi, ters kabuk, kimlik bilgisi sızdırma, yıkıcı komut varyantları ---
  {
    pattern: /\b(?:curl|wget)\b[^\n;&]*\|\s*(?:sudo\s+(?:-\S+\s+)*)?(?:python[0-9.]*|node|perl|ruby|php)\b/i,
    desc: 'Zararlı Kod İndirme: indirilen içerik doğrudan yorumlayıcıya aktarılıyor (curl | python/node/perl)',
    severity: 'CRITICAL'
  },
  {
    pattern: /\b(?:ba|z|da)?sh\s+(?:-c\s+)?["']?\$\(\s*(?:curl|wget)\b|<\(\s*(?:curl|wget)\b/i,
    desc: 'Zararlı Kod İndirme: süreç/komut ikamesiyle uzak betik çalıştırma',
    severity: 'CRITICAL'
  },
  {
    pattern: /\b(?:iwr|irm|invoke-webrequest|invoke-restmethod|curl)\b[^\n]*\|\s*(?:iex|invoke-expression)\b|\b(?:iex|invoke-expression)\b[^\n]*\b(?:downloadstring|net\.webclient|iwr|irm|invoke-webrequest)\b/i,
    desc: 'PowerShell IEX: indirilen içerik Invoke-Expression ile çalıştırılıyor',
    severity: 'CRITICAL'
  },
  {
    pattern: /\bbase64\s+(?:-d|-D|--decode)\b[^\n;&]*\|\s*(?:sudo\s+)?(?:(?:ba|z|da)?sh|python[0-9.]*|node|perl)\b/i,
    desc: 'Gizlenmiş Kod: Base64 çözülüp doğrudan yorumlayıcıya aktarılıyor',
    severity: 'CRITICAL'
  },
  {
    pattern: /\beval\s+["']?\$\(\s*(?:curl|wget|base64)\b|\beval\s*\(\s*(?:atob|Buffer\.from)\(/i,
    desc: 'Dinamik Kod Yürütme: eval ile uzak/kodlanmış içerik çalıştırma',
    severity: 'HIGH'
  },
  {
    pattern: /\/dev\/(?:tcp|udp)\/|\b(?:nc|ncat|netcat)\b[^\n]*\s-[a-z]*e\s|\bbash\s+-i\s*>&/i,
    desc: 'Ters Kabuk (Reverse Shell): saldırgana kabuk erişimi verme girişimi',
    severity: 'CRITICAL'
  },
  {
    pattern: /\brm\s+(?:-[a-z-]+\s+)*(?:-[a-z]*r[a-z]*|--recursive)\s+(?:-[a-z-]+\s+)*(?:--no-preserve-root\s+)?(?:\/\*?|~\/?\*?|\$\{?HOME\}?\/?\*?)(?=[\s;&|"']|$)/i,
    desc: 'Yıkıcı Komut: kök/ana dizini özyinelemeli silme (rm -fr, -Rf, --no-preserve-root varyantları)',
    severity: 'CRITICAL',
    category: 'DESTRUCTIVE'
  },
  {
    pattern: /\bRemove-Item\b[^\n]*-Recurse[^\n]*\s[a-z]:\\\*?(?=[\s"']|$)|\bformat\s+[a-z]:|\b(?:rd|rmdir)\s+(?:\/[sq]\s+)+[a-z]:\\?(?=[\s"']|$)/i,
    desc: 'Yıkıcı Komut: Windows sürücü kökünü özyinelemeli silme veya biçimlendirme',
    severity: 'CRITICAL',
    category: 'DESTRUCTIVE'
  },
  {
    pattern: /\bchmod\s+(?:-[a-z]+\s+)*0?777\s+(?:-[a-z]+\s+)*\/(?=[\s"']|$)|:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/i,
    desc: 'Yıkıcı Komut: kök dizinde herkese yazma izni veya fork bomb',
    severity: 'CRITICAL',
    category: 'DESTRUCTIVE'
  },
  {
    pattern: /\b(?:curl|wget|iwr|invoke-webrequest|nc|ncat|scp)\b[^\n]*(?:\.ssh[\/\\]id_(?:rsa|dsa|ecdsa|ed25519)|\.aws[\/\\]credentials|\.git-credentials|\.npmrc)/i,
    desc: 'Veri Sızdırma: özel anahtar veya kimlik bilgisi dosyası ağ üzerinden gönderiliyor',
    severity: 'HIGH',
    category: 'EXFILTRATION'
  },
  {
    pattern: /\b(?:cat|type|Get-Content|gc)\b[^\n]*(?:\.ssh[\/\\]id_(?:rsa|dsa|ecdsa|ed25519)|\.aws[\/\\]credentials|\.git-credentials)/i,
    desc: 'Kimlik Bilgisi Okuma: özel anahtar / bulut kimlik bilgisi dosyası okunuyor',
    severity: 'HIGH',
    category: 'EXFILTRATION'
  },
  {
    pattern: /\b(?:curl|wget|iwr)\b[^\n]*(?:\$\(\s*(?:env|printenv)\s*\)|`(?:env|printenv)`)/i,
    desc: 'Veri Sızdırma: ortam değişkenleri (env) ağ üzerinden gönderiliyor',
    severity: 'HIGH',
    category: 'EXFILTRATION'
  },
  // --- SkillSpector sınıfları: ortam toplama, dosya keşfi, dinamik kod, gizleme, kalıcılık, bağımlılık yönlendirme, TLS ---
  {
    pattern: /(?:json\.dumps|\bstr|\brepr)\s*\(\s*(?:dict\s*\(\s*)?os\.environ\b|JSON\.stringify\s*\(\s*process\.env\b/,
    desc: 'Ortam Değişkeni Toplama: tüm ortam değişkenleri serileştiriliyor (sızdırma hazırlığı)',
    severity: 'HIGH',
    category: 'EXFILTRATION'
  },
  {
    pattern: /\bfind\s+(?:~|\$HOME|\/home|C:\\Users)[^\n]*-name\s+["']?(?:id_rsa|\*\.pem|\*\.key|\.env|credentials)/i,
    desc: 'Dosya Sistemi Keşfi: hassas anahtar/kimlik dosyaları aranıyor',
    severity: 'HIGH',
    category: 'EXFILTRATION'
  },
  {
    pattern: /\b(?:exec|eval)\s*\(\s*(?:base64\.b64decode|[\w.]*b64decode|atob\b|requests\.|urllib\.|urlopen\b)/,
    desc: 'Dinamik Kod Yürütme (AST8): exec/eval kodlanmış veya ağdan gelen veriyle besleniyor',
    severity: 'CRITICAL'
  },
  {
    pattern: /\bgetattr\s*\(\s*(?:os|builtins|subprocess)\s*,\s*["'](?:system|exec|eval|popen|run)["']/,
    desc: 'Yansıtmalı Kaçış (AST9): getattr ile os.system/exec çağrısı gizleniyor',
    severity: 'HIGH'
  },
  {
    pattern: /\\x[0-9a-f]{2}(?:\\x[0-9a-f]{2}){15,}/i,
    desc: 'Gizlenmiş Kod: uzun onaltılık (\\x..) kaçışlı bayt dizisi',
    severity: 'HIGH'
  },
  {
    pattern: /\bcrontab\s+-|\bschtasks(?:\.exe)?\s+\/create|\bRegister-ScheduledTask\b|>>\s*~?\/?\.(?:bashrc|zshrc|profile)\b|CurrentVersion\\+Run\b/i,
    desc: 'Kalıcılık (Rogue Agent): zamanlanmış görev / başlangıç betiği / Run anahtarı ile oturum kalıcılığı',
    severity: 'HIGH'
  },
  {
    pattern: /--(?:extra-)?index-url\s+https?:\/\/(?!pypi\.org|files\.pythonhosted\.org)|\bnpm\s+config\s+set\s+registry\b|\bpip\s+config\s+set\s+global\.index-url\b/i,
    desc: 'Bağımlılık Kaynağı Yönlendirme: paket indeksi/kaydı üçüncü taraf adrese çevriliyor',
    severity: 'HIGH'
  },
  {
    pattern: /\bcurl\b[^\n]*\s(?:-k|--insecure)\b|\bverify\s*=\s*False\b|NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0|\brejectUnauthorized\s*:\s*false\b/i,
    desc: 'Güvensiz Varsayılan: TLS sertifika doğrulaması kapatılıyor',
    severity: 'MEDIUM'
  },
  {
    pattern: /\bshell\s*=\s*True\b|\bos\.system\s*\(/,
    desc: 'Araç Kötüye Kullanımı: kabuk üzerinden komut çalıştırma (shell=True / os.system); girdiyle besleniyorsa enjeksiyon riski',
    severity: 'MEDIUM'
  },
  {
    pattern: /(?:>>?|\btee\s+(?:-a\s+)?|\bSet-Content\s+|\bAdd-Content\s+)[^\n]*(?:\.claude[\/\\]settings|CLAUDE\.md|AGENTS\.md|\.gemini[\/\\](?:settings|config))/i,
    desc: 'Bellek/Yapılandırma Zehirlenmesi: ajan ayar veya talimat dosyasına yazılıyor',
    severity: 'MEDIUM'
  }
];

// Gizli karakterler: sıfır genişlikli / çift yönlü (bidi) denetim karakterleri ve satır ortasında BOM.
// İnsan gözüyle görünmeyen talimat ve "Trojan Source" türü kod gizlemede kullanılır.
// U+200C/U+200D (ZWNJ/ZWJ) bilinçli dışarıda: emoji dizileri ve birçok yazı sisteminde meşrudur.
// Unicode "tag" karakterleri (U+E0000-E007F) LLM'lere görünmez talimat taşımak için kullanılır.
const cp = (hex: string) => String.fromCodePoint(parseInt(hex, 16));
const HIDDEN_CHARS = new RegExp(
  '[' + ['200B', '200E-200F', '202A-202E', '2060-2064', '2066-2069'].map((r) => r.split('-').map(cp).join('-')).join('') + ']'
  + '|[' + cp('E0000') + '-' + cp('E007F') + ']|(?!^)' + cp('FEFF'), 'u');

// Homoglif: aynı sözcükte Latin + Kiril harfi (örn. Latin "a" yerine Kiril "а") — komut/yol adı taklidi ve Unicode aldatmacası.
// Yalnızca Kiril: Yunan harfleri matematik metinlerinde Latin ile bitişik meşrudur (Δt gibi).
const CYRILLIC = cp('0400') + '-' + cp('04FF');
const MIXED_SCRIPT = new RegExp('[A-Za-z]+[' + CYRILLIC + ']+\\w*|[' + CYRILLIC + ']+[A-Za-z]+\\w*', 'u');

const MAX_FILE_BYTES = 1024 * 1024;
const BINARY_EXTENSIONS = ['.pyc', '.pyo', '.so', '.dll', '.exe', '.dylib', '.bin', '.class', '.jar', '.wasm'];
const SCAN_EXTENSIONS = ['.md', '.py', '.sh', '.bash', '.zsh', '.ps1', '.psm1', '.bat', '.cmd', '.ts', '.js', '.mjs', '.cjs', '.json', '.yaml', '.yml', '.toml', '.txt', '.rb', '.php'];
const SCAN_BASENAMES = ['Dockerfile', 'Makefile', 'SKILL'];

/** Satır sonu ters eğik çizgiyle devam eden komutları tek mantıksal satırda birleştirir (bölünmüş komutla kaçışı engeller); satır numarası ilk satırı gösterir. */
function logicalLines(content: string): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = [];
  const raw = content.split(/\r?\n/);
  for (let i = 0; i < raw.length; i++) {
    let text = raw[i];
    const start = i + 1;
    while (/\\\s*$/.test(text) && i + 1 < raw.length) {
      text = text.replace(/\\\s*$/, ' ') + raw[++i].trim();
    }
    out.push({ text, line: start });
  }
  return out;
}

export function scanTextContent(content: string, fileName = 'content'): SecurityFinding[] {
  const findings: SecurityFinding[] = [];
  const seen = new Set<string>();
  const lines = logicalLines(content).map((l) => l.text);
  const lineNo = logicalLines(content).map((l) => l.line);

  // Gizli (görünmez) karakterler: ham satırlar üzerinde
  content.split(/\r?\n/).forEach((raw, idx) => {
    if (/^[ \t]{150,}\S/.test(raw)) {
      findings.push({
        severity: 'HIGH', category: 'HIDDEN_CONTENT',
        description: 'Boşluk Dolgusu (P9): satır başında yüzlerce boşluk, metni görünür alanın dışına itiyor',
        match: `${raw.length - raw.trimStart().length} boşluk`, file: fileName, line: idx + 1
      });
    }
    const mixed = MIXED_SCRIPT.exec(raw);
    if (mixed) {
      findings.push({
        severity: 'HIGH', category: 'HIDDEN_CONTENT',
        description: 'Unicode Aldatmacası (TP2): aynı sözcükte Latin + Kiril harf karışımı (homoglif)',
        match: mixed[0].slice(0, 40), file: fileName, line: idx + 1
      });
    }
    const hidden = HIDDEN_CHARS.exec(raw);
    if (hidden) {
      findings.push({
        severity: 'HIGH',
        category: 'HIDDEN_CONTENT',
        description: 'Gizli Karakter: sıfır genişlikli / çift yönlü denetim karakteri (görünmez talimat veya Trojan Source riski)',
        match: `U+${hidden[0].codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`,
        file: fileName,
        line: idx + 1
      });
    }
  });

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Aynı satır + aynı eşleşme iki kuralda birden bulunursa tek bulgu olarak raporlanır
    const add = (finding: SecurityFinding) => {
      const key = `${finding.line}|${finding.match.toLowerCase()}`;
      if (seen.has(key)) return;
      seen.add(key);
      findings.push(finding);
    };

    // Injection kontrolü
    for (const rule of INJECTION_PATTERNS) {
      const match = rule.pattern.exec(line);
      if (match) {
        add({
          severity: rule.severity,
          category: 'PROMPT_INJECTION',
          description: rule.desc,
          match: match[0],
          file: fileName,
          line: lineNo[i]
        });
      }
    }

    // Tehlikeli komut kontrolü
    for (const rule of DANGEROUS_CMD_PATTERNS) {
      const match = rule.pattern.exec(line);
      if (match) {
        add({
          severity: rule.severity,
          category: rule.category ?? 'DANGEROUS_COMMAND',
          description: rule.desc,
          match: match[0],
          file: fileName,
          line: lineNo[i]
        });
      }
    }
  }

  return findings;
}

export function scanSkillDirectory(skillDir: string): ScanResult {
  const resolved = path.resolve(skillDir);
  if (!fs.existsSync(resolved)) {
    return {
      ok: false,
      verdict: 'FLAGGED',
      findings: [{
        severity: 'HIGH',
        category: 'DESTRUCTIVE',
        description: 'Taranacak beceri dizini bulunamadı',
        match: resolved
      }],
      summary: `Hata: ${resolved} dizini mevcut değil.`
    };
  }

  const findings: SecurityFinding[] = [];

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = path.relative(resolved, fullPath);
      if (entry.isSymbolicLink()) {
        // Sembolik bağlar izlenmez (beceri dizini dışına çıkan path traversal); doğrulanamadığı için işaretlenir
        findings.push({
          severity: 'MEDIUM', category: 'SCAN_ERROR',
          description: 'Sembolik bağ izlenmedi: hedef beceri dizini dışında olabilir, içeriği taranamadı',
          match: entry.name, file: relPath
        });
      } else if (entry.isDirectory()) {
        if (entry.name === '__pycache__') {
          // Derlenmiş bytecode kaynak kodla eşleşmeyebilir ve taranamaz (SC8): sessizce atlanmaz
          findings.push({
            severity: 'MEDIUM', category: 'SCAN_ERROR',
            description: 'Derlenmiş Python bytecode (__pycache__) dağıtılıyor: içeriği kaynakla eşleşmeyebilir, taranamadı',
            match: entry.name, file: relPath
          });
        } else if (!['.git', 'node_modules', '.venv'].includes(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (BINARY_EXTENSIONS.includes(ext)) {
          findings.push({
            severity: 'MEDIUM', category: 'SCAN_ERROR',
            description: `İkili/derlenmiş yürütülebilir dosya (${ext}) beceri içinde dağıtılıyor: içeriği taranamaz`,
            match: entry.name, file: relPath
          });
          continue;
        }
        if (SCAN_EXTENSIONS.includes(ext) || SCAN_BASENAMES.includes(entry.name)) {
          try {
            if (fs.statSync(fullPath).size > MAX_FILE_BYTES) {
              findings.push({
                severity: 'MEDIUM', category: 'SCAN_ERROR',
                description: `Dosya ${MAX_FILE_BYTES / 1024} KB sınırını aşıyor, taranamadı`,
                match: entry.name, file: relPath
              });
              continue;
            }
            const content = fs.readFileSync(fullPath, 'utf8');
            findings.push(...scanTextContent(content, relPath));
          } catch (err) {
            // Sessizce yutma: okunamayan dosya "temiz" sayılmaz
            findings.push({
              severity: 'MEDIUM', category: 'SCAN_ERROR',
              description: `Dosya okunamadı, taranamadı: ${(err as Error).message}`,
              match: entry.name, file: relPath
            });
          }
        }
      }
    }
  }

  walk(resolved);

  const hasCritical = findings.some((f) => f.severity === 'CRITICAL');
  const hasHigh = findings.some((f) => f.severity === 'HIGH');

  let verdict: 'CLEAN' | 'FLAGGED' | 'DANGEROUS' = 'CLEAN';
  // Taranamayan içerik (sembolik bağ, dev dosya, okuma hatası) güvenli sayılmaz: en az FLAGGED
  const unverified = findings.some((f) => f.category === 'SCAN_ERROR');
  if (hasCritical) verdict = 'DANGEROUS';
  else if (hasHigh || unverified) verdict = 'FLAGGED';

  const summary = findings.length === 0
    ? '✔ Güvenlik Taraması Başarılı: Zararlı prompt injection veya yıkıcı komut tespit edilmedi.'
    : `⚠️ ${findings.length} güvenlik bulgusu tespit edildi (${findings.filter(f => f.severity === 'CRITICAL').length} Kritik, ${findings.filter(f => f.severity === 'HIGH').length} Yüksek).`;

  return {
    ok: !hasCritical,
    verdict,
    findings,
    summary
  };
}
