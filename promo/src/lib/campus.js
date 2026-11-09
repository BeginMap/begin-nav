import * as THREE from 'three';
import { graded } from './grade.js';
import { MPP, px2w, rng } from './util.js';
import { glowSprite } from './labels.js';

// Builds the Begin school campus from the app's own data: building footprints
// (data/buildings3d.json), courtyard props (data/scene3d.json) and the paper plan
// (public/maps/plan.jpg) that becomes both the ground and the roofs.

const OUTER = '#b9b2a4';

function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}

async function planTexture(renderer) {
  const im = await loadImage('../../public/maps/plan.jpg');
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 1536;
  const g = c.getContext('2d');
  g.drawImage(im, 0, 0, c.width, c.height);
  // gentle grade: a bit less saturated, a bit brighter, so 3D lighting reads well
  g.globalCompositeOperation = 'saturation';
  g.fillStyle = 'hsla(0,0%,50%,0.25)';
  g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'source-over';
  // feather the sheet edges into the outer ground colour
  const f = 90;
  const sides = [
    [0, 0, c.width, f, 0, 0, 0, f],
    [0, c.height - f, c.width, f, 0, c.height, 0, c.height - f],
    [0, 0, f, c.height, 0, 0, f, 0],
    [c.width - f, 0, f, c.height, c.width, 0, c.width - f, 0],
  ];
  for (const [x, y, w, h, x0, y0, x1, y1] of sides) {
    const gr = g.createLinearGradient(x0, y0, x1, y1);
    gr.addColorStop(0, OUTER);
    gr.addColorStop(1, 'rgba(185,178,164,0)');
    g.fillStyle = gr;
    g.fillRect(x, y, w, h);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function wallTextures() {
  // One window bay: 3.2 m wide x 4 m tall tile.
  const W = 256, H = 320;
  const mk = () => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    return [c, c.getContext('2d')];
  };
  const [c, g] = mk();
  const [m, gm] = mk();
  const R = rng(7);
  g.fillStyle = '#efede7';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) {
    const v = 225 + R() * 25;
    g.fillStyle = `rgba(${v},${v - 2},${v - 6},0.25)`;
    g.fillRect(R() * W, R() * H, 2, 2);
  }
  const yTop = H * (1 - 2.75 / 4), yBot = H * (1 - 1.05 / 4);
  const x0 = W * (0.55 / 3.2), x1 = W * (2.65 / 3.2);
  // window glass
  const gl = g.createLinearGradient(0, yTop, 0, yBot);
  gl.addColorStop(0, '#5f7895');
  gl.addColorStop(0.5, '#2c3d55');
  gl.addColorStop(1, '#1e2b3e');
  g.fillStyle = gl;
  g.fillRect(x0, yTop, x1 - x0, yBot - yTop);
  // frames (blue, as on the school's buildings)
  g.strokeStyle = '#2f5fb3';
  g.lineWidth = 5;
  g.strokeRect(x0, yTop, x1 - x0, yBot - yTop);
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo((x0 + x1) / 2, yTop);
  g.lineTo((x0 + x1) / 2, yBot);
  g.moveTo(x0, yTop + (yBot - yTop) * 0.35);
  g.lineTo(x1, yTop + (yBot - yTop) * 0.35);
  g.stroke();
  // sill + plinth + cornice
  g.fillStyle = '#d9d6cf';
  g.fillRect(x0 - 6, yBot, x1 - x0 + 12, 7);
  g.fillStyle = '#9b968c';
  g.fillRect(0, H - 14, W, 14);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, 6);
  // night glow mask: warm lit windows (some dark, deterministic)
  gm.fillStyle = '#000';
  gm.fillRect(0, 0, W, H);
  const gg = gm.createLinearGradient(0, yTop, 0, yBot);
  gg.addColorStop(0, '#ffd9a0');
  gg.addColorStop(1, '#ff9d4a');
  gm.fillStyle = gg;
  gm.fillRect(x0 + 3, yTop + 3, x1 - x0 - 6, yBot - yTop - 6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mask = new THREE.CanvasTexture(m);
  for (const t of [tex, mask]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1 / 3.2, 1 / 4);
    t.anisotropy = 4;
  }
  return { tex, mask };
}

// UVs: roofs sample the plan at their own position; walls tile in metres.
const PlanUV = {
  generateTopUV(geometry, v, a, b, c) {
    const f = (i) => new THREE.Vector2((v[i * 3] / MPP + 1000) / 2000, 1 - (-v[i * 3 + 1] / MPP + 750) / 1500);
    return [f(a), f(b), f(c)];
  },
  generateSideWallUV(geometry, v, a, b, c, d) {
    const P = (i) => [v[i * 3], v[i * 3 + 1], v[i * 3 + 2]];
    const [ax, ay, az] = P(a), [bx, by, bz] = P(b), [cx, cy, cz] = P(c), [dx, dy, dz] = P(d);
    const len = Math.hypot(bx - ax, by - ay);
    // continuous coordinate along the wall direction so bays line up
    const base = Math.abs(bx - ax) > Math.abs(by - ay) ? Math.min(ax, bx) : Math.min(ay, by);
    const u0 = base, u1 = base + len;
    return [new THREE.Vector2(u0, az), new THREE.Vector2(u1, bz), new THREE.Vector2(u1, cz), new THREE.Vector2(u0, dz)];
  },
};

