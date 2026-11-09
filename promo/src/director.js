import * as THREE from 'three';
import { G } from './lib/grade.js';
import { clamp, lerp, remap, ease, spring, envelope, wobble, rng, px2w } from './lib/util.js';
import { roomTag, questionBubble, badge, glowSprite, xMark, iconCanvas } from './lib/labels.js';
import { makePin, makeRing } from './lib/pin.js';
import { makeRoute, makeHereDot } from './lib/route.js';
import { makePhone } from './lib/phone.js';
import { photoCard, qrCard, labelCard } from './lib/cards.js';
import { makeLogo3D } from './lib/logo3d.js';
import * as OV from './lib/overlay.js';
import { TEXT, PHOTOS, EDITS } from './text.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const W2 = (x, y) => { const [X, Z] = px2w(x, y); return V(X, 0, Z); };

// Everything on screen is a pure function of time t (seconds).
export async function createDirector(ctx) {
  const { scene, camera, world, post, campus, envMap, lang, screens, homes, vo, rooms, routesJson } = ctx;
  const TX = TEXT[lang];
  const EDIT = ctx.edit === '30' ? '30' : 'full';
  const { T, VO_AT } = EDITS[EDIT];
  const S = EDIT === '30' ? TX.sync30 : TX.sync;
  const hasStart = T.chips > T.start;
  const kH = T.maze / 8; // hook time scale (1 for the full cut)
  const rtl = TX.dir === 'rtl';
  const HS = TX.hScale || 1;
  scene.add(camera);

  // ---- timing helpers -------------------------------------------------------
  const words = (line) => vo.lines[line].words;
  const wt = (line, k) => {
    if (!vo.lines[line] || k == null) return null;
    const w = words(line);
    return VO_AT[line] + w[k < 0 ? w.length + k : Math.min(k, w.length - 1)].t0;
  };
  const lineEnd = (line) => (vo.lines[line] ? VO_AT[line] + vo.lines[line].dur : null);

  // caption words with brand merges / replacements
  const capWords = {};
  for (const line of Object.keys(vo.lines)) {
    let ws = words(line).map((w) => ({ ...w, w: TX.capReplace[w.w] || w.w }));
    for (const [a, b, rep] of TX.capMerge) {
      for (let i = 0; i < ws.length - 1; i++) {
        if (ws[i].w.replace(/[.,]/g, '') === a && ws[i + 1].w.replace(/[.,]/g, '') === b) {
          ws.splice(i, 2, { w: rep, t0: ws[i].t0, t1: ws[i + 1].t1 });
        }
      }
    }
    capWords[line] = ws;
  }

  // ---- key places -------------------------------------------------------------
  const room = (id) => rooms.find((r) => r.id === id);
  const ENT = W2(...routesJson.entrance);
  const COURT = W2(926, 1002);
  const DOL = W2(room('dolphin').x, room('dolphin').y);
  const HERE = W2(...routesJson.fromCourt.start);
  const ROOF = 3.8;

  // ---- objects ----------------------------------------------------------------
  const dyn = []; // hidden at the start of every frame
  const add = (o, parent = scene) => { parent.add(o); dyn.push(o); return o; };

  const pin = add(makePin(envMap));
  const pinShadow = add(pin.userData.shadow);
  const impactRing = add(makeRing('#5b9bff'));
  const arriveRing = add(makeRing('#ff9a3c'));
  const tapRings = [add(makeRing('#ffffff')), add(makeRing('#ffffff'))];
  const beam = add(new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 1.1, 140, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: '#7fb0ff', transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })
  ));

  const hookIds = ['dolphin', 'tochnit', 'halil', 'zaharon', 'solit', 'shonit', 'marganit', 'tzvoni', 'hatzav', 'narkis', 'almogit', 'pazit'];
  const hookTags = hookIds.map((id, i) => {
    const r = room(id);
    const s = add(roomTag(r.names[lang] || r.names.he, { rtl, size: 1.0 }));
    s.userData.base = W2(r.x, r.y).add(V(0, 5 + (i % 3) * 1.5, 0));
    return s;
  });
  const R = rng(5);
  const hookQ = Array.from({ length: 7 }, (_, i) => {
    const s = add(questionBubble(0.62));
    const tag = hookTags[(i * 5 + 2) % hookTags.length];
    s.userData.base = tag.userData.base.clone().add(V((R() - 0.5) * 4, 2.2 + R() * 1.5, 0));
    return s;
  });
  const mazeRoutes = routesJson.maze.map((m) => {
    const r = makeRoute(m.pts, { color: '#a9c8ff', radius: 0.38, y: 0.5 });
    add(r.group);
    const x = add(xMark(1.25));
    return { r, x, cut: m.cut };
  });
  const mazeQ = Array.from({ length: 9 }, (_, i) => {
    const s = add(questionBubble(1.15));
    const cand = rooms.filter((r) => r.category === 'classroom');
    const r = cand[(i * 7 + 3) % cand.length];
    s.userData.base = W2(r.x, r.y).add(V(0, 9 + R() * 4, 0));
    return s;
  });

  const routeD = makeRoute(routesJson.dolphin.pts);
  add(routeD.group);
  const routeC = makeRoute(routesJson.fromCourt.pts);
  add(routeC.group);
  const routeT = makeRoute(routesJson.courtToilet.pts, { color: '#22a6f2' });
  add(routeT.group);
  const hereDot = add(makeHereDot());
  const entDot = add(makeHereDot());
  const destTag = add(roomTag(TX.room, { rtl, size: 1.35 }));
  const hereTag = add(roomTag(TX.here, { rtl, size: 1.2, dark: false }));

  const badgeSets = { wc: [], office: [], shelter: [] };
  const beamGeo = new THREE.CylinderGeometry(0.12, 0.12, 1, 8, 1, true);
  beamGeo.translate(0, 0.5, 0);
  const mkBadge = (kind, r) => {
    const b = add(badge(kind, 1.9));
    const p = W2(r.x, r.y);
    b.userData.base = p.clone().add(V(0, 12, 0));
    const bm = add(new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: kind === 'shelter' ? '#ff9a3c' : '#7fb8ff', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })));
    bm.position.copy(p);
    b.userData.beam = bm;
    b.userData.id = r.id;
    badgeSets[kind].push(b);
  };
  rooms.filter((r) => r.category === 'toilets').forEach((r) => mkBadge('wc', r));
  rooms.filter((r) => r.category === 'office' && /secretary|manager|office|deputy/.test(r.id)).forEach((r) => mkBadge('office', r));
  rooms.filter((r) => r.category === 'shelter').forEach((r) => mkBadge('shelter', r));
  const dist2 = (b) => b.userData.base.distanceTo(HERE);
  for (const k of Object.keys(badgeSets)) badgeSets[k].sort((a, b) => dist2(a) - dist2(b));

  // camera-space props
  const phone = makePhone(envMap);
  add(phone.group, camera);
  const langPhones = ['he', 'ru', 'en'].map(() => { const p = makePhone(envMap); add(p.group, camera); return p; });
  const langCards = TX.langs.map((n, i) => add(labelCard(n, envMap, { w: 0.62, rtl: i === 0 }), camera));
  const cards = [];
  for (let i = 0; i < PHOTOS.length; i++) cards.push(add(await photoCard('../../' + PHOTOS[i], envMap, { w: 0.82, caption: TX.photoCaptions[i], rtl }), camera));
  const qr = add(await qrCard(envMap, { title: TX.qrTitle }), camera);
  const logo = await makeLogo3D(envMap);
  add(logo.group, camera);
  const endPin = add(makePin(envMap), camera);

  for (const o of [phone.group, ...langPhones.map((p) => p.group), ...langCards, ...cards, qr, logo.group, endPin]) {
    o.traverse((c) => { c.castShadow = false; c.receiveShadow = false; });
  }

  const iconURL = (k) => iconCanvas(k, 128).toDataURL();
  const chipItems = TX.chips.map((text, i) => ({ text, icon: iconURL(['wc', 'office', 'shelter'][i]) }));

  // ---- helpers ---------------------------------------------------------------
  const setCam = (pos, look, fov = 38, roll = 0) => {
    camera.position.copy(pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(look);
    if (roll) camera.rotateZ(roll);
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld(true);
  };
  const orbit = (c, ang, r, h) => V(c.x + Math.sin(ang) * r, c.y + h, c.z + Math.cos(ang) * r);
  // continuity: start a scene from where the previous camera ended, then ease into the new move
  const ENDPOSE = {
    reveal: () => ({ pos: orbit(COURT, 1.35, 66, 40), look: COURT.clone().add(V(0, 0, -8)) }),
    route: () => ({ pos: DOL.clone().add(V(30, 44, 40)), look: DOL.clone().add(V(0, 3, 4)) }),
    start: () => ({ pos: orbit(V(0, 0, 21), 0.02, 62, 78), look: V(0, 0, 18) }),
  };
  const blendCam = (from, pos, look, t, t0, dur = 1.3) => {
    const k = ease.inOutCubic(clamp((t - t0) / dur));
    if (k >= 1) return [pos, look];
    const f = from();
    return [f.pos.lerp(pos, k), f.look.lerp(look, k)];
  };
  const project = (p) => { const v = p.clone().project(camera); return [(v.x * 0.5 + 0.5) * 1080, (-v.y * 0.5 + 0.5) * 1920]; };
  const showSprite = (s, scale, opacity = 1) => {
    s.visible = scale > 0.001 && opacity > 0.001;
    const [w, h] = s.userData.baseScale;
    s.scale.set(w * scale, h * scale, 1);
    s.material.opacity = opacity;
  };
  const setNight = (n) => { G.uNight.value = n; };
  const ringAt = (ring, p, r, op, width = 0.08) => {
    ring.visible = op > 0.001;
    ring.position.set(p.x, p.y + 0.15, p.z);
    ring.scale.set(r, r, r);
    ring.material.uniforms.uOpacity.value = op;
    ring.material.uniforms.uWidth.value = width;
  };
  const placePin = (p, s = 1, rotY = 0, squash = 1) => {
    pin.visible = true;
    pin.position.copy(p);
    pin.scale.set(s / Math.sqrt(squash), s * squash, s / Math.sqrt(squash));
    pin.rotation.set(0, rotY, 0);
  };
  const buildingsRise = (k, kp = null) => {
    campus.buildings.children.forEach((b) => { b.scale.y = Math.max(0.015, k(b)); b.visible = true; });
    campus.props.scale.y = Math.max(0.015, kp == null ? 1 : kp);
  };
  const phoneScreen = (p, list, t) => {
    // list: [{at, name, mode, dur}] sorted; pick current + transition from previous
    let cur = 0;
    for (let i = 0; i < list.length; i++) if (t >= list[i].at) cur = i;
    const c = list[cur];
    const prev = list[Math.max(0, cur - 1)];
    const k = c.dur ? clamp((t - c.at) / c.dur) : 1;
    if (cur > 0 && k < 1) p.show(prev.tex, c.tex, ease.inOutCubic(k), c.mode || 0);
    else p.show(c.tex);
  };
  const topScrim = (t, a, b) => OV.scrim('topScrim', { background: 'linear-gradient(to bottom, rgba(5,10,28,0.62) 0%, rgba(5,10,28,0.35) 16%, rgba(5,10,28,0) 32%)', opacity: envelope(t, a, b, 0.5, 0.5) });
  const caps = (line, t, y = 1585) => OV.captions('cap-' + line, { t, at: VO_AT[line], words: capWords[line], dir: TX.dir, y });

  // screen sequences
  const typeKeys = Object.keys(screens).filter((k) => k.startsWith('02_type')).sort((a, b) => parseInt(a.slice(7)) - parseInt(b.slice(7)));
  const tapSearchT = T.search + 0.42;
  const typeT0 = tapSearchT + 0.32;
  const pickT = wt('search', S.search[1]) - 0.1;
  const seqSearch = [
    { at: 0, tex: screens['00_home'] },
    { at: tapSearchT + 0.15, tex: screens['01_focus'], mode: 0, dur: 0.25 },
    ...typeKeys.map((k, i) => ({ at: typeT0 + i * Math.min(0.2, (pickT - typeT0 - 0.3) / typeKeys.length), tex: screens[k] })),
    { at: pickT + 0.25, tex: screens['03_route'], mode: 2, dur: 0.4 },
  ];
  const v3dTapT = wt('view3d', S.v3dTap) - 0.05;
  const seqV3d = [
    { at: 0, tex: screens['03_route'] },
    { at: v3dTapT + 0.2, tex: screens['04_3d_b'], mode: 2, dur: 0.5 },
    ...(T.langs - T.view3d > 5 ? [{ at: lineEnd('view3d') - 1.0, tex: screens['05_photo'], mode: 0, dur: 0.35 }] : []),
  ];

  let nightNow = 0;
  const dof = (focus, aperture = 0.02, maxblur = 0.009) => {
    post.bokeh.enabled = true;
    const u = post.bokeh.uniforms;
    u.focus.value = focus;
    u.aperture.value = aperture;
    u.maxblur.value = maxblur;
  };

  // ---- per-frame ---------------------------------------------------------------
  function update(t) {
    for (const o of dyn) o.visible = false;
    OV.beginFrame();
    G.uGlowRadius.value = 1e5;
    campus.root.visible = true;
    buildingsRise(() => 1);
    G.uRing.value = 0;
    G.uWarm.value = 0;
    G.uRevealRadius.value = -1000;
    G.uTime.value = t;
    setNight(0);
    const F = post.finish.uniforms;
    F.uFlash.value = 0;
    F.uFade.value = 1;
    F.uTime.value = t;
    post.bloom.strength = 0.35;
    world.set({ night: 0, fogNear: 160, fogFar: 900 });
    phone.zoom(1);
    phone.tap(0, 0, -1);
    phone.uniforms.uSheen.value = 0.3;
    post.bokeh.enabled = false;
    nightNow = 0;

    if (t < T.maze) sceneHook(t);
    else if (t < T.reveal) sceneMaze(t);
    else if (t < T.search) sceneReveal(t);
    else if (t < T.route) sceneSearch(t);
    else if (t < T.start) sceneRoute(t);
    else if (t < T.chips) sceneStart(t);
    else if (t < T.view3d) sceneChips(t);
    else if (t < T.langs) sceneView3d(t);
    else if (t < T.tagline) sceneLangs(t);
    else if (t < T.end) sceneFinale(t);
    else sceneEnd(t);

    campus.lampGlows.forEach((g) => { g.visible = nightNow > 0.01; g.material.opacity = nightNow; });
    if (ctx.captions) OV.scrim('botScrim', { background: 'linear-gradient(to top, rgba(5,10,28,0.55) 0%, rgba(5,10,28,0.25) 14%, rgba(5,10,28,0) 26%)', opacity: envelope(t, 14.8, T.langs, 0.6, 0.4) });
    // captions for VO lines that have no headline doing the same job
    if (ctx.captions) {
      for (const line of ['hook', 'maze', 'reveal', 'search', 'route', 'start', 'chips', 'view3d']) {
        if (line === 'hook' && t > wt('hook', -2) - 0.15) continue;
        caps(line, t);
      }
    }
    OV.endFrame();
  }

  // 1. HOOK — night, lost in the courtyard ------------------------------------
  function sceneHook(t) {
    setNight(1);
    nightNow = 1;
    world.set({ night: 1, fogNear: 45, fogFar: 340 });
    post.bloom.strength = 0.7;
    const k = t / T.maze;
    const pos = V(lerp(-2, -7, ease.inOutQuad(k)), lerp(5.5, 6.5, k), lerp(50, 22, ease.inOutQuad(k)));
    const look = V(-6, lerp(2.0, 4.2, k), lerp(20, -10, k));
    // opening drone dive into the courtyard
    const dv = ease.inOutCubic(clamp(t / (2.6 * kH)));
    pos.lerp(V(-40, 95, 110), 1 - dv);
    look.lerp(V(-6, 0, 10), 1 - dv);
    pos.x += wobble(t, 1, 0.3) * dv;
    pos.y += wobble(t, 2, 0.12) * dv;
    look.x += wobble(t, 4, 0.6) * dv;
    G.uGlowCenter.value.set(-6, -4);
    G.uGlowRadius.value = lerp(-10, 220, ease.inQuad(clamp((t - 0.3 * kH) / (3.2 * kH))));
    let roll = wobble(t, 3, 0.02);
    // whip out
    const wk = ease.inCubic(remap(t, T.maze - 0.45, T.maze));
    look.x += wk * 40;
    roll += wk * 0.15;
    setCam(pos, look, 40 - wk * 6, roll);
    hookTags.forEach((s, i) => {
      const a = (0.9 + i * 0.3) * kH;
      const sc = spring(t, a, { freq: 2.0, damp: 0.5 });
      s.position.copy(s.userData.base).add(V(0, Math.sin(t * 1.3 + i) * 0.3, 0));
      showSprite(s, sc, clamp((t - a) / 0.2) * (1 - wk));
    });
    hookQ.forEach((s, i) => {
      const a = (2.3 + i * 0.42) * kH;
      const sc = spring(t, a, { freq: 2.6, damp: 0.38 });
      s.position.copy(s.userData.base).add(V(0, Math.sin(t * 2 + i * 2) * 0.35, 0));
      showSprite(s, sc, clamp((t - a) / 0.15) * (1 - wk));
    });
    F().uFade.value = ease.outQuad(clamp(t / (1.0 * kH)));
    F().uFlash.value = wk * 0.25;
    OV.headline('hook', { t, tIn: wt('hook', -2) - 0.12, tOut: T.maze - 0.45, text: TX.hook, y: 250, size: 150 * HS, dir: TX.dir, style: 'slam', stagger: 0.12, accent: '#4f8dff' });
  }
  const F = () => post.finish.uniforms;

  // 2. MAZE — every corridor looks the same ------------------------------------
  function sceneMaze(t) {
    setNight(1);
    nightNow = 1;
    world.set({ night: 1, fogNear: 70, fogFar: 520 });
    post.bloom.strength = 0.6;
    const k = remap(t, T.maze, T.reveal);
    const C = V(-2, 0, 14);
    const ang = lerp(-0.5, 0.15, ease.inOutQuad(k));
    const push = ease.inCubic(remap(t, 13.2, 14.0));
    const pos = orbit(C, ang, lerp(62, 52, k) - push * 20, lerp(112, 96, k) - push * 30);
    setCam(pos, C.clone().add(V(0, 0, push * 8)), 38);
    const fadeAll = 1 - ease.inOutQuad(remap(t, 13.1, 13.7));
    mazeRoutes.forEach(({ r, x, cut }, i) => {
      const a = 8.25 + i * 0.42;
      const p = ease.inOutQuad(remap(t, a, a + 1.7)) * cut;
      r.set(p, { time: t, opacity: fadeAll * 0.95, headGlow: 0.6 });
      if (p >= cut - 0.001) {
        x.position.copy(r.pointAt(cut)).add(V(0, 2.2, 0));
        showSprite(x, spring(t, a + 1.7, { freq: 2.6, damp: 0.4 }), fadeAll);
      }
    });
    mazeQ.forEach((s, i) => {
      const a = 8.7 + i * 0.36;
      s.position.copy(s.userData.base).add(V(0, Math.sin(t * 1.7 + i) * 0.6, 0));
      showSprite(s, spring(t, a, { freq: 2.4, damp: 0.4 }), clamp((t - a) / 0.15) * fadeAll);
    });
    // a beam of light announces what comes next
    const bk = remap(t, 13.0, 14.0);
    if (bk > 0) {
      beam.visible = true;
      beam.position.set(COURT.x, 70, COURT.z);
      beam.material.opacity = ease.inQuad(bk) * 0.35;
    }
    OV.headline('maze', { t, tIn: wt('maze', S.maze) - 0.1, tOut: 13.4, text: TX.maze, y: 300, size: 132 * HS, dir: TX.dir, style: 'rise', accent: '#ff5a5a' });
  }

  // 3. REVEAL — the pin lands and daylight sweeps the campus --------------------
  function sceneReveal(t) {
    const TI = T.reveal + 0.5;
    const fall = clamp((t - T.reveal) / 0.5);
    const after = t - TI;
    // pin
    const squash = after > 0 ? 1 - 0.28 * Math.exp(-after * 7) * Math.cos(after * 26) : 1 + fall * 0.12;
    const bob = after > 0.9 ? Math.sin((t - TI) * 1.8) * 0.25 * clamp((after - 0.9) / 0.5) : 0;
    placePin(COURT.clone().add(V(0, lerp(34, 0, ease.inQuad(fall)) + bob + (after > 0.9 ? 0.25 * clamp((after - 0.9) / 0.5) : 0), 0)), 1.6, after > 0 ? after * 0.7 : 0, squash);
    pinShadow.visible = true;
    pinShadow.position.set(COURT.x, 0.06, COURT.z);
    pinShadow.scale.setScalar(lerp(0.3, 1.6, fall));
    // grade
    setNight(1 - (after > 0 ? ease.inOutQuad(clamp((after - 1.3) / 0.9)) : 0));
    G.uRevealCenter.value.set(COURT.x, COURT.z);
    G.uRevealRadius.value = after > 0 ? ease.outCubic(clamp(after / 1.9)) * 280 + Math.max(0, after - 1.5) * 1500 : -1000;
    G.uRing.value = after > 0 ? 1 - clamp(after / 2.2) : 0;
    const skyN = 1 - ease.inOutQuad(clamp((after - 0.15) / 1.5));
    nightNow = skyN;
    world.set({ night: skyN, fogNear: lerp(20, 160, 1 - skyN), fogFar: lerp(260, 900, 1 - skyN) });
    post.bloom.strength = lerp(0.35, 0.65, skyN);
    // impact fx
    if (after > 0) {
      ringAt(impactRing, COURT, lerp(1, 85, ease.outExpo(clamp(after / 1.4))), 1 - clamp(after / 1.4), 0.05);
      F().uFlash.value = 0.6 * (1 - clamp(after / 0.35));
    } else {
      beam.visible = true;
      beam.position.set(COURT.x, 70, COURT.z);
      beam.material.opacity = 0.35;
    }
    // camera
    let pos, look;
    if (after < 0.12) {
      const py = lerp(34, 0, ease.inQuad(fall));
      pos = COURT.clone().add(V(3, 2.0, 22));
      look = COURT.clone().add(V(0, Math.max(3, py * 0.75 + 3), 0));
    } else {
      const u = ease.inOutCubic(remap(t, TI + 0.12, T.search));
      const ang = lerp(0.14, 1.35, u);
      pos = orbit(COURT, ang, lerp(22, 66, u), lerp(2.0, 40, u));
      look = COURT.clone().add(V(0, lerp(3, 0, u), lerp(0, -8, u)));
    }
    const shake = after > 0 ? 0.7 * Math.exp(-after * 5) : 0;
    pos.add(V(Math.sin(t * 61) * shake, Math.sin(t * 47 + 1) * shake * 0.6, 0));
    setCam(pos, look, 40);
    // 3D wordmark (camera space)
    const tl = wt('reveal', S.revealLogo) - 0.2;
    const out = ease.inCubic(remap(t, T.search - 0.55, T.search - 0.05));
    if (t > tl) {
      logo.face.color.set('#1d4ed8');
      logo.side.color.set('#0a1f66');
      logo.group.visible = true;
      const sc = 2.7 / logo.group.userData.width;
      logo.group.scale.setScalar(sc);
      logo.group.position.set(0, 1.42 + out * 0.6, -8);
      logo.group.rotation.set(0.04 + wobble(t, 9, 0.03), wobble(t, 7, 0.06), 0);
      logo.letters.forEach((l, i) => {
        const a = tl + i * 0.055;
        const p = ease.outExpo(clamp((t - a) / 0.8));
        const s = spring(t, a, { freq: 1.8, damp: 0.55 });
        l.position.copy(l.userData.home).add(V(0, (1 - p) * -1.2, (1 - p) * -6 + out * 6));
        l.rotation.set((1 - p) * -1.1, (1 - p) * 0.9 + out * -0.6, 0);
        l.scale.setScalar(Math.max(0.001, s * (1 - out)));
      });
    }
    OV.kicker('revealSub', { t, tIn: wt('reveal', S.revealSub) - 0.05, tOut: T.search - 0.5, html: `<span>${TX.revealSub}</span>`, pill: true, y: 640, size: 50, dir: TX.dir, color: '#0b1220', weight: 800 });
  }

  // 4. SEARCH — the phone -------------------------------------------------------
  function sceneSearch(t) {
    world.set({ night: 0, fogNear: 60, fogFar: 600 });
    dof(3.25);
    const k = remap(t, T.search, T.route);
    const [sp4, sl4] = blendCam(ENDPOSE.reveal, V(lerp(26, 6, k), lerp(88, 80, k), lerp(98, 82, k)), V(-6, 0, 12), t, T.search, 1.2);
    setCam(sp4, sl4, 38);
    // phone in camera space
    const s = spring(t, T.search - 0.05, { freq: 1.6, damp: 0.66 });
    const dive = ease.inCubic(remap(t, T.route - 0.6, T.route));
    phone.group.visible = true;
    phone.group.position.set(0, -0.12 - (1 - s) * 2.4 + dive * 0.12, -3.25 + dive * 2.35);
    phone.group.rotation.set((1 - s) * 0.9 + Math.sin(t * 0.8) * 0.025 * (1 - dive), -0.2 + (1 - s) * 0.7 + Math.sin(t * 0.6) * 0.05 * (1 - dive) + dive * 0.2, (1 - s) * -0.25);
    phone.uniforms.uSheen.value = 0.1 + k * 0.8;
    phoneScreen(phone, seqSearch, t);
    phone.tap(195, 812, t - tapSearchT);
    if (t > pickT - 0.05) phone.tap(195, 716, t - pickT);
    phone.zoom(1 + dive * 0.9, 200, 330);
    F().uFlash.value = ease.inQuad(remap(t, T.route - 0.25, T.route)) * 0.85;
    // kinetic words
    topScrim(t, T.search + 0.2, T.route - 0.3);
    const ins = S.search.map((i) => (i == null ? null : wt('search', i) - 0.05));
    if (ins[2] == null) ins[2] = Math.min(ins[1] + 1.1, T.route - 1.0);
    TX.search.forEach((w, i) => {
      OV.headline('search' + i, { t, tIn: ins[i], tOut: i < 2 ? ins[i + 1] - 0.12 : T.route - 0.45, text: w, y: 215, size: 128 * HS, dir: TX.dir, style: 'pop', accent: '#ffb23d' });
    });
  }

  // 5. ROUTE — the map rises into 3D and the route draws itself ----------------
  function sceneRoute(t) {
    world.set({ night: 0 });
    F().uFlash.value = 0.85 * (1 - ease.outCubic(clamp((t - T.route) / 0.45)));
    const riseT0 = T.route + 0.35;
    const entPx = routesJson.entrance;
    buildingsRise((b) => spring(t, riseT0 + Math.hypot(b.userData.cx - entPx[0], b.userData.cy - entPx[1]) * 0.0011, { freq: 1.5, damp: 0.5 }), spring(t, riseT0 + 0.35, { freq: 1.4, damp: 0.55 }));
    const dStart = T.route + 1.4, dEnd = T.route + 4.5;
    const u = ease.inOutCubic(remap(t, dStart, dEnd));
    routeD.set(u, { time: t });
    // start marker
    entDot.visible = true;
    entDot.position.copy(ENT);
    entDot.scale.setScalar(1.3 * spring(t, T.route + 0.9, { freq: 2, damp: 0.5 }));
    entDot.userData.halo.scale.setScalar(1.5 + (Math.sin(t * 4) * 0.5 + 0.5) * 1.6);
    // camera: top-down -> chase
    const top = { pos: V(-9, 120, 34), look: V(-9, 0, 31) };
    const head = routeD.pointAt(u);
    const dir = new THREE.Vector3();
    for (let i = -3; i <= 3; i++) dir.add(routeD.tangentAt(clamp(u + i * 0.04)));
    dir.y = 0;
    dir.normalize();
    const side = V(-dir.z, 0, dir.x);
    const chase = { pos: head.clone().sub(dir.clone().multiplyScalar(40)).add(side.multiplyScalar(-12)).add(V(0, 42, 0)), look: head.clone().add(dir.clone().multiplyScalar(8)) };
    const arr = ease.inOutCubic(remap(t, dEnd - 0.2, T.start));
    const arrive = { pos: DOL.clone().add(V(lerp(20, 30, arr), lerp(34, 44, arr), lerp(30, 40, arr))), look: DOL.clone().add(V(0, 3, 4)) };
    const b1 = ease.inOutCubic(remap(t, T.route + 0.5, dStart + 0.6));
    const b2 = ease.inOutCubic(remap(t, dEnd - 0.5, dEnd + 0.4));
    const pos = top.pos.clone().lerp(chase.pos, b1).lerp(arrive.pos, b2);
    const look = top.look.clone().lerp(chase.look, b1).lerp(arrive.look, b2);
    setCam(pos, look, 40);
    // destination pin
    const pinT = dEnd - 0.15;
    if (t > pinT) {
      const f = clamp((t - pinT) / 0.35);
      const after = t - pinT - 0.35;
      const squash = after > 0 ? 1 - 0.25 * Math.exp(-after * 7) * Math.cos(after * 24) : 1;
      placePin(DOL.clone().add(V(0, ROOF + lerp(30, 0, ease.inQuad(f)), 0)), 1.5, t * 0.6, squash);
      if (after > 0) ringAt(arriveRing, DOL.clone().add(V(0, ROOF, 0)), lerp(1, 16, ease.outCubic(clamp(after / 1.0))), 1 - clamp(after / 1.0), 0.1);
      destTag.position.copy(DOL).add(V(0, ROOF + 6.6, 0));
      showSprite(destTag, spring(t, pinT + 0.4, { freq: 2.2, damp: 0.5 }));
    }
    OV.routeCard('rc', { t, tIn: dStart + 0.1, tOut: T.start - 0.35, title: TX.room, meta: TX.routeMeta(Math.round(110 * u)), dir: TX.dir, y: 1310 });
  }

  // 6. START — "you are here" -----------------------------------------------------
  function sceneStart(t) {
    world.set({ night: 0 });
    const k = remap(t, T.start, T.chips);
    const C = V(0, 0, 21);
    const [sp6, sl6] = blendCam(ENDPOSE.route, orbit(C, lerp(-0.32, 0.02, ease.inOutQuad(k)), lerp(70, 62, k), lerp(86, 78, k)), C.clone().add(V(0, 0, -3)), t, T.start, 1.5);
    setCam(sp6, sl6, 38);
    const tapT = wt('start', S.startTap) + 0.25;
    const rT = wt('start', S.startRoute);
    // destination stays
    placePin(DOL.clone().add(V(0, ROOF + Math.sin(t * 1.8) * 0.25, 0)), 1.5, t * 0.6);
    destTag.position.copy(DOL).add(V(0, ROOF + 6.6, 0));
    showSprite(destTag, 1);
    // old route + entrance marker fade out when the new start is set
    const oldOp = 1 - clamp((t - tapT) / 0.5);
    routeD.set(1, { time: t, opacity: oldOp });
    entDot.visible = oldOp > 0.01;
    entDot.position.copy(ENT);
    entDot.scale.setScalar(1.3 * oldOp);
    // tap
    const [px, py] = project(HERE);
    OV.pointer('ptr', { t, x: px, y: py, tIn: tapT - 1.0, press: tapT, tOut: tapT + 0.9 });
    tapRings.forEach((r, i) => { const a = t - tapT - i * 0.18; if (a > 0) ringAt(r, HERE, lerp(1, 12, ease.outCubic(clamp(a / 0.9))), 1 - clamp(a / 0.9), 0.12); });
    if (t > tapT) {
      hereDot.visible = true;
      hereDot.position.copy(HERE);
      hereDot.scale.setScalar(1.35 * spring(t, tapT, { freq: 2.4, damp: 0.45 }));
      hereDot.userData.halo.scale.setScalar(1.5 + (Math.sin(t * 4) * 0.5 + 0.5) * 1.6);
      hereTag.position.copy(HERE).add(V(0, 4.2, 0));
      showSprite(hereTag, spring(t, tapT + 0.25, { freq: 2.2, damp: 0.5 }));
    }
    routeC.set(ease.inOutCubic(remap(t, rT, rT + 1.9)), { time: t });
    topScrim(t, wt('start', S.startHead) - 0.4, T.chips - 0.2);
    OV.headline('start', { t, tIn: wt('start', S.startHead) - 0.15, tOut: T.chips - 0.4, text: TX.start, y: 200, size: 122 * HS, dir: TX.dir, style: 'rise', accent: '#5b9bff' });
  }

  // 7. CHIPS — toilets, office, shelter -----------------------------------------
  function sceneChips(t) {
    world.set({ night: 0 });
    const k = remap(t, T.chips, T.view3d);
    const pressT = S.chipPress == null ? T.chips + 2.3 : wt('chips', S.chipPress);
    const C = V(4, 0, 6);
    const wide = { pos: orbit(C, lerp(1.15, 1.45, ease.inOutQuad(k)), 132, 104), look: C };
    const target = routeT.pointAt(1);
    const mid = HERE.clone().lerp(target, 0.5);
    const close = { pos: mid.clone().add(V(40, 62, 58)), look: mid };
    const b = ease.inOutCubic(remap(t, pressT + 0.1, pressT + 1.6));
    const [sp7, sl7] = blendCam(hasStart ? ENDPOSE.start : ENDPOSE.route, wide.pos.clone().lerp(close.pos, b), wide.look.clone().lerp(close.look, b), t, T.chips, 1.4);
    setCam(sp7, sl7, 38);
    hereDot.visible = true;
    hereDot.position.copy(HERE);
    hereDot.scale.setScalar(1.35);
    hereDot.userData.halo.scale.setScalar(1.5 + (Math.sin(t * 4) * 0.5 + 0.5) * 1.6);
    if (hasStart) routeC.set(1, { time: t, opacity: 1 - clamp((t - T.chips) / 0.5) });
    const kinds = ['wc', 'office', 'shelter'];
    kinds.forEach((kind, ki) => {
      const at = wt('chips', S.chips[ki]) - 0.05;
      badgeSets[kind].forEach((bd, i) => {
        const a = at + i * 0.05;
        const s = spring(t, a, { freq: 2.3, damp: 0.45 });
        const isTarget = bd.userData.id === routesJson.courtToilet.to;
        const dim = t > pressT ? (isTarget ? 1 : 1 - clamp((t - pressT) / 0.5)) : 1;
        const pulse = isTarget && t > pressT ? 1 + 0.12 * Math.sin((t - pressT) * 9) * Math.exp(-(t - pressT) * 1.2) : 1;
        bd.position.copy(bd.userData.base).add(V(0, Math.sin(t * 1.6 + i) * 0.4, 0));
        showSprite(bd, s * pulse, clamp((t - a) / 0.12) * dim);
        const bm = bd.userData.beam;
        bm.visible = s > 0.01;
        bm.scale.set(1, 12 * clamp(s), 1);
        bm.material.opacity = 0.55 * dim * clamp(s);
      });
    });
    routeT.set(ease.inOutCubic(remap(t, pressT + 0.25, pressT + 1.5)), { time: t });
    OV.chips('chips', { t, tIn: T.chips, tOut: T.view3d - 0.4, y: 250, dir: TX.dir, items: chipItems.map((c, i) => ({ ...c, at: wt('chips', S.chips[i]) - 0.05 })), pressIdx: 0, pressAt: pressT, dimOthers: pressT + 0.1 });
  }

  // 8. 3D VIEW + PHOTOS ------------------------------------------------------------
  function sceneView3d(t) {
    world.set({ night: 0, fogNear: 60, fogFar: 600 });
    dof(3.4);
    const k = remap(t, T.view3d, T.langs);
    setCam(orbit(V(0, 0, 8), lerp(0.5, 0.95, k), 110, 82), V(0, 0, 8), 38);
    const s = spring(t, T.view3d, { freq: 1.2, damp: 0.6 });
    const cardsT = wt('view3d', S.v3dCards) - 0.1;
    const shift = ease.inOutCubic(remap(t, cardsT - 0.3, cardsT + 0.6));
    const out = ease.inCubic(remap(t, T.langs - 0.45, T.langs));
    phone.group.visible = true;
    phone.group.position.set((1 - s) * 2.6 + out * -2.6, -0.14 - shift * 0.04, -3.3 - shift * 0.35);
    phone.group.rotation.set(0.04 + Math.sin(t * 0.7) * 0.02, -0.15 + (1 - s) * 0.9 + Math.sin(t * 0.5) * 0.06 - out * 0.6, (1 - s) * 0.12);
    phone.uniforms.uSheen.value = 0.2 + k;
    phoneScreen(phone, seqV3d, t);
    phone.tap(38, 459, t - v3dTapT);
    // photo carousel around the phone
    const base = (t - cardsT) * 0.32;
    cards.forEach((c, i) => {
      const a = cardsT + i * 0.13;
      const sp = spring(t, a, { freq: 1.6, damp: 0.6 });
      if (sp <= 0.001) return;
      c.visible = true;
      const th = base + (i / cards.length) * Math.PI * 2;
      const ring = V(Math.sin(th) * 1.32, -0.12 + Math.sin(th * 2 + i) * 0.22 + (i % 2 ? 0.34 : -0.3), -3.65 + Math.cos(th) * 0.95);
      const from = V(0, -0.14, -3.7);
      c.position.copy(from.lerp(ring, sp)).add(V(out * -2.6, 0, 0));
      c.scale.setScalar(Math.max(0.001, sp));
      c.lookAt(0, 0, 0.6);
      c.rotateZ(Math.sin(th) * 0.06);
    });
    topScrim(t, wt('view3d', S.v3dTap) - 0.4, T.langs - 0.2);
    OV.headline('v3d', { t, tIn: wt('view3d', S.v3dTap) - 0.1, tOut: T.langs - 0.45, text: TX.view3d, y: 200, size: 118 * HS, dir: TX.dir, style: 'rise', accent: '#ff9a3c' });
  }

  // 9. LANGUAGES ---------------------------------------------------------------------
  function sceneLangs(t) {
    world.set({ night: 0, fogNear: 60, fogFar: 600 });
    dof(3.6);
    const k = remap(t, T.langs, T.tagline);
    setCam(orbit(V(0, 0, 8), lerp(0.95, 1.15, k), 110, 82), V(0, 0, 8), 38);
    const order = rtl ? [1, 0, -1] : [-1, 0, 1]; // he, ru, en positions
    const out = ease.inCubic(remap(t, T.tagline - 0.4, T.tagline));
    ['he', 'ru', 'en'].forEach((l, i) => {
      const p = langPhones[i];
      const a = wt('langs', S.langs[i]) - 0.12;
      const s = spring(t, a, { freq: 1.6, damp: 0.55 });
      if (s <= 0.001) return;
      p.group.visible = true;
      const x = order[i] * 0.46;
      const z = -3.6 - Math.abs(order[i]) * 0.25;
      p.group.position.set(x, 0.06 - (1 - s) * 2.2 + out * 2.5, z);
      p.group.rotation.set((1 - s) * 0.8 + 0.04, -order[i] * 0.32 + Math.sin(t * 0.7 + i) * 0.04, (1 - s) * 0.2 * order[i]);
      p.group.scale.setScalar(0.6);
      p.show(homes[l]);
      p.uniforms.uSheen.value = 0.3 + k * 0.6;
      camera.updateMatrixWorld(true);
      p.group.updateMatrixWorld(true);
      const bw = V(0, -0.82, 0.1).applyMatrix4(p.group.matrixWorld);
      const [lx, ly] = project(bw);
      OV.tagAt('lang' + i, { t, tIn: a + 0.15, tOut: T.tagline - 0.4, x: lx, y: ly + 10, text: TX.langs[i], on: i === ['he', 'ru'].indexOf(lang) });
    });
  }

  // 10. FINALE — golden hour tagline + CTA ---------------------------------------------
  function sceneFinale(t) {
    const warm = ease.inOutQuad(remap(t, T.tagline - 0.2, T.tagline + 1.6));
    G.uWarm.value = warm;
    world.set({ night: 0, warm, fogNear: 170, fogFar: 950 });
    post.bloom.strength = 0.45;
    // whole route + pin glow at sunset
    routeD.set(1, { time: t });
    placePin(DOL.clone().add(V(0, ROOF + Math.sin(t * 1.8) * 0.25, 0)), 1.5, t * 0.6);
    entDot.visible = true;
    entDot.position.copy(ENT);
    entDot.scale.setScalar(1.3);
    entDot.userData.halo.scale.setScalar(1.5 + (Math.sin(t * 4) * 0.5 + 0.5) * 1.6);
    const u = ease.inOutCubic(remap(t, T.tagline, T.cta + 0.6));
    const u2 = ease.inOutQuad(remap(t, T.cta, T.end));
    // crane: swing around the destination from the north side up to a high wide shot
    const ang = lerp(2.74, 6.096, ease.inOutQuad(u));
    const pos = orbit(DOL, ang, lerp(23, 132, Math.pow(u, 1.25)), lerp(15, 118, u));
    pos.applyAxisAngle(V(0, 1, 0), u2 * 0.25);
    const look = DOL.clone().add(V(0, 4, 0)).lerp(V(-6, 0, 14), u);
    setCam(pos, look, 40);
    const [l1, l2] = TX.tagline.split('|');
    topScrim(t, T.tagline + 0.2, T.end - 0.2);
    OV.kicker('tagLogo', { t, tIn: wt('tagline', 0) - 0.05, tOut: T.cta - 0.3, html: '<span class="logo-word" style="font-size:96px">BEGIN MAP</span>', y: 190, size: 96, dir: 'ltr', color: '#fff' });
    OV.headline('tag1', { t, tIn: wt('tagline', S.tag1) - 0.08, tOut: T.cta - 0.3, text: l1, y: 360, size: 132 * HS, dir: TX.dir, style: 'rise' });
    OV.headline('tag2', { t, tIn: wt('tagline', S.tag2) - 0.08, tOut: T.cta - 0.3, text: l2, y: 510, size: 132 * HS, dir: TX.dir, style: 'rise', accent: '#ffd24a' });
    // CTA
    if (t > T.cta) {
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
      OV.headline('cta', { t, tIn: T.cta + 0.3, tOut: T.end - 0.35, text: TX.cta, y: 250, size: 132 * HS, dir: TX.dir, style: 'pop', accent: '#ffd24a' });
      OV.kicker('ctaSub', { t, tIn: wt('cta', S.ctaSub) - 0.05, tOut: T.end - 0.35, text: TX.ctaSub, y: 250 + (TX.cta.includes('|') ? 280 : 170) * HS, size: 52, dir: TX.dir, color: '#ffffff', weight: 800 });
    }
    F().uFlash.value = ease.inQuad(remap(t, T.end - 0.2, T.end)) * 0.0;
  }

  // 11. END CARD ----------------------------------------------------------------------
  function sceneEnd(t) {
    campus.root.visible = false;
    world.set({ night: 0, fogNear: 1e4, fogFar: 2e4 });
    world.skyU.uStudio.value = 1;
    world.skyU.uStudioTop.value.set('#122a6b');
    world.skyU.uStudioBot.value.set('#050a1a');
    post.bloom.strength = 0.4;
    world.sun.intensity = 1.3;
    world.hemi.intensity = 0.55;
    setCam(V(0, 0, 10), V(0, 0, 0), 38);
    const k = t - T.end;
    const sp = spring(t, T.end + 0.05, { freq: 1.4, damp: 0.55 });
    endPin.visible = true;
    endPin.position.set(0, 0.42 + (1 - sp) * -1.5 + Math.sin(k * 1.6) * 0.04, -7);
    endPin.scale.setScalar(0.36 * Math.max(0.001, sp));
    endPin.rotation.set(0, k * 0.9 - 0.4, 0);
    logo.group.visible = true;
    logo.face.color.set('#b9c6e6');
    logo.side.color.set('#1d4ed8');
    const sc = 2.25 / logo.group.userData.width;
    logo.group.scale.setScalar(sc);
    logo.group.position.set(0, 0.06, -7);
    logo.group.rotation.set(0.05, Math.sin(k * 0.8) * 0.08, 0);
    logo.letters.forEach((l, i) => {
      const a = T.end + 0.2 + i * 0.045;
      const p = ease.outExpo(clamp((t - a) / 0.7));
      l.position.copy(l.userData.home).add(V(0, (1 - p) * -0.8, (1 - p) * -3));
      l.rotation.set((1 - p) * -1.0, 0, 0);
      l.scale.setScalar(Math.max(0.001, p));
    });
    OV.block('endSub', { t, tIn: T.end + 0.8, html: `<div class="small" style="direction:${TX.dir};font-size:46px;color:rgba(255,255,255,0.85)">${TX.endSub}</div>`, y: 1060 });
    OV.block('endUrl', { t, tIn: T.end + 1.0, html: '<div class="url">beginmap.github.io/begin-nav</div>', y: 1150 });
    OV.block('credits', { t, tIn: T.end + 1.3, html: `<div class="credits"><span class="lbl" style="direction:${TX.dir}">${TX.creditsLabel}</span>@david.ik. &nbsp;·&nbsp; @liamna01_</div>`, y: 1370 });
    OV.block('idea', { t, tIn: T.end + 1.55, html: `<div class="credits" style="font-size:42px"><span class="lbl" style="direction:${TX.dir}">${TX.ideaLabel}</span>@amitbiton24</div>`, y: 1560 });
    F().uFade.value = 1 - ease.inQuad(remap(t, T.total - 0.9, T.total));
  }

  // ---- cue sheet for the sound design (same clock as the visuals) ----------------
  const pressT = S.chipPress == null ? T.chips + 2.3 : wt('chips', S.chipPress);
  const cues = {
    edit: EDIT,
    T,
    voAt: VO_AT,
    voDur: Object.fromEntries(Object.keys(vo.lines).map((k) => [k, vo.lines[k].dur])),
    bell: EDIT === 'full' ? wt('hook', 5) : null,
    hookSlam: wt('hook', -2) - 0.12,
    whip1: T.maze - 0.4,
    mazeStarts: T.reveal > T.maze ? mazeRoutes.map((m, i) => 8.25 + i * 0.42) : [],
    mazeX: T.reveal > T.maze ? mazeRoutes.map((m, i) => 8.25 + i * 0.42 + 1.7) : [],
    pinFall: T.reveal,
    impact: T.reveal + 0.5,
    logoIn: wt('reveal', S.revealLogo) - 0.2,
    revealSub: wt('reveal', S.revealSub) - 0.05,
    phoneIn: T.search,
    tapSearch: tapSearchT,
    typing: seqSearch.filter((x, i) => i >= 2 && i < seqSearch.length - 1).map((x) => x.at),
    pick: pickT,
    dive: T.route - 0.6,
    flash: T.route,
    rise: T.route + 0.35,
    routeDraw: [T.route + 1.4, T.route + 4.5],
    pinArrive: T.route + 4.5 - 0.15 + 0.35,
    startTap: hasStart ? wt('start', S.startTap) + 0.25 : null,
    startRoute: hasStart ? wt('start', S.startRoute) : null,
    chips: S.chips.map((i) => wt('chips', i) - 0.05),
    chipPress: pressT,
    toiletRoute: pressT + 0.25,
    v3dIn: T.view3d,
    v3dTap: v3dTapT,
    cards: cards.map((c, i) => wt('view3d', S.v3dCards) - 0.1 + i * 0.13),
    langs: T.tagline > T.langs ? S.langs.map((i) => wt('langs', i) - 0.12) : [],
    tagline: T.tagline,
    tag1: wt('tagline', S.tag1) - 0.08,
    tag2: wt('tagline', S.tag2) - 0.08,
    cta: T.cta,
    end: T.end,
    total: T.total,
  };

  return { update, cues };
}
