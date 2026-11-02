// @ts-mandatory: Tarayicida native ES modulu olarak calismasi icin saf JS gereklidir.
// engine.js - Lemo-Opuscar Dark Tech Keynote Canvas Engine (Vertical 1080x1920)

export const W = 1080;
export const H = 1920;

export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const seg = (t, a, b) => clamp((t - a) / (b - a));
export const ss = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
export const eo = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const ei = (t) => Math.pow(clamp(t), 3);
export const eio = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const back = (t, s = 1.4) => { t = clamp(t) - 1; return 1 + t * t * ((s + 1) * t + s); };
export const spring = (t, k = 7, z = 0.35) => {
  t = Math.max(0, t);
  return 1 - Math.exp(-z * k * t) * Math.cos(k * Math.sqrt(1 - z * z) * t * 1.6);
};

export const PAL = {
  bg0: '#07090E',
  bg1: '#0F1420',
  surf: '#131826',
  surf2: '#1C2336',
  surf3: '#263048',
  line: 'rgba(255, 255, 255, 0.09)',
  hi: 'rgba(255, 255, 255, 0.14)',
  text: '#F8FAFC',
  dim: '#94A3B8',
  mute: '#64748B',
  accent: '#38BDF8',
  emerald: '#10B981',
  red: '#EF4444',
  amber: '#F59E0B',
  purple: '#A855F7'
};

export function rgba(hex, a) {
  if (hex.startsWith('rgba')) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2)));
}

export function glow(g, x, y, r, color, a) {
  if (a <= 0 || r <= 0) return;
  g.save();
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba(color, a));
  gr.addColorStop(0.45, rgba(color, a * 0.35));
  gr.addColorStop(1, rgba(color, 0));
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
  g.restore();
}

export function bg(g, o = {}) {
  const { lift = 1, cx = W * 0.5, cy = H * 0.32 } = o;
  g.save();
  g.fillStyle = PAL.bg0;
  g.fillRect(0, 0, W, H);

  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, W * 0.95);
  gr.addColorStop(0, rgba(PAL.bg1, 0.95 * lift));
  gr.addColorStop(1, rgba(PAL.bg0, 0));
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);

  glow(g, W * 0.82, H * 0.14, 600, PAL.accent, 0.07);
  g.restore();
}

export function grid(g, o = {}) {
  const { ox = 0, oy = 0, scale = 1, module = 48, alpha = 1 } = o;
  const step = module * scale;
  if (step < 6 || alpha <= 0) return;
  g.save();
  g.lineWidth = 1;
  const i0 = Math.floor(-ox / step) - 1;
  const i1 = Math.ceil((W - ox) / step) + 1;
  const j0 = Math.floor(-oy / step) - 1;
  const j1 = Math.ceil((H - oy) / step) + 1;

  for (let pass = 0; pass < 2; pass++) {
    g.strokeStyle = `rgba(255, 255, 255, ${(pass ? 0.06 : 0.028) * alpha})`;
    g.beginPath();
    for (let i = i0; i <= i1; i++) {
      if ((i % 4 === 0) !== Boolean(pass)) continue;
      const x = Math.round(ox + i * step) + 0.5;
      g.moveTo(x, 0);
      g.lineTo(x, H);
    }
    for (let j = j0; j <= j1; j++) {
      if ((j % 4 === 0) !== Boolean(pass)) continue;
      const y = Math.round(oy + j * step) + 0.5;
      g.moveTo(0, y);
      g.lineTo(W, y);
    }
    g.stroke();
  }
  g.restore();
}

export function vignette(g, a = 0.55) {
  g.save();
  const gr = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
  gr.addColorStop(0, 'rgba(0,0,0,0)');
  gr.addColorStop(1, `rgba(0,0,0,${a})`);
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  g.restore();
}

export function panel(g, x, y, w, h, o = {}) {
  const { r = 24, fill = PAL.surf, stroke = PAL.line, shadow = 1, hi = 1, alpha = 1 } = o;
  g.save();
  g.globalAlpha *= alpha;
  if (shadow > 0) {
    g.shadowColor = `rgba(0, 0, 0, ${0.55 * shadow})`;
    g.shadowBlur = Math.min(80, 20 + h * 0.08);
    g.shadowOffsetY = Math.min(30, 8 + h * 0.03);
    g.fillStyle = fill;
    rr(g, x, y, w, h, r);
    g.fill();
    g.shadowColor = 'transparent';
  }
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, '#1E2638');
  gr.addColorStop(0.15, fill);
  gr.addColorStop(1, fill);
  g.fillStyle = gr;
  rr(g, x, y, w, h, r);
  g.fill();

  g.lineWidth = 1.5;
  g.strokeStyle = stroke;
  rr(g, x + 0.75, y + 0.75, w - 1.5, h - 1.5, r);
  g.stroke();

  if (hi > 0) {
    g.strokeStyle = `rgba(255, 255, 255, ${0.12 * hi})`;
    g.beginPath();
    g.moveTo(x + r, y + 1.5);
    g.lineTo(x + w - r, y + 1.5);
    g.stroke();
  }
  g.restore();
}

export function terminalHeader(g, x, y, w, title = 'bash') {
  const th = 56;
  const gr = g.createLinearGradient(0, y, 0, y + th);
  gr.addColorStop(0, '#1A2234');
  gr.addColorStop(1, '#141A28');
  g.fillStyle = gr;
  g.beginPath();
  g.roundRect(x, y, w, th, [24, 24, 0, 0]);
  g.fill();

  g.strokeStyle = PAL.line;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x, y + th);
  g.lineTo(x + w, y + th);
  g.stroke();

  const dots = ['#EF4444', '#F59E0B', '#10B981'];
  for (let i = 0; i < 3; i++) {
    g.fillStyle = dots[i];
    g.beginPath();
    g.arc(x + 28 + i * 22, y + th / 2, 6, 0, Math.PI * 2);
    g.fill();
  }

  g.font = '600 22px "JetBrains Mono", monospace';
  g.fillStyle = PAL.dim;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(title, x + w / 2, y + th / 2);
}

export function toastCaption(g, text, keyword = '') {
  const tw = W - 140;
  const th = 114;
  const tx = 70;
  const ty = H - 190;

  g.save();
  panel(g, tx, ty, tw, th, {
    r: 32,
    fill: 'rgba(15, 20, 32, 0.94)',
    stroke: 'rgba(255, 255, 255, 0.14)',
    shadow: 1.2
  });

  glow(g, tx + 46, ty + th / 2, 18, PAL.accent, 0.7);
  g.fillStyle = PAL.accent;
  g.beginPath();
  g.arc(tx + 46, ty + th / 2, 8, 0, Math.PI * 2);
  g.fill();

  g.font = '600 24px "Inter", sans-serif';
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillStyle = PAL.text;

  const contentX = tx + 78;

  if (!keyword || !text.includes(keyword)) {
    g.fillText(text, contentX, ty + th / 2);
  } else {
    const parts = text.split(keyword);
    const w1 = g.measureText(parts[0]).width;
    g.fillText(parts[0], contentX, ty + th / 2);

    g.fillStyle = PAL.accent;
    g.fillText(keyword, contentX + w1, ty + th / 2);

    const w2 = g.measureText(keyword).width;
    g.fillStyle = PAL.text;
    g.fillText(parts[1], contentX + w1 + w2, ty + th / 2);
  }
  g.restore();
}
