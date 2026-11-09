import * as THREE from 'three';
import { rng } from './util.js';

// High-resolution ground + roof atlas (8192 x 6144 for the 2000 x 1500 px plan, ~2.6 cm per texel).
// Everything is painted procedurally on top of the app's paper plan:
//   paved courtyard, mown lawns, a sports court, soft contact shadows around the buildings,
//   and clean roofs with crisp room names taken from data/rooms.json (in the video's language).

const PW = 2000, PH = 1500;
export const ATLAS_W = 8192, ATLAS_H = 6144;
const S = ATLAS_W / PW;

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

// Tileable value noise as a canvas (grayscale), used for grain and detail.
export function noiseCanvas(size = 256, octaves = 4, seed = 3) {
  const R = rng(seed);
  const [c, g] = mk(size, size);
  const img = g.createImageData(size, size);
  const acc = new Float32Array(size * size);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const cells = 4 << o;
    const grid = new Float32Array(cells * cells).map(() => R());
    const step = size / cells;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const gx = x / step, gy = y / step;
        const x0 = Math.floor(gx) % cells, y0 = Math.floor(gy) % cells;
        const x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
        let fx = gx - Math.floor(gx), fy = gy - Math.floor(gy);
        fx = fx * fx * (3 - 2 * fx);
        fy = fy * fy * (3 - 2 * fy);
        const a = grid[y0 * cells + x0], b = grid[y0 * cells + x1], cc = grid[y1 * cells + x0], d = grid[y1 * cells + x1];
        acc[y * size + x] += amp * ((a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + d * fx) * fy);
      }
    }
    total += amp;
    amp *= 0.55;
  }
  for (let i = 0; i < size * size; i++) {
    const v = Math.round((acc[i] / total) * 255);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

function speckle(size, base, spread, alpha, seed) {
  const R = rng(seed);
  const [c, g] = mk(size, size);
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const k = (R() - 0.5) * spread;
    img.data[i * 4] = base[0] + k;
    img.data[i * 4 + 1] = base[1] + k;
    img.data[i * 4 + 2] = base[2] + k;
    img.data[i * 4 + 3] = alpha;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// Paver tile: running-bond clay bricks with colour variation and grout lines.
function paverTile() {
  const T = 512; // 512 atlas px = 13.5 m
  const [c, g] = mk(T, T);
  const R = rng(21);
  g.fillStyle = '#8d7b6c';
  g.fillRect(0, 0, T, T);
  const bw = 8.2, bh = 4.1; // ~0.22 x 0.11 m
  const tones = ['#b5735a', '#a86a54', '#c08066', '#9d6450', '#b98a70', '#a77a63', '#c79a7f'];
  for (let row = 0, y = 0; y < T; row++, y += bh) {
    const off = (row % 2) * bw * 0.5;
    for (let x = -bw; x < T + bw; x += bw) {
      g.fillStyle = tones[Math.floor(R() * tones.length)];
      g.fillRect(x + off + 0.6, y + 0.6, bw - 1.2, bh - 1.2);
    }
  }
  // soft wear
  g.globalAlpha = 0.18;
  g.globalCompositeOperation = 'multiply';
  g.drawImage(noiseCanvas(256, 4, 9), 0, 0, T, T);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  return c;
}

// Square concrete plaza tiles (the centre of the courtyard in the photos).
function plazaTile() {
  const T = 256;
  const [c, g] = mk(T, T);
  const R = rng(5);
  const s = 15.2; // 0.4 m
  for (let y = 0; y < T; y += s) {
    for (let x = 0; x < T; x += s) {
      const v = 196 + Math.floor(R() * 22);
      g.fillStyle = `rgb(${v},${v - 6},${v - 14})`;
      g.fillRect(x + 0.8, y + 0.8, s - 1.6, s - 1.6);
    }
  }
  g.globalCompositeOperation = 'destination-over';
  g.fillStyle = '#8f877c';
  g.fillRect(0, 0, T, T);
  g.globalCompositeOperation = 'source-over';
  return c;
}

function grassTile() {
  const T = 512;
  const [c, g] = mk(T, T);
  g.fillStyle = '#5f9a3c';
  g.fillRect(0, 0, T, T);
  g.globalAlpha = 0.55;
  g.globalCompositeOperation = 'overlay';
  g.drawImage(noiseCanvas(256, 5, 17), 0, 0, T, T);
  g.globalAlpha = 0.5;
  g.drawImage(speckle(256, [128, 128, 128], 120, 255, 31), 0, 0, T, T);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  return c;
}

function roofTile() {
  const T = 512;
  const [c, g] = mk(T, T);
  g.fillStyle = '#cbc5b9';
  g.fillRect(0, 0, T, T);
  g.globalAlpha = 0.35;
  g.globalCompositeOperation = 'overlay';
  g.drawImage(noiseCanvas(256, 5, 41), 0, 0, T, T);
  g.globalAlpha = 0.25;
  g.drawImage(speckle(256, [128, 128, 128], 90, 255, 43), 0, 0, T, T);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  // membrane seams every ~3 m
  g.strokeStyle = 'rgba(120,112,100,0.22)';
  g.lineWidth = 1.2;
  for (let x = 0; x <= T; x += 113.7) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, T); g.stroke(); }
  return c;
}

