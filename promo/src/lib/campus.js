import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { graded, G } from './grade.js';
import { MPP, px2w, rng } from './util.js';
import { glowSprite } from './labels.js';
import { buildAtlas, noiseCanvas, sandTexture } from './atlas.js';

// Builds the Begin school campus from the app's own data: building footprints
// (data/buildings3d.json), courtyard props (data/scene3d.json), room positions
// (data/rooms.json) and the paper plan (public/maps/plan.jpg), repainted into a
// high-resolution atlas that becomes both the ground and the roofs.

function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}

function canvasTex(c, renderer, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// Facade bay: 3.2 m x 4 m. Cream plaster, framed windows with sky reflections.
function wallTextures(renderer) {
  const W = 512, H = 640;
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    return [c, c.getContext('2d')];
  };
  const [c, g] = mk();
  const [m, gm] = mk(); // night glow mask
  const [r, gr] = mk(); // roughness (green channel)
  const px = W / 3.2; // px per metre
  // plaster
  g.fillStyle = '#ebe1cd';
  g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'overlay';
  g.globalAlpha = 0.35;
  g.drawImage(noiseCanvas(256, 5, 12), 0, 0, W, H);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  // rain streaks + dirt toward the base
  const R = rng(3);
  for (let i = 0; i < 26; i++) {
    const x = R() * W, w = 2 + R() * 6, y = H * (0.2 + R() * 0.3);
    const lg = g.createLinearGradient(0, y, 0, H);
    lg.addColorStop(0, 'rgba(120,100,80,0)');
    lg.addColorStop(1, `rgba(120,100,80,${0.05 + R() * 0.06})`);
    g.fillStyle = lg;
    g.fillRect(x, y, w, H - y);
  }
  const base = g.createLinearGradient(0, H * 0.82, 0, H);
  base.addColorStop(0, 'rgba(90,75,60,0)');
  base.addColorStop(1, 'rgba(90,75,60,0.22)');
  g.fillStyle = base;
  g.fillRect(0, H * 0.82, W, H * 0.18);
  // plinth + cornice
  g.fillStyle = '#b8ad9c';
  g.fillRect(0, H - 0.32 * px, W, 0.32 * px);
  g.fillStyle = '#f6f1e7';
  g.fillRect(0, 0, W, 0.18 * px);
  g.fillStyle = 'rgba(0,0,0,0.12)';
  g.fillRect(0, 0.18 * px, W, 4);
  // window
  const x0 = 0.5 * px, x1 = 2.7 * px, yT = H - 2.85 * px, yB = H - 1.0 * px;
  // reveal shadow
  g.fillStyle = 'rgba(60,50,40,0.35)';
  g.fillRect(x0 - 6, yT - 6, x1 - x0 + 12, yB - yT + 14);
  const glass = g.createLinearGradient(0, yT, 0, yB);
  glass.addColorStop(0, '#8fb3d9');
  glass.addColorStop(0.35, '#4f6f93');
  glass.addColorStop(1, '#22344c');
  g.fillStyle = glass;
  g.fillRect(x0, yT, x1 - x0, yB - yT);
  // diagonal reflection streaks
  g.save();
  g.beginPath();
  g.rect(x0, yT, x1 - x0, yB - yT);
  g.clip();
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.beginPath();
  g.moveTo(x0 + 40, yT); g.lineTo(x0 + 110, yT); g.lineTo(x0 - 20, yB); g.lineTo(x0 - 90, yB); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.1)';
  g.beginPath();
  g.moveTo(x0 + 170, yT); g.lineTo(x0 + 200, yT); g.lineTo(x0 + 70, yB); g.lineTo(x0 + 40, yB); g.fill();
  g.restore();
  // frames (blue, like the school's buildings) + mullions
  g.strokeStyle = '#2d5ba8';
  g.lineWidth = 9;
  g.strokeRect(x0, yT, x1 - x0, yB - yT);
  g.lineWidth = 6;
  g.beginPath();
  g.moveTo((x0 + x1) / 2, yT); g.lineTo((x0 + x1) / 2, yB);
  g.moveTo(x0, yT + (yB - yT) * 0.32); g.lineTo(x1, yT + (yB - yT) * 0.32);
  g.stroke();
  // sill
  g.fillStyle = '#f4efe6';
  g.fillRect(x0 - 12, yB + 2, x1 - x0 + 24, 12);
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.fillRect(x0 - 12, yB + 14, x1 - x0 + 24, 5);
  // roughness: plaster rough, glass glossy, frames satin
  gr.fillStyle = 'rgb(235,235,235)';
  gr.fillRect(0, 0, W, H);
  gr.fillStyle = 'rgb(20,20,20)';
  gr.fillRect(x0, yT, x1 - x0, yB - yT);
  gr.strokeStyle = 'rgb(110,110,110)';
  gr.lineWidth = 9;
  gr.strokeRect(x0, yT, x1 - x0, yB - yT);
  // night glow mask: warm interior light, a few rooms dark
  gm.fillStyle = '#000';
  gm.fillRect(0, 0, W, H);
  const gg = gm.createLinearGradient(0, yT, 0, yB);
  gg.addColorStop(0, '#ffe2b0');
  gg.addColorStop(1, '#ff9c48');
  gm.fillStyle = gg;
  gm.fillRect(x0 + 5, yT + 5, x1 - x0 - 10, yB - yT - 10);
  const out = { tex: canvasTex(c, renderer), mask: canvasTex(m, renderer), rough: canvasTex(r, renderer, false) };
  for (const t of Object.values(out)) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / 3.2, 1 / 4);
  }
  return out;
}

