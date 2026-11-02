// @ts-mandatory: Vanilla ES module for direct browser rendering without bundler
const captions = [
  { start: 0.0, end: 3.5, text: "Claude Code veya Cursor'a indirdiğin <span class='danger-highlight'>skill'lerin</span> arkada ne yaptığını biliyor musun?" },
  { start: 3.5, end: 7.0, text: "Standart araçlar <span class='danger-highlight'>SIFIR güvenlik kontrolü</span> yapıyor. Sistem komutların tehlikede!" },
  { start: 7.0, end: 11.0, text: "Çözüm: <span class='highlight'>Safe-Skill</span>. AST motoruyla indirmeden önce prompt injection'ları tarar." },
  { start: 11.0, end: 15.0, text: "Zararlı bir komut yakalandığında <span class='danger-highlight'>kurulum anında engellenir</span> ve geri alınır!" },
  { start: 15.0, end: 19.0, text: "Temiz beceriler <span class='highlight'>SHA-256 Pasaportuyla</span> mühürlenir; dosya değişiklikleri affedilmez." },
  { start: 19.0, end: 23.0, text: "İster <span class='highlight'>Claude Code</span>, ister <span class='highlight'>Cursor .mdc</span>, ister <span class='highlight'>Antigravity</span>... Hepsine tek komutla uyar!" },
  { start: 23.0, end: 30.0, text: "Becerilerini güvene al: <span class='highlight'>npx safe-skill</span>. Açık kaynak repo linki açıklamada!" }
];

const scenes = [
  { id: 'scene1', start: 0.0, end: 7.0 },
  { id: 'scene2', start: 7.0, end: 15.0 },
  { id: 'scene3', start: 15.0, end: 23.0 },
  { id: 'scene4', start: 23.0, end: 30.0 }
];

// Background Particle Animation
const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');
canvas.width = 1080;
canvas.height = 1920;

const particles = [];
for (let i = 0; i < 70; i++) {
  particles.push({
    x: Math.random() * 1080,
    y: Math.random() * 1920,
    r: Math.random() * 3 + 1,
    vx: (Math.random() - 0.5) * 0.8,
    vy: (Math.random() - 0.5) * 0.8,
    color: Math.random() > 0.5 ? '#38bdf8' : '#6366f1'
  });
}

function renderBackground(t) {
  ctx.clearRect(0, 0, 1080, 1920);

  // Grid
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 1;
  const gridSize = 80;
  for (let x = 0; x <= 1080; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 1920);
    ctx.stroke();
  }
  for (let y = 0; y <= 1920; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1080, y);
    ctx.stroke();
  }

  // Particles
  particles.forEach((p) => {
    const px = (p.x + p.vx * t * 60) % 1080;
    const py = (p.y + p.vy * t * 60) % 1920;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(px < 0 ? px + 1080 : px, py < 0 ? py + 1920 : py, p.r, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Deterministic seek function for frame-by-frame rendering
window.seek = function(t) {
  const clamped = Math.max(0, Math.min(30.0, t));

  // 1. Scene Switch
  scenes.forEach((s) => {
    const el = document.getElementById(s.id);
    if (!el) return;
    if (clamped >= s.start && clamped < s.end) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  // 2. Caption Switch
  const curCap = captions.find((c) => clamped >= c.start && clamped < c.end) || captions[captions.length - 1];
  const capEl = document.getElementById('caption-text');
  if (capEl) capEl.innerHTML = curCap.text;

  // 3. Background Render
  renderBackground(clamped);

  // 4. Update UI Scrub
  const scrubEl = document.getElementById('scrub');
  if (scrubEl) scrubEl.value = clamped;
  const sec = Math.floor(clamped);
  const ms = Math.floor((clamped % 1) * 10);
  const timeEl = document.getElementById('time-display');
  if (timeEl) timeEl.innerText = `00:${sec < 10 ? '0' + sec : sec}.${ms} / 00:30.0`;
};

// Browser Preview Controls
let isPlaying = false;
let animId = null;

const scrubEl = document.getElementById('scrub');
if (scrubEl) {
  scrubEl.addEventListener('input', (e) => {
    isPlaying = false;
    const btn = document.getElementById('btn-play');
    if (btn) btn.innerText = '▶ Oynat';
    cancelAnimationFrame(animId);
    window.seek(parseFloat(e.target.value));
  });
}

const btnPlay = document.getElementById('btn-play');
if (btnPlay) {
  btnPlay.addEventListener('click', () => {
    isPlaying = !isPlaying;
    if (isPlaying) {
      btnPlay.innerText = '⏸ Durdur';
      const startT = parseFloat(document.getElementById('scrub').value);
      const clockStart = performance.now();
      function loop(now) {
        if (!isPlaying) return;
        const elapsed = (now - clockStart) / 1000 + startT;
        if (elapsed >= 30) {
          window.seek(30);
          isPlaying = false;
          btnPlay.innerText = '▶ Tekrar';
          return;
        }
        window.seek(elapsed);
        animId = requestAnimationFrame(loop);
      }
      animId = requestAnimationFrame(loop);
    } else {
      btnPlay.innerText = '▶ Oynat';
      cancelAnimationFrame(animId);
    }
  });
}

// Initial seek
window.seek(0);