export async function buildCampus(renderer) {
  const [bjson, sjson] = await Promise.all([
    fetch('../../data/buildings3d.json').then((r) => r.json()),
    fetch('../../data/scene3d.json').then((r) => r.json()),
  ]);
  const root = new THREE.Group();
  root.name = 'campus';
  const plan = await planTexture(renderer);
  const walls = wallTextures();

  // --- ground ---------------------------------------------------------------
  const groundMat = graded(new THREE.MeshStandardMaterial({ map: plan, roughness: 0.95, metalness: 0 }), { key: 'ground' });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000 * MPP, 1500 * MPP), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  root.add(ground);
  const outerMat = graded(new THREE.MeshStandardMaterial({ color: OUTER, roughness: 1 }), { key: 'outer' });
  const outer = new THREE.Mesh(new THREE.CircleGeometry(900, 64), outerMat);
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.05;
  outer.receiveShadow = true;
  root.add(outer);

  // --- buildings -------------------------------------------------------------
  const roofMat = graded(new THREE.MeshStandardMaterial({ map: plan, roughness: 0.85, color: '#ffffff' }), { key: 'roof' });
  const wallMat = graded(
    new THREE.MeshStandardMaterial({ map: walls.tex, roughness: 0.8, metalness: 0.0 }),
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
  const edgeMat = new THREE.LineBasicMaterial({ color: '#6d7889', transparent: true, opacity: 0.55 });
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
    const holder = new THREE.Group(); // scaled in Y for the "map rises into 3D" moment
    holder.add(mesh);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), edgeMat);
    holder.add(edges);
    // remember centroid for staggered animations
    let cx = 0, cy = 0;
    for (const [x, y] of b.ring) { cx += x; cy += y; }
    holder.userData = { cx: cx / b.ring.length, cy: cy / b.ring.length, h: b.h, kind: b.kind };
    buildings.add(holder);
  }

  // --- grass, sails, trees, lamps (rise with the buildings) --------------------
  const props = new THREE.Group();
  props.name = 'props';
  root.add(props);
  const grassMat = graded(new THREE.MeshStandardMaterial({ color: '#7fae58', roughness: 1 }), { key: 'grass' });
  for (const poly of sjson.grass || []) {
    const shape = new THREE.Shape(poly.map(([x, y]) => { const [X, Z] = px2w(x, y); return new THREE.Vector2(X, -Z); }));
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, grassMat);
    m.position.y = 0.04;
    m.receiveShadow = true;
    props.add(m);
  }

  const sailMat = graded(new THREE.MeshStandardMaterial({ color: '#d8352f', roughness: 0.7, side: THREE.DoubleSide }), { key: 'sail' });
  const postMat = graded(new THREE.MeshStandardMaterial({ color: '#e9e9e9', roughness: 0.5, metalness: 0.3 }), { key: 'post' });
  for (const s of sjson.sails || []) {
    const size = s.s * MPP;
    const [X, Z] = px2w(s.x, s.y);
    const g = new THREE.PlaneGeometry(size, size, 8, 8);
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
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 4.8, 6), postMat);
      p.position.set(X + (dx * size) / 2, 2.4, Z + (dz * size) / 2);
      p.castShadow = true;
      props.add(p);
    }
  }

  const trees = sjson.trees || [];
  const trunkGeo = new THREE.CylinderGeometry(0.16, 0.24, 1, 6);
  trunkGeo.translate(0, 0.5, 0);
  const crownGeo = new THREE.IcosahedronGeometry(1, 1);
  const trunkMat = graded(new THREE.MeshStandardMaterial({ color: '#7a5a3c', roughness: 1 }), { key: 'trunk' });
  const crownMat = graded(new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, flatShading: true }), { key: 'crown' });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, trees.length * 2);
  const R = rng(11);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), P = new THREE.Vector3();
  const greens = ['#4f8a3a', '#5e9a44', '#6aa64b', '#47803a', '#5a9440'].map((c) => new THREE.Color(c));
  let ci = 0;
  trees.forEach(([x, y, r, h], i) => {
    const [X, Z] = px2w(x, y);
    const th = h * 0.42;
    M.compose(P.set(X, 0, Z), Q.identity(), S.set(1, th, 1));
    trunks.setMatrixAt(i, M);
    for (let k = 0; k < 2; k++) {
      const rr = r * (k ? 0.72 : 1) * (0.9 + R() * 0.2);
      Q.setFromEuler(new THREE.Euler(R() * 3, R() * 3, R() * 3));
      M.compose(P.set(X + (k ? (R() - 0.5) * r : 0), th + rr * (k ? 1.25 : 0.75), Z + (k ? (R() - 0.5) * r : 0)), Q, S.set(rr, rr * 0.85, rr));
      crowns.setMatrixAt(ci, M);
      crowns.setColorAt(ci, greens[Math.floor(R() * greens.length)]);
      ci++;
    }
  });
  trunks.castShadow = crowns.castShadow = true;
  trunks.receiveShadow = crowns.receiveShadow = true;
  props.add(trunks, crowns);

  const lampGlows = [];
  const poleMat = graded(new THREE.MeshStandardMaterial({ color: '#3d4148', roughness: 0.5, metalness: 0.6 }), { key: 'pole' });
  const headMat = graded(new THREE.MeshStandardMaterial({ color: '#f2e2c4', roughness: 0.4 }), { key: 'lamphead', glow: 'vec3(3.0, 2.1, 1.1)' });
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.1, 4.6, 6);
  poleGeo.translate(0, 2.3, 0);
  const headGeo = new THREE.SphereGeometry(0.28, 12, 8);
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

  return { root, buildings, props, lampGlows, plan, groundMat };
}
