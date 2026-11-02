import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = __dirname;
const outMp4 = path.join(outDir, 'safe-skill-reel.mp4');
const audioMp3 = path.join(outDir, 'mastered_audio.mp3');

const homeDir = os.homedir();
const userProfile = process.env.USERPROFILE || homeDir;
const localAppData = process.env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local');

const FFMPEG_CANDIDATE = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages', 'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe', 'ffmpeg-8.1.2-full_build', 'bin', 'ffmpeg.exe');
const FFMPEG_BIN = fs.existsSync(FFMPEG_CANDIDATE) ? FFMPEG_CANDIDATE : 'ffmpeg';

const CHROME_CANDIDATE = path.join(localAppData, 'ms-playwright', 'chromium-1243', 'chrome-win64', 'chrome.exe');
const CHROME_BIN = fs.existsSync(CHROME_CANDIDATE) ? CHROME_CANDIDATE : undefined;

const FPS = 25;
const DURATION = 34.3;
const isPreviewOnly = process.argv.includes('--preview');

function startStaticServer(dir: string): Promise<{ server: http.Server; url: string }> {
  return new Promise((resolve) => {
    const mimeMap: Record<string, string> = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.ttf': 'font/ttf',
      '.woff2': 'font/woff2',
      '.mp3': 'audio/mpeg'
    };

    const server = http.createServer((req, res) => {
      const parsedPath = req.url === '/' ? '/index.html' : (req.url || '/index.html').split('?')[0];
      const filePath = path.join(dir, decodeURIComponent(parsedPath));
      if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': mimeMap[ext] || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*'
      });
      fs.createReadStream(filePath).pipe(res);
    });

    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as any).port;
      resolve({ server, url: `http://127.0.0.1:${port}/index.html` });
    });
  });
}

async function resolvePlaywright(): Promise<any> {
  const candidates = [
    path.join(process.cwd(), 'node_modules', 'playwright', 'index.mjs'),
    path.join(userProfile, 'Desktop', 'GitHub', 'Public', 'ReelsLab', 'node_modules', 'playwright', 'index.mjs'),
    path.join(userProfile, 'Desktop', 'GitHub', 'Public', 'lemo-opuscar', 'node_modules', 'playwright', 'index.mjs')
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
    throw new Error('Playwright paketi bulunamadi.');
  }
}

async function main() {
  console.log('[INFO] Safe-Skill Lemo-Opuscar Renderer Baslatiliyor...');
  console.log(`[INFO] Master Ses: ${audioMp3} (${fs.existsSync(audioMp3) ? 'Mevcut' : 'Eksik'})`);

  const { server, url: pageUrl } = await startStaticServer(outDir);
  console.log(`[INFO] Yerel Sunucu: ${pageUrl}`);

  const chromium = await resolvePlaywright();

  const browser = await chromium.launch({
    executablePath: CHROME_BIN,
    headless: true,
    args: ['--allow-file-access-from-files', '--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage({
    viewport: { width: 1080, height: 1920 },
    deviceScaleFactor: 1
  });

  page.on('console', (msg: any) => console.log(`[BROWSER] ${msg.text()}`));
  page.on('pageerror', (err: any) => console.error(`[BROWSER_ERROR] ${err}`));

  await page.goto(pageUrl);
  await page.waitForFunction(() => (window as any).READY === true, { timeout: 15000 });
  await page.evaluate(() => document.fonts.ready);

  const previewTimestamps = [
    { name: 'preview_scene1.jpg', t: 4.8, label: 'Act 1: Tuzak ve Gizli Payload' },
    { name: 'preview_scene2.jpg', t: 11.0, label: 'Act 2: S0/S1 Guvenlik Kapisi & Engel' },
    { name: 'preview_scene3.jpg', t: 20.0, label: 'Act 3: SHA-256 Pasaport & 3 Ekosistem' },
    { name: 'preview_scene4.jpg', t: 27.5, label: 'Act 4: Hero Komut & TUI Arayuzu' }
  ];

  console.log('[INFO] Yuksek cozunurluklu onizleme kareleri yakalaniyor...');
  for (const s of previewTimestamps) {
    await page.evaluate((val: number) => (window as any).seek(val), s.t);
    const dest = path.join(outDir, s.name);
    await page.screenshot({ path: dest, type: 'jpeg', quality: 95 });
    console.log(`  [OK] [${s.t}s] ${s.label} -> ${s.name}`);
  }

  if (isPreviewOnly) {
    await browser.close();
    server.close();
    console.log('[INFO] Onizleme kareleri kaydedildi.');
    return;
  }

  console.log(`[INFO] MP4 Video derleniyor (${DURATION} sn @ ${FPS} fps)...`);

  const ffmpegArgs = [
    '-y',
    '-loglevel', 'error',
    '-f', 'image2pipe',
    '-framerate', String(FPS),
    '-i', '-'
  ];

  if (fs.existsSync(audioMp3)) {
    ffmpegArgs.push('-i', audioMp3);
    ffmpegArgs.push('-map', '0:v', '-map', '1:a');
    ffmpegArgs.push('-c:a', 'aac', '-b:a', '256k', '-t', String(DURATION));
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
      process.stdout.write(`\r[PROGRESS] Render: %${pct} (Kare ${i}/${totalFrames})`);
    }
  }

  ff.stdin.end();
  await new Promise((resolve) => ff.on('close', resolve));
  await browser.close();
  server.close();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n\n[OK] SESLI VIDEO RENDER TAMAMLANDI: ${outMp4}`);
  console.log(`[OK] Toplam Kare: ${totalFrames} - Sure: ${elapsed} sn`);
}

main().catch((err) => {
  console.error('[ERROR] Render Hatasi:', err);
  process.exit(1);
});
