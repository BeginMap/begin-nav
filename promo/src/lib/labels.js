import * as THREE from 'three';

// Camera-facing labels drawn on canvases: room tags, "?" bubbles, feature badges.

const DPR = 2;

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w * DPR;
  c.height = h * DPR;
  const g = c.getContext('2d');
  g.scale(DPR, DPR);
  return [c, g];
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function tex(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function sprite(t, w, h, { depthTest = false, order = 20 } = {}) {
  const m = new THREE.SpriteMaterial({ map: t, transparent: true, depthTest, depthWrite: false, fog: false, toneMapped: false });
  const s = new THREE.Sprite(m);
  s.scale.set(w, h, 1);
  s.renderOrder = order;
  s.userData.baseScale = [w, h];
  return s;
}

// Black pill with white bold text, like the app's own map tags.
export function roomTag(text, { dark = true, size = 1, rtl = true } = {}) {
  const fs = 54;
  const [mc, mg] = canvas(10, 10);
  mg.font = `800 ${fs}px Rubik`;
  const tw = mg.measureText(text).width;
  const w = Math.ceil(tw + 64), h = 92;
  const [c, g] = canvas(w + 16, h + 26);
  g.translate(8, 6);
  g.shadowColor = 'rgba(0,0,0,0.35)';
  g.shadowBlur = 14;
  g.shadowOffsetY = 5;
  roundRect(g, 0, 0, w, h, h / 2);
  g.fillStyle = dark ? '#0b0d12' : '#ffffff';
  g.fill();
  g.shadowColor = 'transparent';
  g.lineWidth = 4;
  g.strokeStyle = dark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.12)';
  g.stroke();
  g.fillStyle = dark ? '#ffffff' : '#0b0d12';
  g.font = `800 ${fs}px Rubik`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.direction = rtl ? 'rtl' : 'ltr';
  g.fillText(text, w / 2, h / 2 + 3);
  const k = (size * 2.2) / h;
  return sprite(tex(c), (w + 16) * k, (h + 26) * k);
}

export function questionBubble(size = 1, color = '#1D4ED8') {
  const S = 160;
  const [c, g] = canvas(S, S);
  g.shadowColor = 'rgba(0,0,0,0.35)';
  g.shadowBlur = 16;
  g.shadowOffsetY = 6;
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2 - 16, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
  g.shadowColor = 'transparent';
  g.lineWidth = 7;
  g.strokeStyle = '#fff';
  g.stroke();
  g.fillStyle = '#fff';
  g.font = '900 92px Rubik';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('?', S / 2, S / 2 + 5);
  return sprite(tex(c), size * 3, size * 3);
}

