import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const htmlPath = path.resolve(__dirname, 'index.html');
const outDir = __dirname;
const outMp4 = path.join(outDir, 'safe-skill-reel.mp4');
const voiceMp3 = path.join(outDir, 'voice.mp3');

const homeDir = os.homedir();
const userProfile = process.env.USERPROFILE || homeDir;
const localAppData = process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local');

const FFMPEG_CANDIDATE = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages', 'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe', 'ffmpeg-8.1.2-full_build', 'bin', 'ffmpeg.exe');
const FFMPEG_BIN = fs.existsSync(FFMPEG_CANDIDATE) ? FFMPEG_CANDIDATE : 'ffmpeg';

const CHROME_CANDIDATE = path.join(localAppData, 'ms-playwright', 'chromium-1243', 'chrome-win64', 'chrome.exe');
const CHROME_BIN = fs.existsSync(CHROME_CANDIDATE) ? CHROME_CANDIDATE : undefined;

const FPS = 25;
const DURATION = 30.5;
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

  try {
    const mod = await import('playwright');
    return mod.chromium;
  } catch {
    throw new Error('Playwright paketi bulunamadı.');
  }
}

async function main() {
  console.log(`🎬 Safe-Skill Reel Renderer başlatılıyor (ElevenLabs Ses + Retina Çözünürlük)...`);
  console.log(`📂 HTML: ${htmlPath}`);
  console.log(`🎙️ Ses: ${voiceMp3} (${fs.existsSync(voiceMp3) ? 'Mevcut' : 'Eksik'})`);

  const chromium = await resolvePlaywright();

  const browser = await chromium.launch({
    executablePath: CHROME_BIN,
    headless: true
  });

  const page = await browser.newPage({
    viewport: { width: 1080, height: 1920 },
    deviceScaleFactor: 2
  });

  await page.goto(pathToFileURL(htmlPath).href);

  await page.addStyleTag({
    content: '#controls { display: none !important; }'
  });

  // 1. Dört kritik sahnenin HD Retina önizleme karelerini kaydet
  const previewTimestamps = [
    { name: 'preview_scene1.jpg', t: 4.0, label: 'Sahne 1: Kanca & Tehlike' },
    { name: 'preview_scene2.jpg', t: 12.0, label: 'Sahne 2: S0/S1 Güvenlik Kapısı' },
    { name: 'preview_scene3.jpg', t: 18.5, label: 'Sahne 3: SHA-256 Pasaport & Çoklu Ajan' },
    { name: 'preview_scene4.jpg', t: 26.5, label: 'Sahne 4: npx safe-skill CTA' }
  ];

  console.log(`\n📸 Yüksek çözünürlüklü önizleme kareleri yakalanıyor...`);
  for (const s of previewTimestamps) {
    await page.evaluate((val: number) => (window as any).seek(val), s.t);
    const dest = path.join(outDir, s.name);
    await page.screenshot({ path: dest, type: 'jpeg', quality: 95 });
    console.log(`  ✔ [${s.t}s] ${s.label} -> ${s.name}`);
  }

  if (isPreviewOnly) {
    await browser.close();
    console.log(`\n🎉 Retina önizleme kareleri kaydedildi: ${outDir}\n`);
    return;
  }

  // 2. ffmpeg ile sesli tam MP4 videosunu derle
  console.log(`\n🎥 MP4 Video derleniyor (${DURATION} sn @ ${FPS} fps)...`);

  const ffmpegArgs = [
    '-y',
    '-loglevel', 'error',
    '-f', 'image2pipe',
    '-framerate', String(FPS),
    '-i', '-'
  ];

  if (fs.existsSync(voiceMp3)) {
    ffmpegArgs.push('-i', voiceMp3);
    ffmpegArgs.push('-map', '0:v', '-map', '1:a');
    ffmpegArgs.push('-c:a', 'aac', '-b:a', '192k', '-af', 'apad', '-t', String(DURATION));
  }

  ffmpegArgs.push(
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-crf', '16',
    '-preset', 'fast',
    '-movflags', '+faststart',
    outMp4
  );

  const ff = spawn(FFMPEG_BIN, ffmpegArgs, { stdio: ['pipe', 'inherit', 'inherit'] });

  const totalFrames = Math.ceil(DURATION * FPS);
  const startTime = Date.now();

  for (let i = 0; i < totalFrames; i++) {
    const curTime = i / FPS;
    await page.evaluate((val: number) => (window as any).seek(val), curTime);
    const frameBuffer = await page.screenshot({ type: 'jpeg', quality: 92 });

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
  console.log(`\n\n🎉 SESLİ VİDEO RENDER TAMAMLANDI!`);
  console.log(`📁 Dosya: ${outMp4}`);
  console.log(`⏱️ Toplam Kare: ${totalFrames} · Süre: ${elapsed} sn\n`);
}

main().catch((err) => {
  console.error('Render Hatası:', err);
  process.exit(1);
});