function sandTile() {
  const T = 512;
  const [c, g] = mk(T, T);
  g.fillStyle = '#c4b293';
  g.fillRect(0, 0, T, T);
  g.globalAlpha = 0.5;
  g.globalCompositeOperation = 'overlay';
  g.drawImage(noiseCanvas(256, 5, 61), 0, 0, T, T);
  g.globalAlpha = 0.35;
  g.drawImage(speckle(256, [128, 128, 128], 110, 255, 63), 0, 0, T, T);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  return c;
}

export function sandTexture() {
  const t = new THREE.CanvasTexture(sandTile());
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function ringPath(ring) {
  const p = new Path2D();
  ring.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y)));
  p.closePath();
  return p;
}

function wcIcon(g, x, y, s, color) {
  g.save();
  g.translate(x, y);
  g.fillStyle = color;
  for (const [dx, skirt] of [[-s * 0.32, false], [s * 0.32, true]]) {
    g.beginPath(); g.arc(dx, -s * 0.42, s * 0.14, 0, Math.PI * 2); g.fill();
    if (skirt) { g.beginPath(); g.moveTo(dx - s * 0.1, -s * 0.22); g.lineTo(dx + s * 0.1, -s * 0.22); g.lineTo(dx + s * 0.24, s * 0.22); g.lineTo(dx - s * 0.24, s * 0.22); g.fill(); g.fillRect(dx - s * 0.1, s * 0.2, s * 0.07, s * 0.3); g.fillRect(dx + s * 0.03, s * 0.2, s * 0.07, s * 0.3); }
    else { g.fillRect(dx - s * 0.15, -s * 0.22, s * 0.3, s * 0.42); g.fillRect(dx - s * 0.13, s * 0.18, s * 0.1, s * 0.32); g.fillRect(dx + s * 0.03, s * 0.18, s * 0.1, s * 0.32); }
  }
  g.restore();
}

