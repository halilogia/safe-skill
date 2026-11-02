// @ts-mandatory: Vanilla ES module for direct browser rendering without bundler
const captions = [
  { start: 0.0, end: 3.8, text: "Claude Code veya Cursor'a indirdiğin <span class='danger-highlight'>skill'ler</span> arkada ne çalıştırıyor?" },
  { start: 3.8, end: 7.5, text: "Çoğu araç <span class='danger-highlight'>SIFIR güvenlik denetimi</span> yapıyor. Sistem komutların tehlikede!" },
  { start: 7.5, end: 11.5, text: "Çözüm: <span class='highlight'>Safe-Skill</span>. AST motoruyla zararlı komutları ve prompt injection'ı yakalar," },
  { start: 11.5, end: 15.5, text: "Zararlı saldırı tespit edildiğinde <span class='danger-highlight'>kurulumu anında durdurur ve engeller!</span>" },
  { start: 15.5, end: 22.0, text: "Doğrulanmış temiz becerileri <span class='highlight'>SHA-256 Pasaportuyla</span> mühürler." },
  { start: 22.0, end: 30.5, text: "Becerilerini güvene al: <span class='highlight'>npx safe-skill</span>. Açık kaynak kodlar GitHub'da!" }
];

const scenes = [
  { id: 'scene1', start: 0.0, end: 7.5 },
  { id: 'scene2', start: 7.5, end: 15.5 },
  { id: 'scene3', start: 15.5, end: 22.0 },
  { id: 'scene4', start: 22.0, end: 30.5 }
];

// Background Cyber Grid & Particle Animation
const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');
canvas.width = 1080;
canvas.height = 1920;

const particles = [];
for (let i = 0; i < 90; i++) {
  particles.push({
    x: Math.random() * 1080,
    y: Math.random() * 1920,
    r: Math.random() * 3.5 + 1.5,
    vx: (Math.random() - 0.5) * 1.2,
    vy: (Math.random() - 0.5) * 1.2,
    color: Math.random() > 0.5 ? '#38bdf8' : '#818cf8'
  });
}

function renderBackground(t) {
  ctx.clearRect(0, 0, 1080, 1920);

  // High-tech Grid
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.06)';
  ctx.lineWidth = 1.5;
  const gridSize = 90;
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

  // Floating Cyber Particles
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
  const clamped = Math.max(0, Math.min(30.5, t));

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
  if (timeEl) timeEl.innerText = `00:${sec < 10 ? '0' + sec : sec}.${ms} / 00:30.5`;
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
        if (elapsed >= 30.5) {
          window.seek(30.5);
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
