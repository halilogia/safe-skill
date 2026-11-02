export interface SecurityAdvisory {
  id: string;
  targetPattern: string; // Repo adı, dosya hash'i veya URL deseni
  type: 'MALICIOUS_REPO' | 'COMPROMISED_HASH' | 'EXFILTRATION_HOST' | 'OBFUSCATED_PAYLOAD';
  severity: 'CRITICAL' | 'HIGH';
  title: string;
  description: string;
  publishedAt: string;
}

export const KNOWN_ADVISORIES: SecurityAdvisory[] = [
  {
    id: 'ADV-2026-001',
    targetPattern: 'evil-dev/',
    type: 'MALICIOUS_REPO',
    severity: 'CRITICAL',
    title: 'Zararlı Kimlik Bilgisi Avcısı (Credential Harvester)',
    description: 'SSH anahtarlarını (~/.ssh/id_rsa) ve .env dosyalarını uzaktaki sunucuya sızdıran sahte beceri deposu.',
    publishedAt: '2026-10-15'
  },
  {
    id: 'ADV-2026-002',
    targetPattern: 'evil.site',
    type: 'EXFILTRATION_HOST',
    severity: 'CRITICAL',
    title: 'Bilinen Veri Sızdırma Uç Noktası (Exfiltration Endpoint)',
    description: 'AI ajanlarından çalınan oturum çerezleri ve gizli anahtarların toplandığı kara liste sunucusu.',
    publishedAt: '2026-10-20'
  },
  {
    id: 'ADV-2026-003',
    targetPattern: 'curl -X POST https://pastebin.com/api',
    type: 'EXFILTRATION_HOST',
    severity: 'HIGH',
    title: 'Yetkisiz Pastebin Sızdırma Kanalı',
    description: 'Sistem promptlarını ve kullanıcı dosyalarını açık pastebin kanallarına aktarma deseni.',
    publishedAt: '2026-10-28'
  },
  {
    id: 'ADV-2026-004',
    targetPattern: 'exec(base64.b64decode(',
    type: 'OBFUSCATED_PAYLOAD',
    severity: 'CRITICAL',
    title: 'Gizlenmiş Python Yürütme Kodu',
    description: 'Güvenlik tarayıcılarını atlatmak için base64 ile şifrelenmiş dinamik komut çalıştırma.',
    publishedAt: '2026-11-01'
  }
];

export interface AdvisoryCheckResult {
  hasAdvisory: boolean;
  blocked: boolean;
  safe: boolean;
  advisories: SecurityAdvisory[];
  findings: SecurityAdvisory[];
}

export function checkSecurityAdvisories(skillIdentifier: string, content: string, fileSha256?: string): AdvisoryCheckResult {
  const matched: SecurityAdvisory[] = [];

  for (const adv of KNOWN_ADVISORIES) {
    let hits = false;

    if (adv.type === 'MALICIOUS_REPO' && skillIdentifier.toLowerCase().includes(adv.targetPattern.toLowerCase())) {
      hits = true;
    } else if (adv.type === 'EXFILTRATION_HOST' && content.includes(adv.targetPattern)) {
      hits = true;
    } else if (adv.type === 'OBFUSCATED_PAYLOAD' && content.includes(adv.targetPattern)) {
      hits = true;
    } else if (adv.type === 'COMPROMISED_HASH' && fileSha256 && fileSha256 === adv.targetPattern) {
      hits = true;
    }

    if (hits) {
      matched.push(adv);
    }
  }

  const isBlocked = matched.some(m => m.severity === 'CRITICAL');

  return {
    hasAdvisory: matched.length > 0,
    blocked: isBlocked,
    safe: !isBlocked && matched.length === 0,
    advisories: matched,
    findings: matched
  };
}