// --- icons (simple vector drawings so no external assets are needed) -------
const ICONS = {
  wc(g, s) {
    g.fillStyle = '#fff';
    const fig = (x, skirt) => {
      g.beginPath(); g.arc(x, s * 0.25, s * 0.075, 0, Math.PI * 2); g.fill();
      if (skirt) {
        g.beginPath(); g.moveTo(x - s * 0.055, s * 0.36); g.lineTo(x + s * 0.055, s * 0.36);
        g.lineTo(x + s * 0.13, s * 0.62); g.lineTo(x - s * 0.13, s * 0.62); g.closePath(); g.fill();
        g.fillRect(x - s * 0.06, s * 0.6, s * 0.04, s * 0.16); g.fillRect(x + s * 0.02, s * 0.6, s * 0.04, s * 0.16);
      } else {
        roundRect(g, x - s * 0.085, s * 0.36, s * 0.17, s * 0.26, s * 0.04); g.fill();
        g.fillRect(x - s * 0.075, s * 0.58, s * 0.06, s * 0.18); g.fillRect(x + s * 0.015, s * 0.58, s * 0.06, s * 0.18);
      }
    };
    fig(s * 0.33, false);
    fig(s * 0.67, true);
    g.fillRect(s * 0.485, s * 0.2, s * 0.03, s * 0.58);
  },
  office(g, s) {
    g.fillStyle = '#fff';
    roundRect(g, s * 0.2, s * 0.34, s * 0.6, s * 0.42, s * 0.06); g.fill();
    g.lineWidth = s * 0.06; g.strokeStyle = '#fff';
    roundRect(g, s * 0.37, s * 0.22, s * 0.26, s * 0.16, s * 0.04); g.stroke();
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(s * 0.2, s * 0.5, s * 0.6, s * 0.035);
  },
  shelter(g, s) {
    g.fillStyle = '#fff';
    g.beginPath();
    g.moveTo(s * 0.5, s * 0.16);
    g.lineTo(s * 0.78, s * 0.27);
    g.quadraticCurveTo(s * 0.8, s * 0.66, s * 0.5, s * 0.84);
    g.quadraticCurveTo(s * 0.2, s * 0.66, s * 0.22, s * 0.27);
    g.closePath(); g.fill();
    g.strokeStyle = '#ff7a00'; g.lineWidth = s * 0.065; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(s * 0.37, s * 0.5); g.lineTo(s * 0.47, s * 0.6); g.lineTo(s * 0.64, s * 0.4); g.stroke();
  },
  pin(g, s) {
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(s * 0.5, s * 0.42, s * 0.22, Math.PI * 0.85, Math.PI * 2.15);
    g.lineTo(s * 0.5, s * 0.84);
    g.closePath(); g.fill();
    g.fillStyle = '#1D4ED8';
    g.beginPath(); g.arc(s * 0.5, s * 0.42, s * 0.09, 0, Math.PI * 2); g.fill();
  },
};

export const BADGE_COLORS = { wc: '#0ea5e9', office: '#1D4ED8', shelter: '#ff7a00', pin: '#1D4ED8' };

export function iconCanvas(kind, S = 256, color = BADGE_COLORS[kind]) {
  const [c, g] = canvas(S, S);
  g.shadowColor = 'rgba(0,0,0,0.3)';
  g.shadowBlur = 18;
  g.shadowOffsetY = 8;
  roundRect(g, 14, 10, S - 28, S - 28, 54);
  const gr = g.createLinearGradient(0, 0, 0, S);
  gr.addColorStop(0, color);
  gr.addColorStop(1, shade(color, -0.25));
  g.fillStyle = gr;
  g.fill();
  g.shadowColor = 'transparent';
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.stroke();
  g.save();
  g.translate(14, 10);
  ICONS[kind](g, S - 28);
  g.restore();
  return c;
}

export function badge(kind, size = 1) {
  return sprite(tex(iconCanvas(kind)), size * 3.4, size * 3.4);
}

export function iconTexture(kind) {
  return tex(iconCanvas(kind));
}

function shade(hex, k) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + k * 0.5)));
  return '#' + c.getHexString();
}

// Soft radial glow sprite (additive) for heads of routes, impacts, beams.
export function glowSprite(color = '#ffffff', size = 4) {
  const S = 128;
  const [c, g] = canvas(S, S);
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  const m = new THREE.SpriteMaterial({ map: tex(c), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
  const s = new THREE.Sprite(m);
  s.scale.set(size, size, 1);
  s.renderOrder = 30;
  return s;
}

// Red "dead end" cross for the lost-in-the-corridors scene.
export function xMark(size = 1) {
  const S = 128;
  const [c, g] = canvas(S, S);
  g.shadowColor = 'rgba(0,0,0,0.4)';
  g.shadowBlur = 10;
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2 - 12, 0, Math.PI * 2);
  g.fillStyle = '#ef4444';
  g.fill();
  g.shadowColor = 'transparent';
  g.lineWidth = 6;
  g.strokeStyle = '#fff';
  g.stroke();
  g.lineCap = 'round';
  g.lineWidth = 12;
  g.beginPath();
  g.moveTo(S * 0.36, S * 0.36); g.lineTo(S * 0.64, S * 0.64);
  g.moveTo(S * 0.64, S * 0.36); g.lineTo(S * 0.36, S * 0.64);
  g.stroke();
  return sprite(tex(c), size * 2.4, size * 2.4);
}
