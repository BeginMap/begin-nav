import * as THREE from 'three';
import { G } from './lib/grade.js';
import { clamp, lerp, remap, ease, spring, envelope, wobble, rng, px2w } from './lib/util.js';
import { roomTag, questionBubble, glowSprite, xMark } from './lib/labels.js';
import { makePin, makeRing } from './lib/pin.js';
import { makeRoute, makeHereDot } from './lib/route.js';
import { makePhone } from './lib/phone.js';
import { photoCard, qrCard } from './lib/cards.js';
import { makeLogo3D } from './lib/logo3d.js';
import { makeMotes, makeBurst, makeTrail, makeHoloGrid, makePillar } from './lib/fx.js';
import { makeSilkField } from './lib/silk.js';
import { glassCard, iconTile } from './lib/glass.js';
import * as OV from './lib/overlay.js';
import { TEXT, PHOTOS, EDITS } from './text.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const W2 = (x, y) => { const [X, Z] = px2w(x, y); return V(X, 0, Z); };

// "Liquid light" cut: everything floats in the dark among glowing silk; the school is a
// floating diorama; UI pops out of the phone as 3D glass. Pure function of time.
export async function createSilkDirector(ctx) {
  const { scene, camera, world, post, campus, envMap, lang, screens, homes, vo, rooms, routesJson } = ctx;
  const TX = TEXT[lang];
  const S = TX.sync;
  const { T, VO_AT } = EDITS.silk;
  const rtl = TX.dir === 'rtl';
  const HS = TX.hScale || 1;
  scene.add(camera);

  const words = (line) => vo.lines[line].words;
  const wt = (line, k) => { const w = words(line); return VO_AT[line] + w[k < 0 ? w.length + k : Math.min(k, w.length - 1)].t0; };
  const capWords = {};
  for (const line of Object.keys(vo.lines)) {
    let ws = words(line).map((w) => ({ ...w, w: TX.capReplace[w.w] || w.w }));
    for (const [a, b, rep] of TX.capMerge) {
      for (let i = 0; i < ws.length - 1; i++) {
        if (ws[i].w.replace(/[.,]/g, '') === a && ws[i + 1].w.replace(/[.,]/g, '') === b) ws.splice(i, 2, { w: rep, t0: ws[i].t0, t1: ws[i + 1].t1 });
      }
    }
    capWords[line] = ws;
  }

  const room = (id) => rooms.find((r) => r.id === id);
  const ENT = W2(...routesJson.entrance);
  const COURT = W2(926, 1002);
  const DOL = W2(room('dolphin').x, room('dolphin').y);
  const HERE = W2(...routesJson.fromCourt.start);
  const ROOF = 3.8;
  const PX = 1920 * (ctx.pixelRatio || 1);

  const dyn = [];
  const add = (o, parent = scene) => { parent.add(o); dyn.push(o); return o; };

  // ---- the stage -------------------------------------------------------------------
  world.sky.visible = false;
  scene.background = new THREE.Color('#020309');
  const silk = makeSilkField();
  scene.add(silk.group);
  const rim = new THREE.DirectionalLight('#6f9dff', 1.2);
  rim.position.set(-6, 4, -10);
  scene.add(rim);
  const warmKey = new THREE.DirectionalLight('#ffd2a6', 0.0);
  warmKey.position.set(5, 6, 6);
  scene.add(warmKey);

  // diorama: the whole campus as a floating tile
  const dio = new THREE.Group();
  scene.add(dio);
  dio.add(campus.root);
  campus.root.children.forEach((c) => { if (c.geometry && c.geometry.type === 'CircleGeometry') c.visible = false; });
  const slab = new THREE.Mesh(new THREE.BoxGeometry(216, 5, 162), new THREE.MeshStandardMaterial({ color: '#0a1028', roughness: 0.6, metalness: 0.3, envMap }));
  slab.position.y = -2.56;
  campus.root.add(slab);
  const slabEdges = new THREE.LineSegments(new THREE.EdgesGeometry(slab.geometry), new THREE.LineBasicMaterial({ color: new THREE.Color(0.5, 1.4, 3.0), toneMapped: false }));
  slabEdges.position.copy(slab.position);
  campus.root.add(slabEdges);
  const DS = 0.032; // diorama scale (metres -> stage units)

  const pinBig = add(makePin(envMap), dio);
  const pinDest = add(makePin(envMap), dio);
  const ringA = add(makeRing('#7fb6ff'), dio);
  const ringB = add(makeRing('#ffb35a'), dio);
  const tapRings = [add(makeRing('#ffffff'), dio), add(makeRing('#ffffff'), dio)];
  const routeD = makeRoute(routesJson.dolphin.pts, { radius: 0.9 });
  add(routeD.group, dio);
  const routeC = makeRoute(routesJson.fromCourt.pts, { radius: 0.9 });
  add(routeC.group, dio);
  const routeT = makeRoute(routesJson.courtToilet.pts, { color: '#22a6f2', radius: 0.9 });
  add(routeT.group, dio);
  const hereDot = add(makeHereDot(), dio);
  const entDot = add(makeHereDot(), dio);
  const holo = add(makeHoloGrid(300, 260), dio);
  const pillar = add(makePillar('#ffb35a', 120, 3.0), dio);
  const mazeRoutes = routesJson.maze.map((m) => {
    const r = makeRoute(m.pts, { color: '#a9c8ff', radius: 0.7, y: 0.6 });
    add(r.group, dio);
    const x = add(xMark(3.0), dio);
    return { r, x, cut: m.cut };
  });
  const fxCfg = (pts, a, b, size, extra = {}) => {
    const u = pts.material.uniforms;
    u.uColorA.value.set(a); u.uColorB.value.set(b); u.uSize.value = size; u.uPx.value = PX;
    for (const [k, v] of Object.entries(extra)) u[k].value = v;
    return pts;
  };
  const trailD = fxCfg(add(makeTrail(routeD.curve, 900, 9), dio), '#ff9a3c', '#ffe7a8', 0.9);
  const trailC = fxCfg(add(makeTrail(routeC.curve, 700, 19), dio), '#ff9a3c', '#ffe7a8', 0.9);
  const trailT = fxCfg(add(makeTrail(routeT.curve, 420, 29), dio), '#4fc3ff', '#e6f6ff', 0.9, { uLen: 0.3 });
  const burstIn = fxCfg(add(makeBurst(900, 41)), '#7fb6ff', '#ffffff', 0.16, { uSpeed: 9, uLife: 99, uGrav: 0 });
  const burstOut = fxCfg(add(makeBurst(900, 7)), '#9fd2ff', '#ffffff', 0.12, { uSpeed: 7, uLife: 2.4, uGrav: 1.2 });
  const burstDest = fxCfg(add(makeBurst(420, 17), dio), '#ffb35a', '#fff1c4', 1.2, { uSpeed: 40, uLife: 1.6, uGrav: 20 });
  const dust = fxCfg(add(makeMotes(700, [26, 30, 30], 3)), '#7fb0ff', '#ffffff', 0.035);
  dust.position.set(0, -15, -18);
  const dustWarm = fxCfg(add(makeMotes(500, [26, 30, 30], 8)), '#ffc27a', '#fff4dc', 0.035);
  dustWarm.position.set(0, -15, -18);

  // floating room tags for the opening "where is my class?"
  const R = rng(5);
  const tagIds = ['dolphin', 'tochnit', 'halil', 'zaharon', 'solit', 'shonit', 'marganit', 'tzvoni', 'hatzav', 'narkis', 'almogit', 'pazit', 'dror', 'tzofit', 'anafa'];
  const tags = tagIds.map((id, i) => {
    const r = room(id);
    const s = add(r ? roomTag(r.names[lang] || r.names.he, { rtl, size: 0.34 }) : questionBubble(0.3));
    s.userData.p = V((R() - 0.5) * 7, (R() - 0.5) * 11, 0);
    s.userData.ph = R() * 40;
    return s;
  });
  const qs = Array.from({ length: 8 }, () => {
    const s = add(questionBubble(0.32));
    s.userData.p = V((R() - 0.5) * 7, (R() - 0.5) * 11, 0);
    s.userData.ph = R() * 40;
    return s;
  });

  // camera-space props
  const phone = makePhone(envMap);
  add(phone.group, camera);
  const langPhones = ['he', 'ru', 'en'].map(() => { const p = makePhone(envMap); add(p.group, camera); return p; });
  const cards = [];
  for (let i = 0; i < PHOTOS.length; i++) cards.push(add(await photoCard('../../' + PHOTOS[i], envMap, { w: 0.82, caption: TX.photoCaptions[i], rtl }), camera));
  const qr = add(await qrCard(envMap, { title: TX.qrTitle }), camera);
  const logo = await makeLogo3D(envMap);
  add(logo.group, camera);
  const endPin = add(makePin(envMap), camera);
  const tiles = ['wc', 'office', 'shelter'].map((k) => add(iconTile(k, envMap, { color: k === 'shelter' ? '#ff7a1a' : k === 'wc' ? '#0ea5e9' : '#1d4ed8', size: 0.36 }), camera));
  const tileCards = TX.chips.map((txt) => add(glassCard([{ text: txt, size: 64, weight: 800, align: 'center' }], { w: 760, h: 150, dir: TX.dir, world: 0.56 }), camera));
  const typeKeys = Object.keys(screens).filter((k) => k.startsWith('02_type')).sort((a, b) => parseInt(a.slice(7)) - parseInt(b.slice(7)));
  const query = TX.room;
  const searchCards = [0, ...typeKeys.map((_, i) => i + 1)].map((n) => {
    const s = n === 0 ? '' : [...query].slice(0, Math.min(n, [...query].length)).join('');
    return add(glassCard([{ text: s || ' ', size: 84, weight: 800 }], { w: 900, h: 190, dir: TX.dir, icon: 'search', world: 0.95 }), camera);
  });
  const resultCard = add(glassCard([{ text: TX.room, size: 90, weight: 900 }, { text: lang === 'he' ? 'כיתה · חט"ב' : 'Кабинет · средняя школа', size: 54, weight: 600, color: '#a9c2ee' }], { w: 900, h: 260, dir: TX.dir, icon: 'pin', world: 0.95 }), camera);
  for (const o of [phone.group, ...langPhones.map((p) => p.group), ...cards, qr, logo.group, endPin, ...tiles]) o.traverse((c) => { c.castShadow = false; c.receiveShadow = false; });
  // calmer glass reflections on the phones against the dark stage
  for (const p of [phone, ...langPhones]) { const [glass, frame] = p.group.children[0].material; glass.envMapIntensity = 0.3; frame.envMapIntensity = 0.8; }
  const sweep = add(new THREE.PointLight('#ffffff', 0, 7, 2), camera);

  // ---- helpers ----------------------------------------------------------------------
  const setCam = (pos, look, fov = 38, roll = 0) => {
    camera.position.copy(pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(look);
    if (roll) camera.rotateZ(roll);
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld(true);
  };
  const showSprite = (s, scale, opacity = 1) => {
    s.visible = scale > 0.001 && opacity > 0.001;
    const [w, h] = s.userData.baseScale;
    s.scale.set(w * scale, h * scale, 1);
    s.material.opacity = opacity;
  };
  const ringAt = (ring, p, r, op, width = 0.08) => {
    ring.visible = op > 0.001;
    ring.position.set(p.x, p.y + 0.3, p.z);
    ring.scale.set(r, r, r);
    ring.material.uniforms.uOpacity.value = op;
    ring.material.uniforms.uWidth.value = width;
  };
  const placeDio = (pos, rotY, scale = DS, tiltX = 0) => {
    dio.visible = true;
    dio.position.copy(pos);
    dio.rotation.set(tiltX, rotY, 0);
    dio.scale.setScalar(scale);
    dio.updateMatrixWorld(true);
    // sun follows the diorama so its shadows stay crisp
    const c = dio.position;
    world.sun.position.set(c.x - 4, c.y + 9, c.z + 3);
    world.sun.target.position.copy(c);
    world.sun.target.updateMatrixWorld();
    const sc = world.sun.shadow.camera;
    sc.left = -5; sc.right = 5; sc.top = 5; sc.bottom = -5; sc.near = 0.5; sc.far = 30;
    sc.updateProjectionMatrix();
  };
  const dioWorld = (p) => dio.localToWorld(p.clone());
  const project = (p) => { const v = p.clone().project(camera); return [(v.x * 0.5 + 0.5) * 1080, (-v.y * 0.5 + 0.5) * 1920]; };
  const dof = (focus, aperture = 0.02, maxblur = 0.01) => {
    post.bokeh.enabled = true;
    const u = post.bokeh.uniforms;
    u.focus.value = focus; u.aperture.value = aperture; u.maxblur.value = maxblur;
  };
  const silkLook = (t, { glow = 1, warm = 0, op = 1 } = {}) => {
    silk.group.visible = op > 0.001;
    for (const s of silk.sheets) { s.material.uniforms.uTime.value = t; s.material.uniforms.uOpacity.value = op; }
    for (const s of silk.blue) s.material.uniforms.uGlow.value = glow;
    silk.warm.material.uniforms.uGlow.value = warm;
  };
  const glowText = '0 0 30px rgba(90,150,255,0.85), 0 0 80px rgba(60,110,255,0.55), 0 6px 30px rgba(0,0,0,0.6)';
  const warmText = '0 0 30px rgba(255,170,90,0.85), 0 0 80px rgba(255,120,40,0.5), 0 6px 30px rgba(0,0,0,0.6)';
  const caps = (line, t) => OV.captions('cap-' + line, { t, at: VO_AT[line], words: capWords[line], dir: TX.dir, y: 1600 });
  const placePin = (pin, p, s, rotY = 0, squash = 1) => {
    pin.visible = true;
    pin.position.copy(p);
    pin.scale.set(s / Math.sqrt(squash), s * squash, s / Math.sqrt(squash));
    pin.rotation.set(0, rotY, 0);
  };
  const ringR = (a) => (a > 0 ? ease.outCubic(clamp(a / 1.6)) * 180 : -1);
  campus.buildings.children.forEach((b) => {
    const c = W2(b.userData.cx, b.userData.cy);
    const d = Math.hypot(c.x - COURT.x, c.z - COURT.z);
    let lo = 0, hi = 3;
    for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (ringR(m) < d) lo = m; else hi = m; }
    b.userData.waveAt = hi;
    b.userData.waveAmp = 5 / (1 + d / 50);
  });

  // screen sequence for the search scene
  const tapSearchT = T.search + 0.55;
  const typeT0 = tapSearchT + 0.3;
  const pickT = wt('search', S.search[1]) - 0.1;
  const typeStep = Math.min(0.2, (pickT - typeT0 - 0.3) / typeKeys.length);
  const seqSearch = [
    { at: 0, tex: screens['00_home'] },
    { at: tapSearchT + 0.15, tex: screens['01_focus'], mode: 0, dur: 0.25 },
    ...typeKeys.map((k, i) => ({ at: typeT0 + i * typeStep, tex: screens[k] })),
    { at: pickT + 0.25, tex: screens['03_route'], mode: 2, dur: 0.4 },
  ];
  const v3dTapT = wt('view3d', S.v3dTap) - 0.05;
  const seqV3d = [
    { at: 0, tex: screens['03_route'] },
    { at: v3dTapT + 0.2, tex: screens['04_3d_b'], mode: 2, dur: 0.5 },
    { at: VO_AT.view3d + vo.lines.view3d.dur - 1.0, tex: screens['05_photo'], mode: 0, dur: 0.35 },
  ];
  const phoneScreen = (p, list, t) => {
    let cur = 0;
    for (let i = 0; i < list.length; i++) if (t >= list[i].at) cur = i;
    const c = list[cur], prev = list[Math.max(0, cur - 1)];
    const k = c.dur ? clamp((t - c.at) / c.dur) : 1;
    if (cur > 0 && k < 1) p.show(prev.tex, c.tex, ease.inOutCubic(k), c.mode || 0);
    else p.show(c.tex);
  };

  // ---- frame ----------------------------------------------------------------------------
  function update(t) {
    for (const o of dyn) o.visible = false;
    OV.beginFrame();
    dio.visible = false;
    G.uNight.value = 0; G.uRing.value = 0; G.uWarm.value = 0; G.uRevealRadius.value = -1000; G.uGlowRadius.value = 1e5; G.uTime.value = t;
    world.set({ night: 0, fogNear: 1e5, fogFar: 2e5 });
    world.sky.visible = false;
    world.hemi.intensity = 0.9;
    warmKey.intensity = 0;
    const F = post.finish.uniforms;
    F.uFlash.value = 0; F.uFade.value = 1; F.uTime.value = t; F.uVignette.value = 0.45;
    post.bloom.strength = 0.85; post.bloom.radius = 0.7; post.bloom.threshold = 1.15;
    post.bokeh.enabled = false;
    phone.zoom(1); phone.tap(0, 0, -1);
    campus.buildings.children.forEach((b) => { b.position.y = 0; b.scale.y = 1; });
    campus.props.scale.y = 1;
    campus.edgeMat.color.set('#7d7568'); campus.edgeMat.opacity = 0.45;
    campus.lampGlows.forEach((g) => { g.visible = false; });
    silkLook(t);

    if (t < T.maze) sHook(t);
    else if (t < T.reveal) sMaze(t);
    else if (t < T.search) sReveal(t);
    else if (t < T.route) sSearch(t);
    else if (t < T.start) sRoute(t);
    else if (t < T.chips) sStart(t);
    else if (t < T.view3d) sChips(t);
    else if (t < T.langs) sView3d(t);
    else if (t < T.tagline) sLangs(t);
    else if (t < T.cta) sTagline(t);
    else if (t < T.end) sCta(t);
    else sEnd(t);

    if (ctx.captions) for (const line of ['maze', 'reveal', 'search', 'route', 'start', 'chips', 'view3d']) caps(line, t);
    OV.endFrame();
  }

  // 1 — where is my class? tags rush past in the dark light ------------------------------
  function sHook(t) {
    const k = t / T.maze;
    silkLook(t, { glow: 0.55 + 0.45 * ease.outQuad(clamp(t / 2.5)), op: ease.outQuad(clamp(t / 1.6)) });
    setCam(V(Math.sin(t * 0.3) * 0.4, wobble(t, 2, 0.15), lerp(2, -1, k)), V(0, 0, -20), 40, wobble(t, 3, 0.02));
    dof(9, 0.035, 0.012);
    const speed = 5.5;
    [...tags, ...qs].forEach((s, i) => {
      const z = -34 + (((t + 0.4) * speed + s.userData.ph) % 34);
      const p = s.userData.p;
      s.position.set(p.x * (1 + (z + 34) / 30), p.y * (1 + (z + 34) / 40), z);
      const fadeIn = clamp((t - 0.2 - (i % 6) * 0.15) / 0.6);
      const near = 1 - remap(z, -4, -1.5);
      showSprite(s, 1, fadeIn * near * clamp((z + 34) / 6) * (1 - remap(t, T.maze - 0.4, T.maze)));
    });
    dust.visible = true;
    dust.material.uniforms.uTime.value = t;
    dust.material.uniforms.uOpacity.value = 0.8;
    F().uFade.value = ease.outQuad(clamp(t / 0.9));
    F().uFlash.value = ease.inCubic(remap(t, T.maze - 0.25, T.maze)) * 0.7;
    OV.headline('hook', { t, tIn: wt('hook', -2) - 0.12, tOut: T.maze - 0.35, text: TX.hook, y: 760, size: 170 * HS, dir: TX.dir, style: 'slam', stagger: 0.12, accent: '#7fb6ff', shadow: glowText });
    OV.kicker('hookK', { t, tIn: VO_AT.hook, tOut: wt('hook', -2) - 0.3, text: TX.hookKicker, y: 860, size: 64, dir: TX.dir, color: '#cfe0ff', weight: 800 });
  }
  const F = () => post.finish.uniforms;

  // 2 — every corridor looks the same: dark diorama, paths that dead-end -----------------
  function sMaze(t) {
    const k = remap(t, T.maze, T.reveal);
    silkLook(t, { glow: 0.45 });
    G.uNight.value = 1;
    world.set({ night: 1, fogNear: 1e5, fogFar: 2e5 });
    world.sky.visible = false;
    campus.lampGlows.forEach((g) => { g.visible = true; g.material.opacity = 1; g.scale.setScalar(3.2); });
    const C = V(0, -0.3, -10);
    placeDio(C, lerp(-0.5, 0.25, ease.inOutQuad(k)), DS * lerp(0.9, 1.05, k), lerp(0.25, 0.35, k));
    setCam(V(0, lerp(4.5, 3.6, k), lerp(-1.5, -2.5, k)), C.clone().add(V(0, -0.4, 0)), 40);
    dof(9.5, 0.012, 0.008);
    const fadeAll = 1 - ease.inOutQuad(remap(t, T.reveal - 0.6, T.reveal - 0.1));
    mazeRoutes.forEach(({ r, x, cut }, i) => {
      const a = T.maze + 0.2 + i * 0.4;
      const p = ease.inOutQuad(remap(t, a, a + 1.5)) * cut;
      r.set(p, { time: t, opacity: fadeAll, headGlow: 0.7 });
      if (p >= cut - 0.001) {
        x.position.copy(r.pointAt(cut)).add(V(0, 5, 0));
        showSprite(x, spring(t, a + 1.5, { freq: 2.6, damp: 0.4 }), fadeAll);
      }
    });
    F().uFlash.value = 0.7 * (1 - clamp((t - T.maze) / 0.35));
    OV.headline('maze', { t, tIn: wt('maze', S.maze) - 0.1, tOut: T.reveal - 0.4, text: TX.maze, y: 230, size: 140 * HS, dir: TX.dir, style: 'rise', accent: '#ff6b6b', shadow: glowText });
  }

  // 3 — light converges into the pin, impact, the school comes alive, wordmark -----------
  function sReveal(t) {
    const TI = T.reveal + 1.5;
    const after = t - TI;
    const pre = remap(t, T.reveal, TI);
    const C = V(0, -0.6, -10);
    const orbitU = ease.inOutCubic(remap(t, TI, T.search));
    placeDio(C, lerp(0.25, 1.4, orbitU) + pre * 0.2, DS, lerp(0.42, 0.3, orbitU));
    const camZ = lerp(-1.8, 0.4, ease.inOutCubic(pre)) + (after > 0 ? -orbitU * 1.2 : 0);
    const shake = after > 0 ? 0.08 * Math.exp(-after * 4) : 0;
    setCam(V(Math.sin(t * 57) * shake, lerp(3.8, 2.6, pre) + Math.sin(t * 43) * shake, camZ), C.clone().add(V(0, 0.3, 0)), 40);
    // night until impact, then day
    const day = after > 0 ? ease.outCubic(clamp(after / 0.7)) : 0;
    G.uNight.value = 1 - day;
    world.set({ night: 1 - day, fogNear: 1e5, fogFar: 2e5 });
    world.sky.visible = false;
    campus.lampGlows.forEach((g) => { g.visible = day < 0.99; g.material.opacity = 1 - day; g.scale.setScalar(3.2); });
    silkLook(t, { glow: 0.5 + 1.6 * Math.exp(-Math.max(0, after) * 2.5) * (after > 0 ? 1 : pre * 0.4) });
    const pinPos = COURT.clone();
    const pinW = dioWorld(pinPos.clone().add(V(0, 20, 0)));
    // light streams in
    if (after < 0) {
      burstIn.visible = true;
      burstIn.material.uniforms.uOrigin.value.copy(pinW);
      burstIn.material.uniforms.uTime.value = Math.max(0.001, 1.35 * (1 - ease.inCubic(pre)));
      burstIn.material.uniforms.uOpacity.value = clamp(pre * 3);
    }
    if (after > 0) {
      const sq = 1 - 0.3 * Math.exp(-after * 7) * Math.cos(after * 24);
      placePin(pinBig, pinPos, 12 * ease.outBack(clamp(after / 0.35)), after * 0.8, sq);
      burstOut.visible = true;
      burstOut.material.uniforms.uOrigin.value.copy(pinW);
      burstOut.material.uniforms.uTime.value = after;
      ringAt(ringA, COURT, ringR(after), 1 - clamp(after / 1.6), 0.04);
      campus.buildings.children.forEach((b) => {
        const a = after - b.userData.waveAt;
        if (a > 0) b.position.y = b.userData.waveAmp * Math.exp(-a * 3.5) * Math.sin(a * 14);
      });
      F().uFlash.value = 0.75 * (1 - clamp(after / 0.4));
    } else {
      // glowing core forming
      F().uFlash.value = ease.inQuad(remap(t, TI - 0.12, TI)) * 0.5;
    }
    dust.visible = true;
    dust.material.uniforms.uTime.value = t;
    dust.material.uniforms.uOpacity.value = 0.6;
    // wordmark
    const tl = wt('reveal', S.revealLogo) - 0.2;
    const out = ease.inCubic(remap(t, T.search - 0.5, T.search - 0.05));
    if (t > tl) {
      logo.face.color.set('#8fa6d8');
      logo.face.envMapIntensity = 0.45;
      logo.side.color.set('#1d4ed8');
      logo.group.visible = true;
      logo.group.scale.setScalar(2.6 / logo.group.userData.width);
      logo.group.position.set(0, 1.55 + out * 0.6, -8);
      logo.group.rotation.set(0.05, wobble(t, 7, 0.08), 0);
      logo.letters.forEach((l, i) => {
        const a = tl + i * 0.05;
        const p = ease.outExpo(clamp((t - a) / 0.8));
        l.position.copy(l.userData.home).add(V(0, (1 - p) * -1.0, (1 - p) * -7 + out * 6));
        l.rotation.set((1 - p) * -1.2, (1 - p) * 1.0, 0);
        l.scale.setScalar(Math.max(0.001, spring(t, a, { freq: 1.8, damp: 0.55 }) * (1 - out)));
      });
      const sw = remap(t, tl + 0.8, tl + 1.8);
      if (sw > 0 && sw < 1) { sweep.visible = true; sweep.intensity = 14 * Math.sin(sw * Math.PI); sweep.position.set(lerp(-3, 3, sw), 2.0, -6); }
    }
    OV.kicker('revealSub', { t, tIn: wt('reveal', S.revealSub) - 0.05, tOut: T.search - 0.5, html: `<span>${TX.revealSub}</span>`, pill: true, y: 600, size: 50, dir: TX.dir, color: '#0b1220', weight: 800 });
  }

  // 4 — the phone glides through the light; UI pops out as 3D glass --------------------------
  function sSearch(t) {
    silkLook(t, { glow: 0.9 });
    setCam(V(Math.sin(t * 0.4) * 0.15, 0, 0), V(0, 0, -10), 38);
    dof(3.3, 0.02, 0.01);
    dust.visible = true; dust.material.uniforms.uTime.value = t; dust.material.uniforms.uOpacity.value = 0.6;
    const s = spring(t, T.search - 0.1, { freq: 1.5, damp: 0.66 });
    const dive = ease.inCubic(remap(t, T.route - 0.55, T.route));
    phone.group.visible = true;
    phone.group.position.set(0.22 * (rtl ? -1 : 1), -0.25 - (1 - s) * 2.6, -3.4 + dive * 2.4);
    phone.group.rotation.set((1 - s) * 1.0 + Math.sin(t * 0.8) * 0.03, (rtl ? 0.28 : -0.28) + (1 - s) * 0.8 + Math.sin(t * 0.6) * 0.05, (1 - s) * -0.3);
    phone.uniforms.uSheen.value = 0.1 + remap(t, T.search, T.route) * 0.8;
    phoneScreen(phone, seqSearch, t);
    phone.tap(195, 812, t - tapSearchT);
    if (t > pickT - 0.05) phone.tap(195, 716, t - pickT);
    phone.zoom(1 + dive * 0.9, 200, 330);
    // glass search bar pops out of the screen
    camera.updateMatrixWorld(true);
    phone.group.updateMatrixWorld(true);
    const popA = spring(t, tapSearchT + 0.1, { freq: 1.8, damp: 0.6 });
    const nTyped = clamp(Math.floor((t - typeT0) / typeStep) + 1, 0, typeKeys.length);
    const sc = searchCards[t < typeT0 ? 0 : nTyped];
    if (popA > 0.001 && t < pickT + 0.4) {
      sc.visible = true;
      const from = V(0, -0.36, 0.05).applyMatrix4(phone.group.matrix);
      const to = V(-0.05 * (rtl ? -1 : 1), 0.32, -2.7);
      sc.position.copy(from).lerp(to, popA);
      sc.rotation.set(0.12 * (1 - popA), (rtl ? 0.2 : -0.2) * popA, 0);
      sc.scale.setScalar(Math.max(0.001, lerp(0.55, 1, popA) * (1 - ease.inCubic(remap(t, pickT + 0.1, pickT + 0.4)))));
    }
    const popB = spring(t, pickT + 0.15, { freq: 1.7, damp: 0.6 });
    if (popB > 0.001) {
      resultCard.visible = true;
      resultCard.position.set(lerp(0.2, -0.05, popB) * (rtl ? -1 : 1), lerp(-0.6, 0.36, popB), lerp(-3.2, -2.6, popB));
      resultCard.rotation.set(0.1 * (1 - popB), (rtl ? 0.22 : -0.22), 0);
      resultCard.scale.setScalar(Math.max(0.001, popB * (1 - dive)));
    }
    F().uFlash.value = ease.inQuad(remap(t, T.route - 0.25, T.route)) * 0.9;
    const ins = S.search.map((i) => (i == null ? null : wt('search', i) - 0.05));
    TX.search.forEach((w, i) => {
      OV.headline('search' + i, { t, tIn: ins[i], tOut: i < 2 ? ins[i + 1] - 0.12 : T.route - 0.4, text: w, y: 170, size: 134 * HS, dir: TX.dir, style: 'pop', accent: '#ffb23d', shadow: glowText });
    });
  }

  // 5 — dive in: the floating school, the route draws itself --------------------------------
  function sRoute(t) {
    silkLook(t, { glow: 0.7, warm: 0.6 * envelope(t, T.route, T.start, 1.0, 0.8) });
    const C = V(0, -0.5, -10);
    const k = remap(t, T.route, T.start);
    const riseT0 = T.route + 0.2;
    const entPx = routesJson.entrance;
    campus.buildings.children.forEach((b) => { b.scale.y = Math.max(0.015, spring(t, riseT0 + Math.hypot(b.userData.cx - entPx[0], b.userData.cy - entPx[1]) * 0.0011, { freq: 1.5, damp: 0.5 })); });
    campus.props.scale.y = Math.max(0.015, spring(t, riseT0 + 0.35, { freq: 1.4, damp: 0.55 }));
    placeDio(C, lerp(-0.2, 0.55, ease.inOutCubic(k)), DS * 1.15, lerp(0.95, 0.5, ease.inOutCubic(remap(t, T.route, T.route + 2))));
    setCam(V(0, lerp(4.6, 3.2, ease.inOutCubic(k)), lerp(-6, -1.6, ease.inOutCubic(remap(t, T.route, T.route + 1.6)))), C.clone().add(V(0, -0.2, 0)), 40);
    F().uFlash.value = 0.9 * (1 - ease.outCubic(clamp((t - T.route) / 0.45)));
    const hk = envelope(t, riseT0 - 0.1, riseT0 + 2.6, 0.25, 0.9);
    if (hk > 0) {
      holo.visible = true;
      holo.material.uniforms.uCenter.value.set(ENT.x, ENT.z);
      holo.material.uniforms.uR.value = Math.max(0, t - riseT0) * 98;
      holo.material.uniforms.uOpacity.value = hk;
      campus.edgeMat.color.setRGB(lerp(0.49, 1.2, hk), lerp(0.46, 3.2, hk), lerp(0.41, 4.0, hk));
      campus.edgeMat.opacity = lerp(0.45, 1, hk);
    }
    const dStart = T.route + 1.2, dEnd = T.route + 4.4;
    const u = ease.inOutCubic(remap(t, dStart, dEnd));
    routeD.set(u, { time: t });
    trailD.visible = u > 0.001;
    trailD.material.uniforms.uHead.value = u; trailD.material.uniforms.uTime.value = t;
    trailD.material.uniforms.uOpacity.value = 1 - remap(t, dEnd, dEnd + 1.2);
    entDot.visible = true; entDot.position.copy(ENT); entDot.scale.setScalar(3.5 * spring(t, T.route + 0.8, { freq: 2, damp: 0.5 }));
    const pinT = dEnd - 0.1;
    if (t > pinT) {
      const f = clamp((t - pinT) / 0.3);
      const after = t - pinT - 0.3;
      const sq = after > 0 ? 1 - 0.25 * Math.exp(-after * 7) * Math.cos(after * 24) : 1;
      placePin(pinDest, DOL.clone().add(V(0, ROOF + lerp(60, 0, ease.inQuad(f)), 0)), 4.2, t * 0.6, sq);
      if (after > 0) {
        ringAt(ringB, DOL.clone().add(V(0, ROOF, 0)), lerp(2, 30, ease.outCubic(clamp(after / 1.0))), 1 - clamp(after / 1.0), 0.1);
        burstDest.visible = true;
        burstDest.material.uniforms.uOrigin.value.copy(DOL).add(V(0, ROOF + 1, 0));
        burstDest.material.uniforms.uTime.value = after;
        pillar.visible = true;
        pillar.position.copy(DOL).add(V(0, ROOF, 0));
        pillar.scale.set(1, Math.max(0.001, ease.outCubic(clamp(after / 0.9))), 1);
        pillar.material.uniforms.uOpacity.value = 0.8;
        pillar.material.uniforms.uTime.value = t;
      }
    }
    OV.routeCard('rc', { t, tIn: dStart + 0.1, tOut: T.start - 0.35, title: TX.room, meta: TX.routeMeta(Math.round(110 * u)), dir: TX.dir, y: 1300 });
  }

  // 6 — start where you are ----------------------------------------------------------------
  function sStart(t) {
    silkLook(t, { glow: 0.7, warm: 0.3 });
    const C = V(0, -0.6, -10);
    const k = remap(t, T.start, T.chips);
    placeDio(C, lerp(0.55, 0.95, ease.inOutQuad(k)), DS * 1.25, lerp(0.75, 0.85, k));
    setCam(V(0, 4.2, -2.4), C.clone().add(V(0, -0.3, -0.3)), 40);
    const tapT = wt('start', S.startTap) + 0.25;
    const rT = wt('start', S.startRoute);
    placePin(pinDest, DOL.clone().add(V(0, ROOF + Math.sin(t * 1.8) * 0.6, 0)), 4.2, t * 0.6);
    pillar.visible = true; pillar.position.copy(DOL).add(V(0, ROOF, 0)); pillar.scale.set(1, 1, 1);
    pillar.material.uniforms.uOpacity.value = 0.8 * (1 - remap(t, T.chips - 0.8, T.chips)); pillar.material.uniforms.uTime.value = t;
    const oldOp = 1 - clamp((t - tapT) / 0.5);
    routeD.set(1, { time: t, opacity: oldOp });
    entDot.visible = oldOp > 0.01; entDot.position.copy(ENT); entDot.scale.setScalar(3.5 * oldOp);
    camera.updateMatrixWorld(true);
    const [px, py] = project(dioWorld(HERE));
    OV.pointer('ptr', { t, x: px, y: py, tIn: tapT - 1.0, press: tapT, tOut: tapT + 0.9 });
    tapRings.forEach((r, i) => { const a = t - tapT - i * 0.18; if (a > 0) ringAt(r, HERE, lerp(2, 26, ease.outCubic(clamp(a / 0.9))), 1 - clamp(a / 0.9), 0.12); });
    if (t > tapT) {
      hereDot.visible = true; hereDot.position.copy(HERE);
      hereDot.scale.setScalar(3.6 * spring(t, tapT, { freq: 2.4, damp: 0.45 }));
      hereDot.userData.halo.scale.setScalar(1.5 + (Math.sin(t * 4) * 0.5 + 0.5) * 1.6);
    }
    const uc = ease.inOutCubic(remap(t, rT, rT + 1.9));
    routeC.set(uc, { time: t });
    trailC.visible = uc > 0.001;
    trailC.material.uniforms.uHead.value = uc; trailC.material.uniforms.uTime.value = t;
    trailC.material.uniforms.uOpacity.value = 1 - remap(t, rT + 1.9, rT + 3.0);
    OV.headline('start', { t, tIn: wt('start', S.startHead) - 0.15, tOut: T.chips - 0.35, text: TX.start, y: 170, size: 128 * HS, dir: TX.dir, style: 'rise', accent: '#7fb6ff', shadow: glowText });
    OV.tagAt('here', { t, tIn: tapT + 0.25, tOut: T.chips - 0.4, x: px, y: py - 150, text: TX.here, on: true });
  }

  // 7 — glossy 3D icons for toilets / office / safe room ------------------------------------
  function sChips(t) {
    silkLook(t, { glow: 0.85 });
    setCam(V(0, 0, 0), V(0, 0, -10), 38);
    dof(3.6, 0.018, 0.01);
    dust.visible = true; dust.material.uniforms.uTime.value = t; dust.material.uniforms.uOpacity.value = 0.6;
    const pressT = wt('chips', S.chipPress);
    const out = ease.inCubic(remap(t, T.view3d - 0.45, T.view3d));
    tiles.forEach((tile, i) => {
      const a = wt('chips', S.chips[i]) - 0.1;
      const s = spring(t, a, { freq: 1.8, damp: 0.5 });
      if (s <= 0.001) return;
      tile.visible = true;
      const y = 0.78 - i * 0.78;
      const sel = i === 0 && t > pressT;
      const dim = t > pressT && !sel ? 1 - clamp((t - pressT) / 0.4) : 1;
      const press = sel ? 1 - 0.12 * Math.sin(clamp((t - pressT) / 0.25) * Math.PI) : 1;
      tile.position.set((rtl ? 0.4 : -0.4) + (1 - s) * (rtl ? 2.5 : -2.5) + out * (rtl ? 3 : -3), y - out * 0.5, -3.6);
      tile.rotation.set(0.25 * Math.sin(t * 0.9 + i), (1 - s) * 3.0 + Math.sin(t * 0.7 + i) * 0.25 + (rtl ? -0.35 : 0.35), 0);
      tile.scale.setScalar(Math.max(0.001, s * press * dim));
      const card = tileCards[i];
      card.visible = true;
      card.position.set((rtl ? -0.2 : 0.2) + (1 - s) * (rtl ? -2.5 : 2.5) + out * (rtl ? -3 : 3), y, -3.6);
      card.rotation.set(0, rtl ? 0.25 : -0.25, 0);
      card.material.opacity = clamp((t - a) / 0.3) * dim;
      card.scale.setScalar(Math.max(0.001, s));
    });
    // after the tap: route to the nearest toilet on the floating school
    if (t > pressT) {
      const k = ease.inOutCubic(remap(t, pressT + 0.1, pressT + 0.8));
      const C = V(0, lerp(-6, -0.7, k), -11);
      placeDio(C, 0.7 + (t - pressT) * 0.15, DS * 1.3, 0.7);
      const ut = ease.inOutCubic(remap(t, pressT + 0.5, pressT + 1.6));
      routeT.set(ut, { time: t });
      trailT.visible = ut > 0.001;
      trailT.material.uniforms.uHead.value = ut; trailT.material.uniforms.uTime.value = t;
      hereDot.visible = true; hereDot.position.copy(HERE); hereDot.scale.setScalar(3.6);
    }
  }

  // 8 — 3D view + photo carousel orbiting the phone -------------------------------------------
  function sView3d(t) {
    silkLook(t, { glow: 0.85, warm: 0.3 });
    setCam(V(0, 0, 0), V(0, 0, -10), 38);
    dof(3.4, 0.02, 0.01);
    const k = remap(t, T.view3d, T.langs);
    const s = spring(t, T.view3d, { freq: 1.3, damp: 0.6 });
    const cardsT = wt('view3d', S.v3dCards) - 0.1;
    const out = ease.inCubic(remap(t, T.langs - 0.45, T.langs));
    phone.group.visible = true;
    phone.group.position.set((1 - s) * 2.6 - out * 2.6, -0.12, -3.5);
    phone.group.rotation.set(0.04 + Math.sin(t * 0.7) * 0.02, -0.15 + (1 - s) * 0.9 + Math.sin(t * 0.5) * 0.08 - out * 0.6, (1 - s) * 0.12);
    phone.uniforms.uSheen.value = 0.2 + k;
    phoneScreen(phone, seqV3d, t);
    phone.tap(38, 459, t - v3dTapT);
    const base = (t - cardsT) * 0.35;
    cards.forEach((c, i) => {
      const sp = spring(t, cardsT + i * 0.12, { freq: 1.6, damp: 0.6 });
      if (sp <= 0.001) return;
      c.visible = true;
      const th = base + (i / cards.length) * Math.PI * 2;
      const ring = V(Math.sin(th) * 1.35, -0.12 + Math.sin(th * 2 + i) * 0.25 + (i % 2 ? 0.36 : -0.32), -3.8 + Math.cos(th) * 0.95);
      c.position.copy(V(0, -0.14, -3.8).lerp(ring, sp)).add(V(-out * 2.6, 0, 0));
      c.scale.setScalar(Math.max(0.001, sp));
      c.lookAt(0, 0, 0.6);
      c.rotateZ(Math.sin(th) * 0.06);
    });
    OV.headline('v3d', { t, tIn: wt('view3d', S.v3dTap) - 0.1, tOut: T.langs - 0.4, text: TX.view3d, y: 170, size: 124 * HS, dir: TX.dir, style: 'rise', accent: '#ffb35a', shadow: glowText });
  }

  // 9 — three languages ----------------------------------------------------------------------
  function sLangs(t) {
    silkLook(t, { glow: 0.85 });
    setCam(V(0, 0, 0), V(0, 0, -10), 38);
    dof(3.7, 0.016, 0.008);
    const order = rtl ? [1, 0, -1] : [-1, 0, 1];
    const out = ease.inCubic(remap(t, T.tagline - 0.35, T.tagline));
    ['he', 'ru', 'en'].forEach((l, i) => {
      const p = langPhones[i];
      const a = wt('langs', S.langs[i]) - 0.12;
      const s = spring(t, a, { freq: 1.6, damp: 0.55 });
      if (s <= 0.001) return;
      p.group.visible = true;
      const x = order[i] * 0.48;
      p.group.position.set(x, 0.05 - (1 - s) * 2.2 + out * 2.5, -3.6 - Math.abs(order[i]) * 0.25);
      p.group.rotation.set((1 - s) * 0.8 + 0.04, -order[i] * 0.32 + Math.sin(t * 0.7 + i) * 0.04, (1 - s) * 0.2 * order[i]);
      p.group.scale.setScalar(0.6);
      p.show(homes[l]);
      camera.updateMatrixWorld(true);
      p.group.updateMatrixWorld(true);
      const [lx, ly] = project(V(0, -0.82, 0.1).applyMatrix4(p.group.matrixWorld));
      OV.tagAt('lang' + i, { t, tIn: a + 0.15, tOut: T.tagline - 0.35, x: lx, y: ly + 10, text: TX.langs[i], on: i === 0 });
    });
  }

  // 10 — tagline over a warm flare of light, the school glowing far below ---------------------
  function sTagline(t) {
    const k = remap(t, T.tagline, T.cta);
    silkLook(t, { glow: 0.6, warm: 0.4 + 0.9 * ease.inOutQuad(clamp((t - T.tagline) / 1.2)) });
    G.uWarm.value = 1;
    world.set({ night: 0, warm: 1, fogNear: 1e5, fogFar: 2e5 });
    world.sky.visible = false;
    const C = V(0, -2.2, -12);
    placeDio(C, 0.4 + k * 0.6, DS * 1.1, 0.55);
    routeD.set(1, { time: t });
    placePin(pinDest, DOL.clone().add(V(0, ROOF + Math.sin(t * 1.8) * 0.6, 0)), 4.2, t * 0.6);
    pillar.visible = true; pillar.position.copy(DOL).add(V(0, ROOF, 0)); pillar.scale.set(1, 1, 1);
    pillar.material.uniforms.uOpacity.value = 0.9; pillar.material.uniforms.uTime.value = t;
    setCam(V(0, lerp(1.2, 2.0, k), lerp(1.5, 0.5, k)), V(0, -0.8, -10), 40);
    dustWarm.visible = true; dustWarm.material.uniforms.uTime.value = t; dustWarm.material.uniforms.uOpacity.value = 0.9;
    const [l1, l2] = TX.tagline.split('|');
    OV.kicker('tagLogo', { t, tIn: wt('tagline', 0) - 0.05, tOut: T.cta - 0.3, html: '<span class="logo-word" style="font-size:100px;text-shadow:0 0 40px rgba(255,170,90,0.8)">BEGIN MAP</span>', y: 230, size: 100, dir: 'ltr', color: '#fff' });
    OV.headline('tag1', { t, tIn: wt('tagline', S.tag1) - 0.08, tOut: T.cta - 0.3, text: l1, y: 420, size: 150 * HS, dir: TX.dir, style: 'rise', shadow: warmText });
    OV.headline('tag2', { t, tIn: wt('tagline', S.tag2) - 0.08, tOut: T.cta - 0.3, text: l2, y: 590, size: 150 * HS, dir: TX.dir, style: 'rise', accent: '#ffd24a', shadow: warmText });
  }

  // 11 — call to action ----------------------------------------------------------------------
  function sCta(t) {
    silkLook(t, { glow: 0.8, warm: 0.5 });
    setCam(V(0, 0, 0), V(0, 0, -10), 38);
    dof(3.6, 0.012, 0.006);
    const sp = spring(t, T.cta + 0.1, { freq: 1.3, damp: 0.6 });
    const sq = spring(t, T.cta + 0.35, { freq: 1.3, damp: 0.6 });
    const out = ease.inCubic(remap(t, T.end - 0.4, T.end));
    phone.group.visible = true;
    phone.group.position.set(rtl ? -0.27 : 0.27, -0.2 - (1 - sp) * 2.4 - out * 2.5, -3.7);
    phone.group.scale.setScalar(0.92);
    phone.group.rotation.set(0.05, (rtl ? 0.3 : -0.3) + Math.sin(t * 0.6) * 0.04, 0);
    phone.show(screens['04_3d_b']);
    qr.visible = true;
    qr.position.set(rtl ? 0.3 : -0.3, -0.16 - (1 - sq) * 2.4 - out * 2.5, -3.2);
    qr.rotation.set(0.03, (rtl ? -0.22 : 0.22) + Math.sin(t * 0.7) * 0.04, 0);
    qr.scale.setScalar(0.6);
    OV.headline('cta', { t, tIn: T.cta + 0.3, tOut: T.end - 0.35, text: TX.cta, y: 230, size: 140 * HS, dir: TX.dir, style: 'pop', accent: '#ffd24a', shadow: glowText });
    OV.kicker('ctaSub', { t, tIn: wt('cta', S.ctaSub) - 0.05, tOut: T.end - 0.35, text: TX.ctaSub, y: 410, size: 56, dir: TX.dir, color: '#ffffff', weight: 800 });
  }

  // 12 — end card: the glowing mark, like a light sculpture -------------------------------------
  function sEnd(t) {
    const k = t - T.end;
    silkLook(t, { glow: 0.9 + 0.6 * Math.exp(-k * 2), warm: 0.25 });
    setCam(V(0, 0, 0), V(0, 0, -10), 38);
    world.hemi.intensity = 0.55;
    const sp = spring(t, T.end + 0.05, { freq: 1.4, damp: 0.55 });
    endPin.visible = true;
    endPin.position.set(0, 0.42 + (1 - sp) * -1.5 + Math.sin(k * 1.6) * 0.04, -7);
    endPin.scale.setScalar(0.36 * Math.max(0.001, sp));
    endPin.rotation.set(0, k * 0.9 - 0.4, 0);
    logo.group.visible = true;
    logo.face.color.set('#8fa6d8');
    logo.face.envMapIntensity = 0.45;
    logo.side.color.set('#1d4ed8');
    logo.group.scale.setScalar(2.25 / logo.group.userData.width);
    logo.group.position.set(0, 0.06, -7);
    logo.group.rotation.set(0.05, Math.sin(k * 0.8) * 0.08, 0);
    logo.letters.forEach((l, i) => {
      const a = T.end + 0.2 + i * 0.045;
      const p = ease.outExpo(clamp((t - a) / 0.7));
      l.position.copy(l.userData.home).add(V(0, (1 - p) * -0.8, (1 - p) * -3));
      l.rotation.set((1 - p) * -1.0, 0, 0);
      l.scale.setScalar(Math.max(0.001, p));
    });
    const sw = remap(t, T.end + 0.9, T.end + 2.0);
    if (sw > 0 && sw < 1) { sweep.visible = true; sweep.intensity = 14 * Math.sin(sw * Math.PI); sweep.position.set(lerp(-3.2, 3.2, ease.inOutQuad(sw)), 0.4, -5.2); }
    dust.visible = true; dust.material.uniforms.uTime.value = t; dust.material.uniforms.uOpacity.value = 0.7;
    OV.block('endSub', { t, tIn: T.end + 0.8, html: `<div class="small" style="direction:${TX.dir};font-size:46px;color:rgba(255,255,255,0.85)">${TX.endSub}</div>`, y: 1060 });
    OV.block('endUrl', { t, tIn: T.end + 1.0, html: '<div class="url">beginmap.github.io/begin-nav</div>', y: 1150 });
    OV.block('credits', { t, tIn: T.end + 1.3, html: `<div class="credits"><span class="lbl" style="direction:${TX.dir}">${TX.creditsLabel}</span>@david.ik. &nbsp;·&nbsp; @liamna01_</div>`, y: 1370 });
    OV.block('idea', { t, tIn: T.end + 1.55, html: `<div class="credits" style="font-size:42px"><span class="lbl" style="direction:${TX.dir}">${TX.ideaLabel}</span>@amitbiton24</div>`, y: 1560 });
    F().uFade.value = 1 - ease.inQuad(remap(t, T.total - 0.8, T.total));
  }

  // cue sheet for the sound design
  const cues = {
    edit: 'silk', T, voAt: VO_AT,
    voDur: Object.fromEntries(Object.keys(vo.lines).map((k) => [k, vo.lines[k].dur])),
    bell: null,
    hookSlam: wt('hook', -2) - 0.12,
    whip1: T.maze - 0.3,
    mazeStarts: mazeRoutes.map((m, i) => T.maze + 0.2 + i * 0.4),
    mazeX: mazeRoutes.map((m, i) => T.maze + 0.2 + i * 0.4 + 1.5),
    pinFall: T.reveal + 0.3,
    impact: T.reveal + 1.5,
    logoIn: wt('reveal', S.revealLogo) - 0.2,
    revealSub: wt('reveal', S.revealSub) - 0.05,
    phoneIn: T.search,
    tapSearch: tapSearchT,
    typing: seqSearch.filter((x, i) => i >= 2 && i < seqSearch.length - 1).map((x) => x.at),
    pick: pickT,
    dive: T.route - 0.55,
    flash: T.route,
    rise: T.route + 0.2,
    routeDraw: [T.route + 1.2, T.route + 4.4],
    pinArrive: T.route + 4.4 - 0.1 + 0.3,
    startTap: wt('start', S.startTap) + 0.25,
    startRoute: wt('start', S.startRoute),
    chips: S.chips.map((i) => wt('chips', i) - 0.1),
    chipPress: wt('chips', S.chipPress),
    toiletRoute: wt('chips', S.chipPress) + 0.5,
    v3dIn: T.view3d,
    v3dTap: v3dTapT,
    cards: cards.map((c, i) => wt('view3d', S.v3dCards) - 0.1 + i * 0.12),
    langs: S.langs.map((i) => wt('langs', i) - 0.12),
    tagline: T.tagline, tag1: wt('tagline', S.tag1) - 0.08, tag2: wt('tagline', S.tag2) - 0.08,
    cta: T.cta, end: T.end, total: T.total,
  };
  return { update, cues };
}