export async function buildAtlas({ planImg, buildings, scene3d, rooms, lang }) {
  const [c, g] = mk(ATLAS_W, ATLAS_H);
  g.imageSmoothingQuality = 'high';
  g.setTransform(S, 0, 0, S, 0, 0); // draw in plan pixels

  // 1. base: the paper plan, softened and toned down (surroundings keep its satellite look)
  g.filter = 'saturate(0.6) brightness(1.04) contrast(0.92) blur(0.7px)';
  g.drawImage(planImg, 0, 0, PW, PH);
  g.filter = 'none';
  // grain over the whole site so it reads as terrain, not paper
  const pat = (canvas, scale = 1) => {
    const p = g.createPattern(canvas, 'repeat');
    p.setTransform(new DOMMatrix([1 / (S / scale), 0, 0, 1 / (S / scale), 0, 0]));
    return p;
  };
  g.globalCompositeOperation = 'overlay';
  g.globalAlpha = 0.55;
  g.fillStyle = pat(sandTile());
  g.fillRect(0, 0, PW, PH);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  // hide the printed school logo / title in the corner
  {
    const gr = g.createRadialGradient(1660, 170, 60, 1660, 170, 330);
    gr.addColorStop(0, 'rgba(196,178,147,1)');
    gr.addColorStop(0.75, 'rgba(196,178,147,0.92)');
    gr.addColorStop(1, 'rgba(196,178,147,0)');
    g.fillStyle = gr;
    g.fillRect(1300, 0, 700, 520);
    g.globalCompositeOperation = 'overlay';
    g.globalAlpha = 0.5;
    g.fillStyle = pat(sandTile());
    g.fillRect(1300, 0, 700, 520);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }

  // feather the sheet edges into the desert sand that surrounds the site
  {
    const f = 70;
    const edges = [[0, 0, PW, f, 0, 0, 0, f], [0, PH - f, PW, f, 0, PH, 0, PH - f], [0, 0, f, PH, 0, 0, f, 0], [PW - f, 0, f, PH, PW, 0, PW - f, 0]];
    const [mc, mg] = mk(PW, PH);
    for (const [x, y, w, h, x0, y0, x1, y1] of edges) {
      const lg = mg.createLinearGradient(x0, y0, x1, y1);
      lg.addColorStop(0, 'rgba(0,0,0,1)');
      lg.addColorStop(1, 'rgba(0,0,0,0)');
      mg.fillStyle = lg;
      mg.fillRect(x, y, w, h);
    }
    const [sc2, sg2] = mk(ATLAS_W, ATLAS_H);
    sg2.fillStyle = sg2.createPattern(sandTile(), 'repeat');
    sg2.fillRect(0, 0, ATLAS_W, ATLAS_H);
    sg2.globalCompositeOperation = 'destination-in';
    sg2.drawImage(mc, 0, 0, ATLAS_W, ATLAS_H);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(sc2, 0, 0);
    g.restore();
  }

  // 2. sports court (the "מגרש ספורט" on the plan)
  {
    const x0 = 1062, y0 = 118, w = 222, h = 262;
    g.fillStyle = '#c4694a';
    g.fillRect(x0 - 8, y0 - 8, w + 16, h + 16);
    g.fillStyle = '#2f7f74';
    g.fillRect(x0, y0, w, h);
    g.globalCompositeOperation = 'overlay';
    g.globalAlpha = 0.35;
    g.fillStyle = pat(noiseCanvas(256, 4, 71));
    g.fillRect(x0 - 8, y0 - 8, w + 16, h + 16);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(255,255,255,0.92)';
    g.lineWidth = 1.4;
    g.strokeRect(x0 + 8, y0 + 8, w - 16, h - 16);
    g.beginPath(); g.moveTo(x0 + 8, y0 + h / 2); g.lineTo(x0 + w - 8, y0 + h / 2); g.stroke();
    g.beginPath(); g.arc(x0 + w / 2, y0 + h / 2, 17, 0, Math.PI * 2); g.stroke();
    for (const s of [1, -1]) {
      const yb = s > 0 ? y0 + 8 : y0 + h - 8;
      g.strokeRect(x0 + w / 2 - 25, s > 0 ? yb : yb - 52, 50, 52);
      g.beginPath(); g.arc(x0 + w / 2, yb + s * 52, 17, s > 0 ? 0 : Math.PI, s > 0 ? Math.PI : Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(x0 + w / 2, yb, 62, s > 0 ? 0.12 : Math.PI + 0.12, s > 0 ? Math.PI - 0.12 : Math.PI * 2 - 0.12); g.stroke();
    }
  }

  // 3. courtyard pavers + central plaza tiles
  const cy = scene3d.courtyard;
  g.save();
  g.beginPath();
  g.rect(cy.x0, cy.y0, cy.x1 - cy.x0, cy.y1 - cy.y0);
  g.clip();
  g.fillStyle = pat(paverTile());
  g.fillRect(cy.x0, cy.y0, cy.x1 - cy.x0, cy.y1 - cy.y0);
  g.fillStyle = pat(plazaTile());
  g.fillRect(820, 905, 230, 300);
  g.restore();
  // paved approach from the main entrance and around the buildings
  g.save();
  g.globalAlpha = 0.85;
  g.fillStyle = pat(paverTile());
  g.fillRect(820, 1262, 140, 260);
  g.restore();

  // 4. lawns (mown stripes)
  for (const poly of scene3d.grass || []) {
    const p = ringPath(poly);
    g.save();
    g.clip(p);
    g.fillStyle = pat(grassTile());
    g.fill(p);
    const xs = poly.map((q) => q[0]);
    const mnx = Math.min(...xs), mxx = Math.max(...xs);
    for (let x = mnx, k = 0; x < mxx; x += 14, k++) {
      g.fillStyle = k % 2 ? 'rgba(255,255,230,0.07)' : 'rgba(0,30,0,0.06)';
      g.fillRect(x, 0, 14, PH);
    }
    g.restore();
    // kerb
    g.strokeStyle = 'rgba(225,215,195,0.9)';
    g.lineWidth = 1.6;
    g.stroke(p);
  }

  // 5. soft contact shadows around every building (baked ambient occlusion)
  {
    const [sc, sg] = mk(PW, PH);
    sg.filter = 'blur(7px)';
    sg.fillStyle = '#000';
    for (const b of buildings) sg.fill(ringPath(b.ring));
    sg.filter = 'none';
    g.save();
    g.globalCompositeOperation = 'multiply';
    g.globalAlpha = 0.55;
    g.drawImage(invert(sc), 0, 0);
    g.restore();
  }

  // 6. roofs
  const roofPat = pat(roofTile());
  const paths = [];
  for (const b of buildings) {
    const p = ringPath(b.ring);
    paths.push(p);
    g.save();
    g.clip(p);
    if (b.kind === 'hall') {
      g.fillStyle = '#4a5260';
      g.fill(p);
      // solar panels
      const xs = b.ring.map((q) => q[0]), ys = b.ring.map((q) => q[1]);
      for (let y = Math.min(...ys) + 6; y < Math.max(...ys) - 6; y += 13) {
        for (let x = Math.min(...xs) + 6; x < Math.max(...xs) - 6; x += 9) {
          const gr = g.createLinearGradient(x, y, x + 8, y + 12);
          gr.addColorStop(0, '#22345e');
          gr.addColorStop(1, '#14203d');
          g.fillStyle = gr;
          g.fillRect(x, y, 8, 11.5);
          g.strokeStyle = 'rgba(160,190,255,0.25)';
          g.lineWidth = 0.25;
          g.strokeRect(x + 0.5, y + 0.5, 7, 10.5);
        }
      }
    } else {
      g.fillStyle = roofPat;
      g.fill(p);
      if (b.kind === 'pis') { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fill(p); }
    }
    g.restore();
    // parapet: darker band + light top edge
    g.save();
    g.clip(p);
    g.strokeStyle = 'rgba(95,88,78,0.55)';
    g.lineWidth = 5;
    g.stroke(p);
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 1.4;
    g.stroke(p);
    g.restore();
  }
  // rooftop units (deterministic), skipping where labels go
  {
    const R = rng(77);
    for (const b of buildings) {
      if (b.kind === 'hall') continue;
      const xs = b.ring.map((q) => q[0]), ys = b.ring.map((q) => q[1]);
      const n = Math.round(((Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))) / 9000);
      for (let i = 0; i < n; i++) {
        const x = Math.min(...xs) + R() * (Math.max(...xs) - Math.min(...xs));
        const y = Math.min(...ys) + R() * (Math.max(...ys) - Math.min(...ys));
        if (!g.isPointInPath(paths[buildings.indexOf(b)], x * S, y * S)) continue;
        if (rooms.some((r) => Math.abs(r.x - x) < 30 && Math.abs(r.y - y) < 12)) continue;
        g.save();
        g.shadowColor = 'rgba(0,0,0,0.35)';
        g.shadowBlur = 3 * S;
        g.shadowOffsetX = 1.5 * S;
        g.shadowOffsetY = 1.5 * S;
        g.fillStyle = '#c9ccd1';
        g.fillRect(x - 4, y - 3, 8, 6);
        g.restore();
        g.fillStyle = '#9aa0a8';
        g.beginPath(); g.arc(x - 1.5, y, 1.6, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(x + 2, y, 1.6, 0, Math.PI * 2); g.fill();
      }
    }
  }

  // 7. crisp room names on the roofs (in the video's language)
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const r of rooms) {
    const inside = paths.some((p) => g.isPointInPath(p, r.x * S, r.y * S));
    if (!inside) continue;
    const name = (r.names && (r.names[lang] || r.names.he)) || r.official;
    if (r.category === 'toilets') { wcIcon(g, r.x, r.y, 11, '#3a4150'); continue; }
    if (r.category === 'shelter') {
      g.fillStyle = '#f2c94c';
      g.beginPath(); g.roundRect(r.x - 13, r.y - 6, 26, 12, 3); g.fill();
      g.fillStyle = '#3a3320';
      g.font = '800 7px Rubik';
      g.direction = lang === 'he' ? 'rtl' : 'ltr';
      g.fillText(lang === 'he' ? 'ממ"ד' : lang === 'ru' ? 'УБЕЖ.' : 'SAFE', r.x, r.y + 0.5);
      continue;
    }
    let short = name.replace(/\s*\(.*\)\s*/g, '');
    let fs = r.category === 'classroom' ? 13 : 9;
    g.font = `800 ${fs}px Rubik`;
    g.direction = lang === 'he' ? 'rtl' : 'ltr';
    const maxW = 56;
    const w = g.measureText(short).width;
    if (w > maxW) { fs = Math.max(5.5, (fs * maxW) / w); g.font = `800 ${fs}px Rubik`; }
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fillText(short, r.x + 0.35, r.y + 0.45);
    g.fillStyle = r.category === 'classroom' ? '#2f3542' : '#4d5566';
    g.fillText(short, r.x, r.y);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  return c;
}

function invert(src) {
  // turn "black footprints on transparent" into a white canvas with dark soft shadows
  const [c, g] = mk(src.width, src.height);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  g.drawImage(src, 0, 0);
  return c;
}