// UVs: roofs sample the atlas at their own position; walls tile in metres.
const PlanUV = {
  generateTopUV(geometry, v, a, b, c) {
    const f = (i) => new THREE.Vector2((v[i * 3] / MPP + 1000) / 2000, 1 - (-v[i * 3 + 1] / MPP + 750) / 1500);
    return [f(a), f(b), f(c)];
  },
  generateSideWallUV(geometry, v, a, b, c, d) {
    const P = (i) => [v[i * 3], v[i * 3 + 1], v[i * 3 + 2]];
    const [ax, ay, az] = P(a), [bx, by, bz] = P(b), [, , cz] = P(c), [, , dz] = P(d);
    const len = Math.hypot(bx - ax, by - ay);
    const base = Math.abs(bx - ax) > Math.abs(by - ay) ? Math.min(ax, bx) : Math.min(ay, by);
    const u0 = base, u1 = base + len;
    return [new THREE.Vector2(u0, az), new THREE.Vector2(u1, bz), new THREE.Vector2(u1, cz), new THREE.Vector2(u0, dz)];
  },
};

// Soft, chunky stylised tree crowns: displaced spheres with baked vertex-colour shading.
function treeGeometry(trees) {
  const R = rng(11);
  const crowns = [];
  const trunks = [];
  const greens = ['#4d8a34', '#5a9a3c', '#3f7a30', '#68a645', '#4f9038'].map((c) => new THREE.Color(c));
  const tmpN = new THREE.Vector3();
  trees.forEach(([x, y, r, h], ti) => {
    const [X, Z] = px2w(x, y);
    const th = h * 0.42;
    const trunk = new THREE.CylinderGeometry(0.13, 0.26, th + 0.6, 7, 1);
    trunk.translate(X, (th + 0.6) / 2, Z);
    trunks.push(trunk);
    const base = greens[Math.floor(R() * greens.length)];
    const blobs = 3 + Math.floor(R() * 3);
    for (let k = 0; k < blobs; k++) {
      const geo = new THREE.IcosahedronGeometry(1, 3);
      const rr = r * (k === 0 ? 1 : 0.55 + R() * 0.3);
      const ox = k === 0 ? 0 : (R() - 0.5) * r * 1.2, oz = k === 0 ? 0 : (R() - 0.5) * r * 1.2;
      const oy = th + r * 0.7 + (k === 0 ? 0 : R() * r * 0.6);
      const pos = geo.attributes.position;
      const cols = new Float32Array(pos.count * 3);
      const seed = R() * 10;
      for (let i = 0; i < pos.count; i++) {
        tmpN.fromBufferAttribute(pos, i).normalize();
        const n = Math.sin(tmpN.x * 4.1 + seed) * Math.sin(tmpN.y * 3.7 + seed * 1.3) * Math.sin(tmpN.z * 4.5 + seed * 0.7);
        const d = 1 + n * 0.16;
        pos.setXYZ(i, X + ox + tmpN.x * rr * d, oy + tmpN.y * rr * 0.86 * d, Z + oz + tmpN.z * rr * d);
        const shade = 0.55 + 0.55 * (tmpN.y * 0.5 + 0.5) + n * 0.15;
        cols[i * 3] = base.r * shade;
        cols[i * 3 + 1] = base.g * shade;
        cols[i * 3 + 2] = base.b * shade;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      geo.computeVertexNormals();
      crowns.push(geo);
    }
  });
  return { crowns: mergeGeometries(crowns), trunks: mergeGeometries(trunks) };
}

export async function buildCampus(renderer, { lang = 'he', rooms = [], skyEnv = null } = {}) {
  const [bjson, sjson, planImg] = await Promise.all([
    fetch('../../data/buildings3d.json').then((r) => r.json()),
    fetch('../../data/scene3d.json').then((r) => r.json()),
    loadImage('../../public/maps/plan.jpg'),
  ]);
  const root = new THREE.Group();
  root.name = 'campus';
  const atlasCanvas = await buildAtlas({ planImg, buildings: bjson.buildings, scene3d: sjson, rooms, lang });
  const atlas = canvasTex(atlasCanvas, renderer);
  const walls = wallTextures(renderer);
  const detail = canvasTex(noiseCanvas(256, 5, 99), renderer, false);
  detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
  G.uDetail.value = detail;

  // --- ground: atlas over the site, desert sand beyond ---------------------------
  const groundMat = graded(new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.92, metalness: 0 }), { key: 'ground', detail: 0.55 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000 * MPP, 1500 * MPP), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);
  const sand = sandTexture();
  sand.repeat.set(1450 * 2 / 16, 1450 * 2 / 16);
  const outerMat = graded(new THREE.MeshStandardMaterial({ map: sand, roughness: 1 }), { key: 'outer', detail: 0.6 });
  const outer = new THREE.Mesh(new THREE.CircleGeometry(1450, 96), outerMat);
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.05;
  outer.receiveShadow = true;
  root.add(outer);

  // --- buildings -------------------------------------------------------------
  const roofMat = graded(new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.8 }), { key: 'roof', detail: 0.35 });
  const wallMat = graded(
    new THREE.MeshStandardMaterial({ map: walls.tex, roughnessMap: walls.rough, roughness: 1, metalness: 0, envMap: skyEnv, envMapIntensity: 0.9 }),
    {
      key: 'wall',
      decl: 'uniform sampler2D uWin;\n',
      uniforms: { uWin: { value: walls.mask } },
      glow: 'texture2D(uWin, vMapUv).rgb * 3.2',
    }
  );
  const buildings = new THREE.Group();
  buildings.name = 'buildings';
  root.add(buildings);
  const edgeMat = new THREE.LineBasicMaterial({ color: '#7d7568', transparent: true, opacity: 0.45 });
  for (const b of bjson.buildings) {
    const shape = new THREE.Shape(b.ring.map(([x, y]) => {
      const [X, Z] = px2w(x, y);
      return new THREE.Vector2(X, -Z);
    }));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: b.h, bevelEnabled: false, UVGenerator: PlanUV });
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, [roofMat, wallMat]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const holder = new THREE.Group();
    holder.add(mesh);
    holder.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), edgeMat));
    let cx = 0, cy = 0;
    for (const [x, y] of b.ring) { cx += x; cy += y; }
    holder.userData = { cx: cx / b.ring.length, cy: cy / b.ring.length, h: b.h, kind: b.kind };
    buildings.add(holder);
  }

  // --- props: sails, trees, lamps (rise with the buildings) -------------------------
  const props = new THREE.Group();
  props.name = 'props';
  root.add(props);

  const sailTex = (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(128, 128, 10, 128, 128, 190);
    rg.addColorStop(0, '#e2483a');
    rg.addColorStop(1, '#a92a22');
    g.fillStyle = rg;
    g.fillRect(0, 0, 256, 256);
    g.globalCompositeOperation = 'overlay';
    g.globalAlpha = 0.25;
    g.drawImage(noiseCanvas(128, 4, 55), 0, 0, 256, 256);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgba(255,220,200,0.35)';
    g.lineWidth = 3;
    g.strokeRect(6, 6, 244, 244);
    g.strokeStyle = 'rgba(80,10,10,0.25)';
    g.lineWidth = 1.5;
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(i * 64, 6); g.lineTo(i * 64, 250); g.stroke(); }
    return canvasTex(c, renderer);
  })();
  const sailMat = graded(new THREE.MeshStandardMaterial({ map: sailTex, roughness: 0.8, side: THREE.DoubleSide }), { key: 'sail' });
  const postMat = graded(new THREE.MeshStandardMaterial({ color: '#e9e9e9', roughness: 0.4, metalness: 0.5, envMap: skyEnv }), { key: 'post' });
  for (const s of sjson.sails || []) {
    const size = s.s * MPP;
    const [X, Z] = px2w(s.x, s.y);
    const g = new THREE.PlaneGeometry(size, size, 12, 12);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const u = pos.getX(i) / size, v = pos.getY(i) / size;
      pos.setZ(i, -(1 - 4 * u * u) * (1 - 4 * v * v) * 0.6);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, sailMat);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = s.rot || 0;
    m.position.set(X, 4.6, Z);
    m.castShadow = true;
    props.add(m);
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.8, 8), postMat);
      p.position.set(X + (dx * size) / 2, 2.4, Z + (dz * size) / 2);
      p.castShadow = true;
      props.add(p);
    }
  }

  const tg = treeGeometry(sjson.trees || []);
  const crownMat = graded(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), { key: 'crown2' });
  const trunkMat = graded(new THREE.MeshStandardMaterial({ color: '#6e5038', roughness: 1 }), { key: 'trunk' });
  const crowns = new THREE.Mesh(tg.crowns, crownMat);
  const trunks = new THREE.Mesh(tg.trunks, trunkMat);
  crowns.castShadow = trunks.castShadow = true;
  crowns.receiveShadow = trunks.receiveShadow = true;
  props.add(trunks, crowns);

  const lampGlows = [];
  const poleMat = graded(new THREE.MeshStandardMaterial({ color: '#3d4148', roughness: 0.4, metalness: 0.7, envMap: skyEnv }), { key: 'pole' });
  const headMat = graded(new THREE.MeshStandardMaterial({ color: '#f2e2c4', roughness: 0.4 }), { key: 'lamphead', glow: 'vec3(3.0, 2.1, 1.1)' });
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.1, 4.6, 8);
  poleGeo.translate(0, 2.3, 0);
  const headGeo = new THREE.SphereGeometry(0.28, 16, 10);
  for (const [x, y] of sjson.lamps || []) {
    const [X, Z] = px2w(x, y);
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(X, 0, Z);
    pole.castShadow = true;
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(X, 4.7, Z);
    const glow = glowSprite('#ffb867', 3.2);
    glow.position.set(X, 4.7, Z);
    props.add(pole, head, glow);
    lampGlows.push(glow);
  }

  return { root, buildings, props, lampGlows, atlas, groundMat };
}
