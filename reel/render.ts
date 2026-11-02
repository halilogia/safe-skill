import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.resolve(__dirname, 'index.html');
const outDir = __dirname;
const outMp4 = path.join(outDir, 'safe-skill-reel.mp4');

const homeDir = os.homedir();
const userProfile = process.env.USERPROFILE || homeDir;
const localAppData = process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local');

const FFMPEG_CANDIDATE = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages', 'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe', 'ffmpeg-8.1.2-full_build', 'bin', 'ffmpeg.exe');
const FFMPEG_BIN = fs.existsSync(FFMPEG_CANDIDATE) ? FFMPEG_CANDIDATE : 'ffmpeg';

const CHROME_CANDIDATE = path.join(localAppData, 'ms-playwright', 'chromium-1243', 'chrome-win64', 'chrome.exe');
const CHROME_BIN = fs.existsSync(CHROME_CANDIDATE) ? CHROME_CANDIDATE : undefined;

const FPS = 25;
const DURATION = 30.0;
const isPreviewOnly = process.argv.includes('--preview');

async function resolvePlaywright(): Promise<any> {
  const candidates = [
    path.join(process.cwd(), 'node_modules', 'playwright', 'index.mjs'),
    path.join(userProfile, 'Desktop', 'GitHub', 'Public', 'ReelsLab', 'node_modules', 'playwright', 'index.mjs')
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      const mod = await import(pathToFileURL(c).href);
      return mod.chromium;
    }
  }

  // Standart import denemesi
  try {
    const mod = await import('playwright');
    return mod.chromium;
  } catch {
    throw new Error('Playwright paketi bulunamadı. Lütfen "npm i -D playwright" çalıştırın.');
  }
}

async function main() {
  console.log(`🎬 Safe-Skill Reel Renderer başlatılıyor...`);
  console.log(`📂 HTML: ${htmlPath}`);

  const chromium = await resolvePlaywright();

  const browser = await chromium.launch({
    executablePath: CHROME_BIN,
    headless: true
  });

  const page = await browser.newPage({
    viewport: { width: 1080, height: 1920 },
    deviceScaleFactor: 1
  });

  await page.goto(pathToFileURL(htmlPath).href);

  // Önizleme barını render'da gizle
  await page.addStyleTag({
    content: '#controls { display: none !important; }'
  });

  // 1. Dört kritik sahnenin HD önizleme karelerini kaydet
  const previewTimestamps = [
    { name: 'preview_scene1.jpg', t: 3.5, label: 'Sahne 1: Kanca & Tehlike' },
    { name: 'preview_scene2.jpg', t: 11.0, label: 'Sahne 2: S0/S1 Güvenlik Kapısı' },
    { name: 'preview_scene3.jpg', t: 19.0, label: 'Sahne 3: SHA-256 Pasaport & Çoklu Ajan' },
    { name: 'preview_scene4.jpg', t: 26.5, label: 'Sahne 4: npx safe-skill CTA' }
  ];

  console.log(`\n📸 Önizleme kareleri yakalanıyor...`);
  for (const s of previewTimestamps) {
    await page.evaluate((val: number) => (window as any).seek(val), s.t);
    const dest = path.join(outDir, s.name);
    await page.screenshot({ path: dest, type: 'jpeg', quality: 90 });
    console.log(`  ✔ [${s.t}s] ${s.label} -> ${s.name}`);
  }

  if (isPreviewOnly) {
    await browser.close();
    console.log(`\n🎉 Önizleme kareleri başarıyla kaydedildi: ${outDir}\n`);
    return;
  }

  // 2. ffmpeg ile tam MP4 videosunu derle
  console.log(`\n🎥 MP4 Video derleniyor (${DURATION} saniye @ ${FPS} fps)...`);

  const ff = spawn(FFMPEG_BIN, [
    '-y',
    '-loglevel', 'error',
    '-f', 'image2pipe',
    '-framerate', String(FPS),
    '-i', '-',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-crf', '20',
    '-preset', 'fast',
    '-movflags', '+faststart',
    outMp4
  ], { stdio: ['pipe', 'inherit', 'inherit'] });

  const totalFrames = Math.ceil(DURATION * FPS);
  const startTime = Date.now();

  for (let i = 0; i < totalFrames; i++) {
    const curTime = i / FPS;
    await page.evaluate((val: number) => (window as any).seek(val), curTime);
    const frameBuffer = await page.screenshot({ type: 'jpeg', quality: 88 });

    if (!ff.stdin.write(frameBuffer)) {
      await new Promise((resolve) => ff.stdin.once('drain', resolve));
    }

    if (i % 50 === 0 || i === totalFrames - 1) {
      const pct = Math.round((i / totalFrames) * 100);
      process.stdout.write(`\r⏳ Render: %${pct} (Kare ${i}/${totalFrames})`);
    }
  }

  ff.stdin.end();
  await new Promise((resolve) => ff.on('close', resolve));
  await browser.close();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n\n🎉 VİDEO RENDER TAMAMLANDI!`);
  console.log(`📁 Dosya: ${outMp4}`);
  console.log(`⏱️ Toplam Kare: ${totalFrames} · Süre: ${elapsed} sn\n`);
}

main().catch((err) => {
  console.error('Render Hatası:', err);
  process.exit(1);
});
