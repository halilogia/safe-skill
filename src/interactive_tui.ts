import readline from 'node:readline';

export interface MenuItem {
  key: string;
  label: string;
  description: string;
  action: () => Promise<void> | void;
}

export function printBanner(): void {
  console.clear();
  console.log(`\x1b[36m╔═══════════════════════════════════════════════════════════════════════════╗\x1b[0m`);
  console.log(`\x1b[36m║\x1b[0m   \x1b[1;32m🛡️  SAFE-SKILL\x1b[0m \x1b[90m·\x1b[0m The Security-First Agent Skill Manager           \x1b[36m║\x1b[0m`);
  console.log(`\x1b[36m║\x1b[0m   \x1b[90mBuilt for Claude Code, Cursor, Windsurf & Google Antigravity        \x1b[36m║\x1b[0m`);
  console.log(`\x1b[36m╚═══════════════════════════════════════════════════════════════════════════╝\x1b[0m`);
  console.log(`\x1b[90mS0/S1 Security Gate · SHA-256 Passport · Dependency Doctor · Cross-Ecosystem\x1b[0m\n`);
}

export async function askQuestion(promptText: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function runInteractiveMenu(menuItems: MenuItem[]): Promise<void> {
  printBanner();
  console.log(`\x1b[1mEtkileşimli Menüden Bir İşlem Seçin:\x1b[0m\n`);

  for (let i = 0; i < menuItems.length; i++) {
    const item = menuItems[i];
    console.log(`  \x1b[1;33m[${item.key}]\x1b[0m \x1b[1m${item.label}\x1b[0m`);
    console.log(`      \x1b[90m└─ ${item.description}\x1b[0m`);
  }
  console.log('');

  const choice = await askQuestion(`\x1b[32mSeçiminiz (1-${menuItems.length}) veya çıkış için [q]: \x1b[0m`);

  if (choice.toLowerCase() === 'q' || choice === '0') {
    console.log('\n👋 Güvenli oturum sonlandırıldı.\n');
    return;
  }

  const selected = menuItems.find((m) => m.key.toLowerCase() === choice.toLowerCase());
  if (selected) {
    console.log(`\n\x1b[36m▶ ${selected.label} başlatılıyor...\x1b[0m\n`);
    await selected.action();
  } else {
    console.log(`\n\x1b[31m⚠️ Geçersiz seçim: "${choice}". Lütfen menüdeki numaralardan birini girin.\x1b[0m\n`);
  }
}
