import * as THREE from 'three';
import { rng } from './util.js';

// Sunlit cumulus billboards for the opening "through the clouds" dive, plus a
// ring of Eilat-style desert mountains on the horizon.

function cumulus(seed, S = 512) {
  const R = rng(seed);
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const blobs = [];
  // a flat-ish base with towering puffs, like a real cumulus
  for (let i = 0; i < 34; i++) {
    const x = S * (0.5 + (R() - 0.5) * 0.62);
    const base = S * 0.66;
    const y = base - R() * S * 0.28 * (1 - Math.abs(x / S - 0.5) * 1.4);
    const r = S * (0.07 + R() * 0.11);
    blobs.push([x, y, r]);
  }
  for (let i = 0; i < 90; i++) {
    const p = blobs[Math.floor(R() * blobs.length)];
    blobs.push([p[0] + (R() - 0.5) * p[2] * 1.4, p[1] + (R() - 0.7) * p[2] * 1.1, p[2] * (0.25 + R() * 0.35)]);
  }
  for (const [x, y, r] of blobs) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)');
    gr.addColorStop(0.55, 'rgba(255,255,255,0.32)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // flatten the underside
  g.globalCompositeOperation = 'destination-out';
  const cut = g.createLinearGradient(0, S * 0.66, 0, S * 0.78);
  cut.addColorStop(0, 'rgba(0,0,0,0)');
  cut.addColorStop(1, 'rgba(0,0,0,1)');
  g.fillStyle = cut;
  g.fillRect(0, S * 0.6, S, S * 0.4);
  // light from above: bright tops, blue-grey bellies
  g.globalCompositeOperation = 'source-atop';
  const sh = g.createLinearGradient(0, S * 0.25, 0, S * 0.72);
  sh.addColorStop(0, 'rgba(255,252,246,0)');
  sh.addColorStop(0.55, 'rgba(196,208,228,0.55)');
  sh.addColorStop(1, 'rgba(150,168,198,0.85)');
  g.fillStyle = sh;
  g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * Cloud deck around a dive path. update(camera) fades sprites that get too close
 * (so the camera can fly through without hard sprite edges).
 */
export function makeCloudDeck({ center = new THREE.Vector3(), count = 280, radius = 950, y0 = 205, y1 = 285, path = [], seed = 21 } = {}) {
  const R = rng(seed);
  const texs = [0, 1, 2, 3, 4, 5].map((k) => cumulus(seed * 7 + k));
  const group = new THREE.Group();
  const items = [];
  const add = (x, y, z, sc, op) => {
    const m = new THREE.SpriteMaterial({ map: texs[items.length % texs.length], transparent: true, depthWrite: false, fog: false, color: '#ffffff', opacity: op });
    const s = new THREE.Sprite(m);
    s.position.set(x, y, z);
    s.scale.set(sc, sc * 0.62, 1);
    s.material.rotation = (R() - 0.5) * 0.08;
    s.renderOrder = 30;
    group.add(s);
    items.push({ s, op });
  };
  for (let i = 0; i < count; i++) {
    const a = R() * Math.PI * 2, r = Math.sqrt(R()) * radius;
    add(center.x + Math.cos(a) * r, y0 + R() * (y1 - y0), center.z + Math.sin(a) * r, 200 + R() * 260, 0.95);
  }
  // dense puffs along the dive so the camera really passes through cloud
  for (const p of path) {
    for (let k = 0; k < 7; k++) add(p.x + (R() - 0.5) * 60, p.y + (R() - 0.5) * 30, p.z + (R() - 0.5) * 60, 60 + R() * 90, 0.9);
  }
  return {
    group,
    update(camera, { opacity = 1, tint = null } = {}) {
      const cp = camera.position;
      for (const { s, op } of items) {
        const d = s.position.distanceTo(cp);
        const near = Math.max(0, Math.min(1, (d - s.scale.x * 0.12) / (s.scale.x * 0.5)));
        s.material.opacity = op * opacity * near;
        s.visible = s.material.opacity > 0.003;
        if (tint) s.material.color.copy(tint);
      }
    },
  };
}

// Low-poly desert mountains on a ring (vertex-coloured, fogged).
export function makeMountains({ r0 = 650, r1 = 1250, seed = 5 } = {}) {
  const R = rng(seed);
  const segA = 260, segR = 26;
  const pos = [], col = [], idx = [];
  const ph = Array.from({ length: 8 }, () => R() * Math.PI * 2);
  const h = (a, f) => {
    let v = 0, amp = 1, fr = 3;
    for (let o = 0; o < 6; o++) {
      v += amp * (0.5 + 0.5 * Math.sin(a * fr + ph[o] + f * (2 + o) * 1.7) * Math.cos(a * fr * 0.63 + ph[o + 1 & 7] - f * 3.1));
      amp *= 0.52;
      fr *= 2.07;
    }
    return v;
  };
  const cA = new THREE.Color('#b5714a'), cB = new THREE.Color('#7c4a35'), cC = new THREE.Color('#d9a777');
  for (let i = 0; i <= segA; i++) {
    const a = (i / segA) * Math.PI * 2;
    for (let j = 0; j <= segR; j++) {
      const f = j / segR;
      const r = r0 + (r1 - r0) * f;
      const ridge = Math.sin(f * Math.PI) ** 0.8;
      const y = Math.max(0, h(a, f) * 210 * ridge - 30) * (0.55 + 0.45 * Math.sin(a * 2 + 1.3) ** 2);
      pos.push(Math.cos(a) * r, y - 2, Math.sin(a) * r);
      const c = cB.clone().lerp(cA, Math.min(1, y / 140)).lerp(cC, Math.max(0, Math.min(1, (y - 150) / 120)) * 0.5);
      col.push(c.r, c.g, c.b);
      if (i < segA && j < segR) {
        const k = i * (segR + 1) + j;
        idx.push(k, k + 1, k + segR + 1, k + 1, k + segR + 2, k + segR + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
  m.receiveShadow = false;
  return m;
}
