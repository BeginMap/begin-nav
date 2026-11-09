import * as THREE from 'three';
import { G } from './lib/grade.js';
import { clamp, lerp, remap, ease, spring, envelope, wobble, rng, px2w } from './lib/util.js';
import { roomTag, questionBubble, badge, iconCanvas } from './lib/labels.js';
import { makePin, makeRing } from './lib/pin.js';
import { makeRoute, makeHereDot } from './lib/route.js';
import { makePhone } from './lib/phone.js';
import { photoCard, qrCard } from './lib/cards.js';
import { makeLogo3D } from './lib/logo3d.js';
import { makeMotes, makeBurst, makeTrail, makePillar } from './lib/fx.js';
import { makeCloudDeck, makeMountains } from './lib/clouds.js';
import { makeARPath, makeLaunchArc } from './lib/arpath.js';
import { loadStudent } from './lib/student.js';
import * as OV from './lib/overlay.js';
import { TEXT, PHOTOS, EDITS } from './text.js';

// "Story" cut: through the clouds, down to a student on their first day, who opens
// Begin Map on the phone; the route leaves the phone and lies down on the courtyard.
// Everything is a pure function of time t.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const W2 = (x, y) => { const [X, Z] = px2w(x, y); return V(X, 0, Z); };

export async function createStoryDirector(ctx) {
  const { scene, camera, world, post, campus, envMap, lang, screens, homes, vo, rooms, routesJson } = ctx;
  const TX = TEXT[lang];
  const { T, VO_AT } = EDITS.story;
  const S = TX.sync;
  const rtl = TX.dir === 'rtl';
  const HS = TX.hScale || 1;
  scene.add(camera);
  camera.near = 0.05;
  camera.far = 3200;
  camera.updateProjectionMatrix();

  // ---- timing ------------------------------------------------------------------
  const words = (line) => vo.lines[line].words;
  const wt = (line, k) => {
    if (!vo.lines[line] || k == null) return null;
    const w = words(line);
    return VO_AT[line] + w[k < 0 ? w.length + k : Math.min(k, w.length - 1)].t0;
  };
  const lineEnd = (line) => VO_AT[line] + vo.lines[line].dur;
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

  // ---- places ------------------------------------------------------------------
  const SR = routesJson.story;
  const room = (id) => rooms.find((r) => r.id === id);
  const HERE = W2(...SR.here);
  const DOL = W2(room('dolphin').x, room('dolphin').y);
  const ENT = W2(...routesJson.entrance);
  const ROOF = 3.8;
  // student-local -> world (she faces north, -Z)
  const SL = (x, y, z) => V(HERE.x - x, y, HERE.z - z);

  // ---- objects ---------------------------------------------------------------------
  const dyn = [];
  const add = (o, parent = scene) => { parent.add(o); dyn.push(o); return o; };

  const st = await loadStudent(envMap);
  scene.add(st.root);
  st.root.position.copy(HERE);
  st.root.rotation.y = Math.PI;

  const mountains = makeMountains();
  scene.add(mountains);
  const divePath = [V(70, 262, 205), V(50, 240, 170), V(38, 222, 148)];
  const deck = makeCloudDeck({ center: V(0, 0, 30), path: divePath });
  add(deck.group);

  const pin = add(makePin(envMap));
  const pinShadow = add(pin.userData.shadow);
  const arriveRing = add(makeRing('#ff9a3c'));
  const hereRings = [add(makeRing('#3b82f6')), add(makeRing('#3b82f6'))];
  const pillar = add(makePillar('#ffb35a', 60, 1.2));

  // lost: room tags + "?" over the buildings around the courtyard
  const hookIds = ['dolphin', 'tochnit', 'halil', 'zaharon', 'solit', 'shonit', 'marganit', 'htb_coord3', 'htb_counsel2', 'tuson', 'zion', 'yarden'];
  const R = rng(5);
  const lostTags = hookIds.map((id) => room(id)).filter(Boolean).map((r, i) => {
    const s = add(roomTag(r.names[lang] || r.names.he, { rtl, size: 1.0 }));
    s.userData.base = W2(r.x, r.y).add(V(0, ROOF + 1.4 + (i % 3) * 0.9, 0));
    return s;
  });
  const lostQ = Array.from({ length: 6 }, (_, i) => {
    const s = add(questionBubble(0.62));
    const tag = lostTags[(i * 4 + 1) % lostTags.length];
    s.userData.base = tag.userData.base.clone().add(V((R() - 0.5) * 3, 1.8 + R() * 1.2, 0));
    return s;
  });

  // routes: app default (from the gate), AR path from the student, toilet
  const routeGate = makeRoute(routesJson.dolphin.pts, { radius: 0.55, y: 0.5 });
  add(routeGate.group);
  const fwd = (d) => SL(0, 0, d);
  const arDol = makeARPath(SR.dolphin.pts, { width: 0.85 });
  add(arDol.group);
  const arWc = makeARPath(SR.toilet.pts, { color: '#22a6f2', width: 0.85 });
  add(arWc.group);
  const launch = makeLaunchArc('#ffb066');
  add(launch.group);
  const hereDot = add(makeHereDot());
  const destTag = add(roomTag(TX.room, { rtl, size: 1.1 }));
  const hereTag = add(roomTag(TX.here, { rtl, size: 0.13, dark: false }));

  const badgeList = [];
  const beamGeo = new THREE.CylinderGeometry(0.08, 0.08, 1, 8, 1, true);
  beamGeo.translate(0, 0.5, 0);
  const near = (r) => Math.hypot(...px2w(r.x, r.y).map((v, i) => v - [HERE.x, HERE.z][i]));
  const kinds = { wc: 'toilets', office: 'office', shelter: 'shelter' };
  for (const [kind, cat] of Object.entries(kinds)) {
    rooms.filter((r) => r.category === cat && (cat !== 'office' || /secretary|manager|office|deputy/.test(r.id)) && near(r) < 80)
      .sort((a, b) => near(a) - near(b)).slice(0, 4)
      .forEach((r, i) => {
        const b = add(badge(kind, 1.6));
        b.userData.base = W2(r.x, r.y).add(V(0, ROOF + 3.4 + (i % 2) * 1.0, 0));
        const bm = add(new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: kind === 'shelter' ? '#ff9a3c' : '#7fb8ff', transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })));
        bm.position.copy(W2(r.x, r.y));
        b.userData = { ...b.userData, beam: bm, kind, id: r.id, idx: i };
        badgeList.push(b);
      });
  }

  // camera-space props
  const cards = [];
  for (let i = 0; i < PHOTOS.length; i++) cards.push(add(await photoCard('../../' + PHOTOS[i], envMap, { w: 0.82, caption: TX.photoCaptions[i], rtl }), camera));
  const ctaPhone = makePhone(envMap);
  add(ctaPhone.group, camera);
  const qr = add(await qrCard(envMap, { title: TX.qrTitle }), camera);
  const logo = await makeLogo3D(envMap);
  add(logo.group, camera);
  logo.group.traverse((o) => { if (o.material) { o.material.depthTest = false; o.renderOrder = 60; } });
  const endPin = add(makePin(envMap), camera);
  endPin.traverse((o) => { if (o.material) { o.material.depthTest = false; o.renderOrder = 61; } });
  // end card: darken the defocused campus behind the logo (in GL, so the logo stays bright)
  const veil = add(new THREE.Mesh(new THREE.PlaneGeometry(24, 40), new THREE.ShaderMaterial({
    transparent: true, depthTest: false, depthWrite: false, uniforms: { uOpacity: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uOpacity; varying vec2 vUv;
      void main(){ vec2 p = (vUv - 0.5) * vec2(24.0, 40.0) / vec2(8.0, 14.0); float r = length(p * vec2(1.0, 0.75));
        float a = mix(0.42, 0.8, smoothstep(0.15, 1.1, r));
        gl_FragColor = vec4(0.03, 0.07, 0.19, a * uOpacity); }`,
  })), camera);
  veil.position.set(0, 0, -20);
  veil.renderOrder = 55;
  for (const o of [ctaPhone.group, qr, logo.group, endPin, ...cards]) o.traverse((c) => { c.castShadow = false; c.receiveShadow = false; });

  // fx
  const PX = 1920 * (ctx.pixelRatio || 1);
  const fxCfg = (pts, a, b, size, extra = {}) => {
    const u = pts.material.uniforms;
    u.uColorA.value.set(a); u.uColorB.value.set(b); u.uSize.value = size; u.uPx.value = PX;
    for (const [k, v] of Object.entries(extra)) u[k].value = v;
    return pts;
  };
  const trailDol = fxCfg(add(makeTrail(arDol.curve, 700, 9)), '#ff9a3c', '#ffe7a8', 0.16, { uLen: 0.12 });
  const trailWc = fxCfg(add(makeTrail(arWc.curve, 300, 19)), '#4fc3ff', '#e6f6ff', 0.16, { uLen: 0.25 });
  const burstArrive = fxCfg(add(makeBurst(380, 17)), '#ffb35a', '#fff1c4', 0.4, { uSpeed: 16, uLife: 1.7, uGrav: 9 });
  const motesGold = fxCfg(add(makeMotes(700, [120, 30, 120], 5)), '#ffd08a', '#fff4dc', 0.2);
  motesGold.position.copy(HERE).add(V(0, 0, -20));
  const dust = fxCfg(add(makeMotes(300, [14, 4, 14], 8)), '#fff3dc', '#ffffff', 0.05);
  dust.position.copy(HERE).add(V(0, 0.4, -2));
  const endMotes = fxCfg(add(makeMotes(260, [9, 9, 5], 23), camera), '#ffd9a0', '#ffffff', 0.05);
  endMotes.position.set(0, -4.5, -9.5);

  const iconURL = (k) => iconCanvas(k, 128).toDataURL();
  const chipItems = TX.chips.map((text, i) => ({ text, icon: iconURL(['wc', 'office', 'shelter'][i]) }));

  // walking speed of the clip (in place) measured from the contact foot
  const walkSpeed = (() => {
    const lf = st.model.getObjectByName('mixamorigLeftFoot'), rf = st.model.getObjectByName('mixamorigRightFoot');
    const n = 60, d = st.dur.walk;
    let acc = 0, prev = null;
    for (let i = 0; i <= n; i++) {
      st.pose({ t: 0, walk: 1, walkPhase: (i / n) * d });
      const a = st.root.worldToLocal(lf.getWorldPosition(V())), b = st.root.worldToLocal(rf.getWorldPosition(V()));
      const c = a.y < b.y ? a : b;
      if (prev && prev.side === (a.y < b.y)) acc += Math.abs(c.z - prev.z);
      prev = { side: a.y < b.y, z: c.z };
    }
    return acc / d;
  })();

  // ---- helpers ------------------------------------------------------------------------
  const setCam = (pos, look, fov = 38, roll = 0) => {
    camera.position.copy(pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(look);
    if (roll) camera.rotateZ(roll);
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld(true);
  };
  const mix3 = (a, b, k) => a.clone().lerp(b, k);
  const project = (p) => { const v = p.clone().project(camera); return [(v.x * 0.5 + 0.5) * 1080, (-v.y * 0.5 + 0.5) * 1920]; };
  const showSprite = (s, scale, opacity = 1) => {
    s.visible = scale > 0.001 && opacity > 0.001;
    const [w, h] = s.userData.baseScale;
    s.scale.set(w * scale, h * scale, 1);
    s.material.opacity = opacity;
  };
  const ringAt = (ring, p, r, op, width = 0.08) => {
    ring.visible = op > 0.001;
    ring.position.set(p.x, p.y + 0.06, p.z);
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
  const dof = (focus, aperture = 0.02, maxblur = 0.009) => {
    post.bokeh.enabled = true;
    const u = post.bokeh.uniforms;
    u.focus.value = focus; u.aperture.value = aperture; u.maxblur.value = maxblur;
  };
  const sun = world.sun, sc = sun.shadow.camera;
  const shadowWide = () => {
    sun.target.position.set(0, 0, 0);
    sc.left = -125; sc.right = 125; sc.top = 100; sc.bottom = -100; sc.near = 10; sc.far = 400;
    sc.updateProjectionMatrix();
  };
  const shadowTight = (c, half = 7) => {
    // crisp shadows on the student for close shots
    const dir = sun.position.clone().sub(sun.target.position).normalize();
    sun.target.position.copy(c);
    sun.position.copy(c).add(dir.multiplyScalar(120));
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.near = 60; sc.far = 200;
    sc.updateProjectionMatrix();
  };
  const caps = (line, t, y = 1600) => OV.captions('cap-' + line, { t, at: VO_AT[line], words: capWords[line], dir: TX.dir, y });
  const topScrim = (t, a, b, k = 1) => OV.scrim('topScrim', { background: 'linear-gradient(to bottom, rgba(5,10,28,0.6) 0%, rgba(5,10,28,0.32) 16%, rgba(5,10,28,0) 32%)', opacity: envelope(t, a, b, 0.5, 0.5) * k });
  const F = () => post.finish.uniforms;
  const phoneScreen = (p, list, t) => {
    let cur = 0;
    for (let i = 0; i < list.length; i++) if (t >= list[i].at) cur = i;
    const c = list[cur], prev = list[Math.max(0, cur - 1)];
    const k = c.dur ? clamp((t - c.at) / c.dur) : 1;
    if (cur > 0 && k < 1) p.show(prev.tex, c.tex, ease.inOutCubic(k), c.mode || 0);
    else p.show(c.tex);
  };

  // ---- the student, per scene ------------------------------------------------------
  // phone raise / walk, as pure functions of t
  const raiseT = T.app + 0.15, lowerT = T.tagline + 0.15;
  const phoneUp = (t) => ease.inOutCubic(remap(t, raiseT, raiseT + 0.85)) * (1 - ease.inOutCubic(remap(t, lowerT, lowerT + 0.7)));
  const walkT0 = T.tagline + 0.45;
  const walkW = (t) => ease.inOutQuad(remap(t, walkT0, walkT0 + 0.9));
  const walkDist = (t) => {
    if (t <= walkT0) return 0;
    const n = 80, b = Math.min(t, walkT0 + 0.9);
    let d = 0;
    for (let i = 0; i < n; i++) d += walkW(walkT0 + ((i + 0.5) / n) * (b - walkT0)) * ((b - walkT0) / n);
    return (d + Math.max(0, t - walkT0 - 0.9)) * walkSpeed * 0.92;
  };
  // where she looks while lost
  const lookAround = (t) => {
    const k = (a, b) => ease.inOutCubic(remap(t, a, b));
    let yaw = 0, pitch = 0;
    yaw += k(5.6, 6.4) * -0.75 + k(6.9, 7.8) * 1.5 + k(8.4, 9.2) * -1.25 + k(9.9, 10.6) * 0.95 + k(11.2, 11.9) * -0.45;
    pitch += k(5.6, 6.4) * -0.15 + k(9.9, 10.6) * 0.1 + k(11.2, 11.9) * 0.05;
    return { yaw, pitch };
  };
  function poseStudent(t) {
    const up = phoneUp(t);
    const w = walkW(t);
    const la = t < T.app + 0.6 ? lookAround(t) : { yaw: 0, pitch: 0 };
    const lookDown = up * 0.55 * (1 - w);
    let pos = HERE.clone(), rotY = Math.PI;
    if (t > walkT0) {
      const d = walkDist(t);
      const u = clamp(d / arDol.len, 0, 0.98);
      pos = arDol.pointAt(u);
      pos.y = 0;
      const tg = arDol.tangentAt(Math.min(0.98, u + 0.01));
      const target = Math.atan2(tg.x, tg.z);
      // turn from facing north to the path direction during the first steps
      let dr = target - Math.PI;
      while (dr > Math.PI) dr -= Math.PI * 2;
      while (dr < -Math.PI) dr += Math.PI * 2;
      rotY = Math.PI + dr * ease.inOutQuad(remap(t, walkT0 - 0.1, walkT0 + 1.0));
    }
    st.root.position.copy(pos);
    st.root.rotation.y = rotY;
    st.pose({
      t: t + 0.6,
      walk: w,
      walkPhase: walkDist(t) / (walkSpeed * 0.92),
      headYaw: la.yaw,
      headPitch: la.pitch + lookDown,
      chestYaw: la.yaw * 0.25,
      phone: up,
    });
  }
  const phoneW = () => st.state.phonePos.clone();

  // camera rigs around the phone (world): k=0 over the right shoulder, k=1 first-person (her eyes)
  const skinHead = () => (st.skin() ? st.skin().MB.Head : st.bones.Head);
  const shoulder = (t, k = 0) => {
    const p = phoneW();
    const a = SL(-1.45, 1.95, -1.75).add(V(wobble(t, 2, 0.02), wobble(t, 5, 0.015), 0));
    const yaw = st.root.rotation.y;
    const fw = V(Math.sin(yaw), 0, Math.cos(yaw));
    const eye = skinHead().getWorldPosition(V()).add(V(0, 0.075, 0)).add(fw.multiplyScalar(0.1));
    const b = eye.add(V(wobble(t, 2, 0.006), wobble(t, 5, 0.005), 0));
    const kk = ease.inOutQuad(k);
    const pos = mix3(a, b, kk);
    const look = mix3(p.clone().add(V(0, 0.06, 0)), p.clone().add(V(0, 0.022, 0)), kk);
    return { pos, look, fov: lerp(25, 37, kk) };
  };

  // screen sequences
  const typeKeys = Object.keys(screens).filter((k) => k.startsWith('02_type')).sort((a, b) => parseInt(a.slice(7)) - parseInt(b.slice(7)));
  const tapSearchT = wt('search', 0) - 0.05;
  const typeT0 = tapSearchT + 0.35;
  const pickT = wt('search', S.search[1]) - 0.1;
  const screenOnT = T.app + 0.55;
  const seqApp = [
    { at: 0, tex: screens['00_home'] },
    { at: tapSearchT + 0.15, tex: screens['01_focus'], mode: 0, dur: 0.25 },
    ...typeKeys.map((k, i) => ({ at: typeT0 + i * Math.min(0.2, (pickT - typeT0 - 0.3) / typeKeys.length), tex: screens[k] })),
    { at: pickT + 0.25, tex: screens['03_route'], mode: 2, dur: 0.4 },
  ];
  const v3dTapT = wt('view3d', S.v3dTap) - 0.05;
  const seqV3d = [
    { at: 0, tex: screens['03_route'] },
    { at: v3dTapT + 0.2, tex: screens['04_3d_b'], mode: 2, dur: 0.5 },
    { at: lineEnd('view3d') - 1.6, tex: screens['05_photo'], mode: 0, dur: 0.35 },
  ];
  const langAt = S.langs.map((i) => wt('langs', i) - 0.12);
  const order = { he: 0, ru: 1, en: 2 };
  const seqLangs = [
    { at: 0, tex: screens['05_photo'] },
    { at: langAt[0], tex: homes.he, mode: 2, dur: 0.35 },
    { at: langAt[1], tex: homes.ru, mode: 1, dur: 0.4 },
    { at: langAt[2], tex: homes.en, mode: 1, dur: 0.4 },
  ];
  const startTapT = wt('start', S.startTap) + 0.1;
  const launchT = wt('start', S.startRoute) - 0.05;
  const arT0 = launchT + 0.5, arT1 = arT0 + 2.4;
  const pressT = wt('chips', S.chipPress);
  const gateT0 = T.route + 1.3, gateT1 = T.route + 3.9;
  const pinT = gateT1 - 0.15;

  // ---- per frame ----------------------------------------------------------------------
  let destHide = false;
  function update(t) {
    destHide = false;
    for (const o of dyn) o.visible = false;
    OV.beginFrame();
    G.uGlowRadius.value = 1e5;
    G.uRing.value = 0;
    G.uWarm.value = 0;
    G.uRevealRadius.value = -1000;
    G.uNight.value = 0;
    G.uTime.value = t;
    campus.root.visible = true;
    campus.buildings.children.forEach((b) => { b.scale.y = 1; b.position.y = 0; b.visible = true; });
    campus.props.scale.y = 1;
    campus.lampGlows.forEach((g) => { g.visible = false; });
    campus.edgeMat.color.set('#7d7568');
    campus.edgeMat.opacity = 0.45;
    st.root.visible = true;
    mountains.visible = true;
    const Fu = F();
    Fu.uFlash.value = 0;
    Fu.uFade.value = 1;
    Fu.uTime.value = t;
    post.bloom.strength = 0.32;
    post.bokeh.enabled = false;
    world.set({ night: 0, fogNear: 160, fogFar: 1100 });
    world.skyU.uStudio.value = 0;
    shadowWide();
    st.phone.uniforms.uBright.value = 0.92;
    st.phone.tap(0, 0, -1);
    st.phone.zoom(1);
    st.phone.uniforms.uSheen.value = 0.3;

    poseStudent(t);
    // the phone's screen
    if (t < T.route + 0.8) phoneScreen(st.phone, seqApp, t);
    else if (t < T.view3d) st.phone.show(screens['03_route']);
    else if (t < T.langs) phoneScreen(st.phone, seqV3d, t);
    else phoneScreen(st.phone, seqLangs, t);
    st.phone.uniforms.uBright.value = 0.92 * ease.outCubic(remap(t, screenOnT, screenOnT + 0.35));

    if (t < T.lost) sceneIntro(t);
    else if (t < T.app) sceneLost(t);
    else if (t < T.search) sceneApp(t);
    else if (t < T.route) sceneSearch(t);
    else if (t < T.start) sceneRoute(t);
    else if (t < T.chips) sceneStart(t);
    else if (t < T.view3d) sceneChips(t);
    else if (t < T.langs) sceneView3d(t);
    else if (t < T.tagline) sceneLangs(t);
    else if (t < T.end) sceneFinale(t);
    else sceneEnd(t);

    // first person: fold the head away once the camera is inside it
    skinHead().scale.setScalar(skinHead().getWorldPosition(V()).add(V(0, 0.08, 0)).distanceTo(camera.position) < 0.3 ? 0.001 : 1);
    // the AR path stays on the ground once it exists
    if (t > arT0 && t < T.end + 2) {
      const dimmed = t > pressT && t < T.view3d + 0.5 ? 0.45 : 1;
      arDol.set(ease.inOutCubic(remap(t, arT0, arT1)), { time: t, opacity: dimmed });
      trailDol.visible = t < arT1 + 1.2;
      trailDol.material.uniforms.uHead.value = ease.inOutCubic(remap(t, arT0, arT1));
      trailDol.material.uniforms.uTime.value = t;
      trailDol.material.uniforms.uOpacity.value = 1 - remap(t, arT1, arT1 + 1.2);
    }
    if (t > pinT && t < T.end + 2) {
      const f = clamp((t - pinT) / 0.35);
      const after = t - pinT - 0.35;
      const squash = after > 0 ? 1 - 0.25 * Math.exp(-after * 7) * Math.cos(after * 24) : 1;
      placePin(DOL.clone().add(V(0, ROOF + lerp(30, 0, ease.inQuad(f)) + (after > 0.8 ? Math.sin(t * 1.8) * 0.25 : 0), 0)), 1.5, t * 0.6, squash);
      if (after > 0 && after < 1.2) ringAt(arriveRing, DOL.clone().add(V(0, ROOF, 0)), lerp(1, 16, ease.outCubic(clamp(after / 1.0))), 1 - clamp(after / 1.0), 0.1);
      destTag.position.copy(DOL).add(V(0, ROOF + 6.6, 0));
      showSprite(destTag, destHide ? 0 : spring(t, pinT + 0.4, { freq: 2.2, damp: 0.5 }));
      if (after > 0 && after < 2) {
        burstArrive.visible = true;
        burstArrive.material.uniforms.uOrigin.value.copy(DOL).add(V(0, ROOF + 0.6, 0));
        burstArrive.material.uniforms.uTime.value = after;
      }
      if (after > 0) {
        pillar.visible = true;
        pillar.position.copy(DOL).add(V(0, ROOF, 0));
        pillar.scale.set(1, Math.max(0.001, ease.outCubic(clamp(after / 0.9))), 1);
        pillar.material.uniforms.uOpacity.value = (0.55 + 0.35 * Math.sin(t * 3)) * (1 - remap(t, T.end - 1, T.end));
        pillar.material.uniforms.uTime.value = t;
      }
    }

    if (ctx.captions) {
      for (const line of ['hook', 'maze', 'reveal', 'search', 'route', 'start', 'chips', 'view3d']) {
        if (line === 'hook' && t > wt('hook', -2) - 0.15) continue;
        caps(line, t);
      }
      OV.scrim('botScrim', { background: 'linear-gradient(to top, rgba(5,10,28,0.5) 0%, rgba(5,10,28,0.22) 13%, rgba(5,10,28,0) 24%)', opacity: envelope(t, VO_AT.hook - 0.2, T.langs, 0.6, 0.4) });
    }
    OV.endFrame();
  }

  // 1. INTRO — above the clouds, dive through them, down to the student ---------------
  const introKeys = [
    { t: 0.0, pos: V(185, 520, 410), look: V(60, 455, 140) },
    { t: 1.5, pos: V(78, 300, 225), look: V(12, 120, 100) },
    { t: 2.5, pos: V(36, 196, 140), look: V(0, 0, 50) },
    { t: 3.9, pos: V(12, 66, 74), look: V(0, 1, 36) },
    { t: 5.3, pos: V(4.5, 9, 43.5), look: V(0, 1.4, 33.4) },
    { t: 6.5, pos: SL(0.9, 1.6, -3.4), look: SL(-0.15, 1.3, 1.5) },
  ];
  const introPos = new THREE.CatmullRomCurve3(introKeys.map((k) => k.pos), false, 'centripetal');
  const introLook = new THREE.CatmullRomCurve3(introKeys.map((k) => k.look), false, 'centripetal');
  const introU = (t) => {
    const tt = clamp(t, 0, introKeys[introKeys.length - 1].t);
    let i = 0;
    while (i < introKeys.length - 2 && tt > introKeys[i + 1].t) i++;
    const f = (tt - introKeys[i].t) / (introKeys[i + 1].t - introKeys[i].t);
    return (i + f) / (introKeys.length - 1);
  };
  const introCam = (t) => {
    // slow start, then the knots' own (decelerating) rhythm
    const tw = t < 1.2 ? 1.2 * ease.inQuad(t / 1.2) * 0.62 + t * 0.38 : t;
    const u = introU(tw);
    return { pos: introPos.getPoint(u), look: introLook.getPoint(u) };
  };
  function sceneIntro(t) {
    const { pos, look } = introCam(t);
    const settle = ease.inOutCubic(remap(t, 6.5, T.lost));
    pos.lerp(SL(0.95, 1.55, -3.5), settle);
    const roll = (1 - ease.outCubic(remap(t, 1.0, 5.0))) * 0.12 * Math.sin(t * 0.9);
    pos.x += wobble(t, 1, 0.6) * (1 - remap(t, 3.5, 5.5));
    setCam(pos, look, lerp(52, 42, ease.inOutQuad(remap(t, 1.5, 6.0))), roll);
    // clouds: only while we are near them; tinted by the sun
    deck.group.visible = t < 3.6;
    deck.update(camera, { opacity: 1 });
    // whiteout as we pass through
    const inCloud = envelope(t, 1.45, 2.65, 0.45, 0.55, ease.inOutQuad, ease.inOutQuad);
    Fu().uFlash.value = inCloud * 0.55;
    post.bloom.strength = 0.32 + inCloud * 0.4;
    world.set({ night: 0, fogNear: lerp(120, 160, remap(t, 2.2, 4)), fogFar: lerp(640, 1100, remap(t, 2.2, 4)) });
    Fu().uFade.value = ease.outQuad(clamp(t / 0.6));
    if (t > 4.8) { shadowTight(HERE.clone().add(V(0, 0, -2)), 9); }
    dust.visible = t > 4.5;
    dust.material.uniforms.uTime.value = t;
    dust.material.uniforms.uOpacity.value = 0.6;
    OV.kicker('day1', { t, tIn: wt('hook', 0) - 0.1, tOut: wt('hook', -2) - 0.3, html: `<span>${TX.hookKicker}</span>`, pill: true, y: 300, size: 56, dir: TX.dir, color: '#0b1220', weight: 800 });
    OV.headline('hook', { t, tIn: wt('hook', -2) - 0.12, tOut: T.lost + 1.2, text: TX.hook, y: 250, size: 150 * HS, dir: TX.dir, style: 'slam', stagger: 0.12, accent: '#4f8dff' });
    topScrim(t, wt('hook', -2) - 0.4, T.lost + 1.4, 0.8);
  }
  const Fu = F;

  // 2. LOST — everything looks the same (orbit + dolly zoom) ----------------------------
  function sceneLost(t) {
    shadowTight(HERE.clone().add(V(0, 0, -2)), 9);
    const C = V(HERE.x, 1.25, HERE.z);
    const k = remap(t, T.lost, T.app);
    const th = lerp(-0.42, 0.22, ease.inOutQuad(remap(t, T.lost, T.lost + 3.2)));
    // vertigo: pull back while narrowing the lens, the subject keeps its size
    const dz = ease.inOutCubic(remap(t, wt('maze', S.maze) - 0.3, T.app - 0.1));
    const fov = lerp(44, 17, dz);
    const r0 = 2.9;
    const r = (r0 * Math.tan((44 * Math.PI) / 360)) / Math.tan((fov * Math.PI) / 360);
    const h = lerp(1.45, 1.6, k);
    const pos = V(C.x + Math.sin(th) * r, h + (r - r0) * 0.06, C.z + Math.cos(th) * r);
    const look = C.clone().add(V(0, lerp(0.15, 0.35, dz), -lerp(1.2, 3, dz)));
    // continuity from the intro's last pose
    const from = SL(0.95, 1.55, -3.5);
    const bk = ease.inOutCubic(remap(t, T.lost, T.lost + 1.0));
    setCam(mix3(from, pos, bk), mix3(SL(-0.15, 1.3, 1.5), look, bk), fov, wobble(t, 3, 0.012));
    dof(camera.position.distanceTo(C), 0.012, 0.005);
    dust.visible = true;
    dust.material.uniforms.uTime.value = t;
    dust.material.uniforms.uOpacity.value = 0.6;
    lostTags.forEach((s, i) => {
      const a = T.lost + 0.35 + i * 0.16;
      s.position.copy(s.userData.base).add(V(0, Math.sin(t * 1.3 + i) * 0.25, 0));
      const out = 1 - remap(t, wt('maze', S.maze) - 0.6, wt('maze', S.maze) + 0.1);
      showSprite(s, spring(t, a, { freq: 2.0, damp: 0.5 }) * 0.95, clamp((t - a) / 0.2) * out);
    });
    lostQ.forEach((s, i) => {
      const a = T.lost + 1.3 + i * 0.3;
      s.position.copy(s.userData.base).add(V(0, Math.sin(t * 2 + i * 2) * 0.3, 0));
      const out = 1 - remap(t, wt('maze', S.maze) - 0.6, wt('maze', S.maze) + 0.1);
      showSprite(s, spring(t, a, { freq: 2.6, damp: 0.38 }) * 1.0, clamp((t - a) / 0.15) * out);
    });
    OV.headline('hook', { t, tIn: wt('hook', -2) - 0.12, tOut: T.lost + 1.2, text: TX.hook, y: 250, size: 150 * HS, dir: TX.dir, style: 'slam', stagger: 0.12, accent: '#4f8dff' });
    topScrim(t, wt('hook', -2) - 0.4, T.app - 0.2, 0.8);
    OV.headline('maze', { t, tIn: wt('maze', S.maze) - 0.1, tOut: T.app - 0.35, text: TX.maze, y: 260, size: 132 * HS, dir: TX.dir, style: 'rise', accent: '#ff5a5a' });
  }

  // 3. APP — the phone comes up, Begin Map opens -------------------------------------------
  function sceneApp(t) {
    shadowTight(HERE.clone().add(V(0, 0, -1)), 5);
    // from the end of the dolly zoom to over the shoulder
    const th = 0.22, r = (2.9 * Math.tan((44 * Math.PI) / 360)) / Math.tan((17 * Math.PI) / 360);
    const from = { pos: V(HERE.x + Math.sin(th) * r, 1.6 + (r - 2.9) * 0.06, HERE.z + Math.cos(th) * r), look: V(HERE.x, 1.6, HERE.z - 3), fov: 17 };
    const sh = shoulder(t, 0);
    const b = ease.inOutCubic(remap(t, T.app, T.app + 1.5));
    setCam(mix3(from.pos, sh.pos, b), mix3(from.look, sh.look, b), lerp(from.fov, sh.fov, b));
    dof(camera.position.distanceTo(phoneW()), 0.02, 0.008);
    // BEGIN MAP rises out of the phone
    const tl = wt('reveal', S.revealLogo) - 0.2;
    const out = ease.inCubic(remap(t, T.search - 0.55, T.search - 0.1));
    if (t > tl) {
      logo.face.color.set('#1d4ed8');
      logo.side.color.set('#0a1f66');
      logo.group.visible = true;
      const sc = 1.5 / logo.group.userData.width;
      logo.group.scale.setScalar(sc);
      logo.group.position.set(0, 1.5 + out * 0.6, -8);
      logo.group.rotation.set(0.04 + wobble(t, 9, 0.03), wobble(t, 7, 0.05), 0);
      logo.letters.forEach((l, i) => {
        const a = tl + i * 0.05;
        const p = ease.outExpo(clamp((t - a) / 0.8));
        const s = spring(t, a, { freq: 1.8, damp: 0.55 });
        l.position.copy(l.userData.home).add(V(0, (1 - p) * -7, (1 - p) * -3 + out * 6));
        l.rotation.set((1 - p) * -1.2, (1 - p) * 0.6, 0);
        l.scale.setScalar(Math.max(0.001, s * (1 - out)));
      });
    }
    topScrim(t, tl - 0.3, T.search - 0.2, 0.7);
    OV.kicker('revealSub', { t, tIn: wt('reveal', S.revealSub) - 0.05, tOut: T.search - 0.4, html: `<span>${TX.revealSub}</span>`, pill: true, y: 560, size: 50, dir: TX.dir, color: '#0b1220', weight: 800 });
  }

  // 4. SEARCH — tight on the screen -------------------------------------------------------
  function sceneSearch(t) {
    shadowTight(HERE.clone().add(V(0, 0, -1)), 4);
    const k = ease.inOutCubic(remap(t, T.search - 0.1, T.search + 0.9));
    const b = shoulder(t, k);
    setCam(b.pos, b.look, b.fov);
    dof(camera.position.distanceTo(phoneW()), 0.03, 0.01);
    st.phone.tap(195, 812, t - tapSearchT);
    if (t > pickT - 0.05) st.phone.tap(195, 716, t - pickT);
    st.phone.uniforms.uSheen.value = 0.1 + remap(t, T.search, T.route) * 0.8;
    topScrim(t, T.search + 0.2, T.route - 0.3);
    const ins = S.search.map((i) => wt('search', i) - 0.05);
    TX.search.forEach((w, i) => {
      OV.headline('search' + i, { t, tIn: ins[i], tOut: i < 2 ? ins[i + 1] - 0.12 : T.route - 0.45, text: w, y: 200, size: 124 * HS, dir: TX.dir, style: 'pop', accent: '#ffb23d' });
    });
  }

  // 5. ROUTE — crane up: the app's route from the gate, with distance and time -----------------
  const aerial = { pos: V(46, 78, 112), look: V(-6, 0, 22), fov: 38 };
  function sceneRoute(t) {
    const b = shoulder(t, 1);
    const k = ease.inOutCubic(remap(t, T.route, T.route + 2.2));
    // pass up and back over her head
    const mid = SL(-0.3, 6, -7);
    const p1 = mix3(b.pos, mid, ease.inQuad(clamp(k * 1.6)));
    const pos = mix3(p1, aerial.pos.clone().add(V(0, 0, -remap(t, T.route, T.start) * 8)), ease.inOutQuad(remap(k, 0.35, 1)));
    const look = mix3(b.look, aerial.look, ease.inOutCubic(remap(k, 0.0, 0.8)));
    setCam(pos, look, lerp(b.fov, aerial.fov, ease.inOutQuad(remap(k, 0, 0.6))));
    if (k < 0.3) dof(camera.position.distanceTo(phoneW()), 0.03 * (1 - k / 0.3), 0.01);
    if (k < 0.5) shadowTight(HERE.clone(), 6);
    const u = ease.inOutCubic(remap(t, gateT0, gateT1));
    routeGate.set(u, { time: t });
    OV.routeCard('rc', { t, tIn: gateT0 + 0.1, tOut: T.start - 0.3, title: TX.room, meta: TX.routeMeta(Math.max(1, Math.round(routesJson.dolphin.meters * u))), dir: TX.dir, y: 1300 });
  }

  const START_HIGH = { pos: V(3.6, 4.4, 39.5), look: V(-8, 0, 15), fov: 44 };
  // 6. START — "you are here": the route leaves the phone ------------------------------------
  function sceneStart(t) {
    const behind = { pos: V(1.3, 1.85, 36.4), look: V(-5, 0.9, 24), fov: 42 };
    const k = ease.inOutCubic(remap(t, T.start, T.start + 1.8));
    const ap = aerial.pos.clone().add(V(0, 0, -8));
    // after the launch: rise a little and look down the path to the pin
    const g = ease.inOutCubic(remap(t, launchT + 0.2, arT1 + 0.4));
    const high = START_HIGH;
    const pos = mix3(mix3(ap, behind.pos, k), high.pos, g);
    const look = mix3(mix3(aerial.look, behind.look, k), high.look, g);
    setCam(pos, look, lerp(lerp(aerial.fov, behind.fov, k), high.fov, g));
    if (k > 0.6) shadowTight(HERE.clone().add(V(0, 0, -4)), 10);
    // the old route from the gate fades when the new start is set
    routeGate.set(1, { time: t, opacity: 1 - clamp((t - startTapT) / 0.6) });
    // tap -> you are here
    st.phone.tap(150, 470, t - startTapT);
    if (t > startTapT) {
      hereDot.visible = true;
      hereDot.position.copy(HERE).add(V(0, 0.0, 0));
      hereDot.scale.setScalar(0.5 * spring(t, startTapT, { freq: 2.4, damp: 0.45 }));
      hereDot.userData.halo.scale.setScalar(1.5 + (Math.sin(t * 4) * 0.5 + 0.5) * 1.6);
      hereRings.forEach((r, i) => { const a = t - startTapT - i * 0.22; if (a > 0) ringAt(r, HERE, lerp(0.4, 4.5, ease.outCubic(clamp(a / 1.0))), 1 - clamp(a / 1.0), 0.14); });
      const [hx, hy] = project(st.root.position.clone().add(V(0, 1.66, 0)));
      OV.tagAt('here', { t, tIn: startTapT + 0.2, tOut: T.chips - 0.5, x: hx, y: hy - 80, text: TX.here, on: true });
    }
    // launch: phone -> ground in front of her feet
    if (t > launchT && t < arT0 + 0.6) {
      const lp = ease.outCubic(remap(t, launchT, arT0));
      const tail = ease.inCubic(remap(t, arT0 - 0.05, arT0 + 0.45));
      launch.set(phoneW(), arDol.pointAt(0.9 / arDol.len).add(V(0, 0.05, 0)), 0.9, lp, { tail, r: 0.018 });
    }
    topScrim(t, wt('start', S.startHead) - 0.4, T.chips - 0.2);
    OV.headline('start', { t, tIn: wt('start', S.startHead) - 0.15, tOut: T.chips - 0.4, text: TX.start, y: 200, size: 122 * HS, dir: TX.dir, style: 'rise', accent: '#5b9bff' });
  }

  // 7. CHIPS — toilets / office / shelter around her --------------------------------------
  function sceneChips(t) {
    const from = START_HIGH;
    const k = remap(t, T.chips, T.view3d);
    const ang = lerp(3.45, 3.75, ease.inOutQuad(k));
    const C = HERE.clone().add(V(2, 4.2, 16));
    const wide = { pos: V(HERE.x + Math.sin(ang) * 24, 12.5, HERE.z + Math.cos(ang) * 24), look: C, fov: 42 };
    const b = ease.inOutCubic(remap(t, T.chips, T.chips + 1.6));
    setCam(mix3(from.pos, wide.pos, b), mix3(from.look, wide.look, b), lerp(from.fov, wide.fov, b));
    shadowTight(HERE.clone().add(V(0, 0, 8)), 34);
    hereDot.visible = true;
    hereDot.position.copy(HERE);
    hereDot.scale.setScalar(0.5);
    hereDot.userData.halo.scale.setScalar(1.5 + (Math.sin(t * 4) * 0.5 + 0.5) * 1.6);
    const at = S.chips.map((i) => wt('chips', i) - 0.05);
    badgeList.forEach((bd) => {
      const ki = ['wc', 'office', 'shelter'].indexOf(bd.userData.kind);
      const a = at[ki] + bd.userData.idx * 0.06;
      const s = spring(t, a, { freq: 2.3, damp: 0.45 });
      const isTarget = bd.userData.id === SR.toilet.to && bd.userData.kind === 'wc';
      const dim = t > pressT ? (isTarget ? 1 : 1 - clamp((t - pressT) / 0.5) * 0.7) : 1;
      const pulse = isTarget && t > pressT ? 1 + 0.15 * Math.sin((t - pressT) * 9) * Math.exp(-(t - pressT) * 1.2) : 1;
      const out = 1 - remap(t, T.view3d - 0.4, T.view3d);
      bd.position.copy(bd.userData.base).add(V(0, Math.sin(t * 1.6 + bd.userData.idx) * 0.3, 0));
      showSprite(bd, s * pulse, clamp((t - a) / 0.12) * dim * out);
      const bm = bd.userData.beam;
      bm.visible = s > 0.01 && out > 0.01;
      bm.scale.set(1, (bd.userData.base.y - 0.6) * clamp(s), 1);
      bm.material.opacity = 0.5 * dim * clamp(s) * out;
    });
    const ut = ease.inOutCubic(remap(t, pressT + 0.2, pressT + 1.6));
    arWc.set(ut, { time: t, opacity: 1 - remap(t, T.view3d - 0.3, T.view3d + 0.3) });
    trailWc.visible = ut > 0.001;
    trailWc.material.uniforms.uHead.value = ut;
    trailWc.material.uniforms.uTime.value = t;
    trailWc.material.uniforms.uOpacity.value = 1 - remap(t, pressT + 1.6, pressT + 2.6);
    OV.chips('chips', { t, tIn: T.chips, tOut: T.view3d - 0.4, y: 240, dir: TX.dir, items: chipItems.map((c, i) => ({ ...c, at: at[i] })), pressIdx: 0, pressAt: pressT, dimOthers: pressT + 0.1 });
  }

  // 8. 3D VIEW + PHOTOS — back on the phone ---------------------------------------------------
  const cardsT = () => wt('view3d', S.v3dCards) - 0.1;
  function sceneView3d(t) {
    shadowTight(HERE.clone().add(V(0, 0, -1)), 4);
    const ang = 3.75;
    const from = { pos: V(HERE.x + Math.sin(ang) * 24, 12.5, HERE.z + Math.cos(ang) * 24), look: HERE.clone().add(V(2, 4.2, 16)), fov: 42 };
    const b = shoulder(t, 1);
    const k = ease.inOutCubic(remap(t, T.view3d - 0.1, T.view3d + 1.3));
    // arc in: come down behind her
    const mid = SL(-1.2, 4.5, -6);
    const pos = k < 1 ? mix3(mix3(from.pos, mid, ease.outQuad(clamp(k * 1.4))), b.pos, ease.inOutQuad(remap(k, 0.3, 1))) : b.pos;
    setCam(pos, mix3(from.look, b.look, ease.inOutCubic(remap(k, 0, 0.7))), lerp(from.fov, b.fov, ease.inOutQuad(remap(k, 0.2, 1))));
    dof(camera.position.distanceTo(phoneW()), 0.03 * k, 0.01);
    st.phone.tap(38, 459, t - v3dTapT);
    st.phone.uniforms.uSheen.value = 0.2 + remap(t, T.view3d, T.langs);
    // photos fly out of the screen and circle the phone (camera space)
    const pc = camera.worldToLocal(phoneW());
    const ct = cardsT();
    const base = (t - ct) * 0.3;
    const out = ease.inCubic(remap(t, T.langs - 0.45, T.langs));
    const scl = -pc.z / 3.6;
    cards.forEach((c, i) => {
      const a = ct + i * 0.13;
      const sp = spring(t, a, { freq: 1.6, damp: 0.6 });
      if (sp <= 0.001) return;
      c.visible = true;
      const th = base + (i / cards.length) * Math.PI * 2;
      const ring = V(Math.sin(th) * 0.95, Math.sin(th * 2 + i) * 0.2 + (i % 2 ? 0.42 : -0.38), Math.cos(th) * 0.9).multiplyScalar(scl).add(pc);
      c.position.copy(pc.clone().lerp(ring, sp)).add(V(0, out * 2 * scl, 0));
      c.scale.setScalar(Math.max(0.001, sp * (1 - out)) * scl);
      c.lookAt(0, 0, 0.6);
      c.rotateZ(Math.sin(th) * 0.06);
    });
    topScrim(t, wt('view3d', S.v3dTap) - 0.4, T.langs - 0.2);
    OV.headline('v3d', { t, tIn: wt('view3d', S.v3dTap) - 0.1, tOut: T.langs - 0.45, text: TX.view3d, y: 190, size: 116 * HS, dir: TX.dir, style: 'rise', accent: '#ff9a3c' });
  }

  // 9. LANGUAGES — the same phone, three languages -------------------------------------------
  function sceneLangs(t) {
    shadowTight(HERE.clone().add(V(0, 0, -1)), 4);
    const b = shoulder(t, 1);
    setCam(b.pos, b.look, b.fov);
    dof(camera.position.distanceTo(phoneW()), 0.03, 0.01);
    st.phone.uniforms.uSheen.value = 0.3 + remap(t, T.langs, T.tagline) * 0.6;
    const xs = rtl ? [800, 540, 280] : [280, 540, 800];
    ['he', 'ru', 'en'].forEach((l, i) => {
      const cur = langAt.reduce((acc, a, j) => (t >= a ? j : acc), -1);
      OV.tagAt('lang' + i, { t, tIn: langAt[i] + 0.05, tOut: T.tagline - 0.3, x: xs[i], y: 1580, text: TX.langs[i], on: cur === i });
    });
  }

  // 10. FINALE — she walks the glowing path in golden light; tagline, CTA ---------------------
  function sceneFinale(t) {
    const warm = ease.inOutQuad(remap(t, T.tagline - 0.3, T.tagline + 2.2));
    G.uWarm.value = warm * 0.85;
    world.set({ night: 0, warm: warm * 0.85, fogNear: 170, fogFar: 1100 });
    post.bloom.strength = 0.4;
    const me = st.root.position.clone();
    const headP = me.clone().add(V(0, 1.2, 0));
    const fwdDir = V(Math.sin(st.root.rotation.y), 0, Math.cos(st.root.rotation.y));
    const b = shoulder(T.tagline, 1);
    // pull back from the phone to a low follow shot behind her, then crane up
    const follow = me.clone().sub(fwdDir.clone().multiplyScalar(3.4)).add(V(0.9, 1.0, 0));
    const k1 = ease.inOutCubic(remap(t, T.tagline, T.tagline + 1.4));
    const u = ease.inOutCubic(remap(t, T.tagline + 1.6, T.end));
    const crane = me.clone().add(V(26, 46, 34));
    let pos = mix3(b.pos, follow, k1).lerp(crane, u);
    let look = mix3(b.look, headP.clone().add(fwdDir.clone().multiplyScalar(6)), k1).lerp(DOL.clone().lerp(me, 0.4), u);
    setCam(pos, look, lerp(b.fov, 40, ease.inOutQuad(remap(t, T.tagline, T.tagline + 1.2))));
    if (k1 < 0.4) dof(camera.position.distanceTo(phoneW()), 0.03 * (1 - k1 / 0.4), 0.01);
    shadowTight(me.clone().add(V(0, 0, -10)), lerp(8, 40, u));
    motesGold.visible = true;
    motesGold.material.uniforms.uTime.value = t;
    motesGold.material.uniforms.uOpacity.value = 0.8 * warm;
    OV.scrim('leak', { background: 'radial-gradient(ellipse at 88% 6%, rgba(255,176,90,0.5), rgba(255,120,40,0.16) 35%, rgba(255,120,40,0) 62%)', opacity: envelope(t, T.tagline, T.end + 4, 1.2, 0.6) * (0.75 + 0.25 * Math.sin(t * 1.3)), blend: 'screen' });
    const [l1, l2] = TX.tagline.split('|');
    topScrim(t, T.tagline + 0.2, T.end - 0.2);
    OV.kicker('tagLogo', { t, tIn: wt('tagline', 0) - 0.05, tOut: T.cta - 0.3, html: '<span class="logo-word" style="font-size:96px">BEGIN MAP</span>', y: 190, size: 96, dir: 'ltr', color: '#fff' });
    OV.headline('tag1', { t, tIn: wt('tagline', S.tag1) - 0.08, tOut: T.cta - 0.3, text: l1, y: 360, size: 132 * HS, dir: TX.dir, style: 'rise' });
    OV.headline('tag2', { t, tIn: wt('tagline', S.tag2) - 0.08, tOut: T.cta - 0.3, text: l2, y: 510, size: 132 * HS, dir: TX.dir, style: 'rise', accent: '#ffd24a' });
    if (t > T.cta) {
      dof(3.6, 0.012, 0.006);
      destHide = true;
      const sp = spring(t, T.cta + 0.1, { freq: 1.3, damp: 0.6 });
      const sq = spring(t, T.cta + 0.35, { freq: 1.3, damp: 0.6 });
      const out = ease.inCubic(remap(t, T.end - 0.4, T.end));
      ctaPhone.group.visible = true;
      ctaPhone.group.position.set(rtl ? -0.27 : 0.27, -0.2 - (1 - sp) * 2.4 - out * 2.5, -3.7);
      ctaPhone.group.scale.setScalar(0.92);
      ctaPhone.group.rotation.set(0.05, (rtl ? 0.3 : -0.3) + Math.sin(t * 0.6) * 0.04, 0);
      ctaPhone.show(screens['04_3d_b']);
      qr.visible = true;
      qr.position.set(rtl ? 0.3 : -0.3, -0.16 - (1 - sq) * 2.4 - out * 2.5, -3.2);
      qr.rotation.set(0.03, (rtl ? -0.22 : 0.22) + Math.sin(t * 0.7) * 0.04, 0);
      qr.scale.setScalar(0.6);
      OV.headline('cta', { t, tIn: T.cta + 0.3, tOut: T.end - 0.35, text: TX.cta, y: 250, size: 132 * HS, dir: TX.dir, style: 'pop', accent: '#ffd24a' });
      OV.kicker('ctaSub', { t, tIn: wt('cta', S.ctaSub) - 0.05, tOut: T.end - 0.35, text: TX.ctaSub, y: 250 + (TX.cta.includes('|') ? 280 : 170) * HS, size: 52, dir: TX.dir, color: '#ffffff', weight: 800 });
    }
  }

  // 11. END CARD — over the golden, defocused campus ---------------------------------------------
  function sceneEnd(t) {
    const warm = 0.85;
    G.uWarm.value = warm;
    world.set({ night: 0, warm, fogNear: 170, fogFar: 1100 });
    const me = st.root.position.clone();
    const k = remap(t, T.end, T.total);
    const pos = me.clone().add(V(26, 46, 34)).add(V(-k * 6, k * 4, 0));
    setCam(pos, DOL.clone().lerp(me, 0.4), 40);
    dof(7, 0.05, 0.014);
    destHide = true;
    shadowTight(me.clone().add(V(0, 0, -10)), 40);
    post.bloom.strength = 0.4;
    veil.visible = true;
    veil.material.uniforms.uOpacity.value = ease.outCubic(remap(t, T.end, T.end + 0.6));
    endMotes.visible = true;
    endMotes.material.uniforms.uTime.value = t;
    endMotes.material.uniforms.uOpacity.value = clamp((t - T.end) / 0.8);
    const sp = spring(t, T.end + 0.05, { freq: 1.4, damp: 0.55 });
    const kk = t - T.end;
    endPin.visible = true;
    endPin.position.set(0, 0.42 + (1 - sp) * -1.5 + Math.sin(kk * 1.6) * 0.04, -7);
    endPin.scale.setScalar(0.36 * Math.max(0.001, sp));
    endPin.rotation.set(0, kk * 0.9 - 0.4, 0);
    logo.group.visible = true;
    logo.face.color.set('#dfe7fb');
    logo.side.color.set('#1d4ed8');
    const sc = 2.25 / logo.group.userData.width;
    logo.group.scale.setScalar(sc);
    logo.group.position.set(0, 0.06, -7);
    logo.group.rotation.set(0.05, Math.sin(kk * 0.8) * 0.08, 0);
    logo.letters.forEach((l, i) => {
      const a = T.end + 0.2 + i * 0.045;
      const p = ease.outExpo(clamp((t - a) / 0.7));
      l.position.copy(l.userData.home).add(V(0, (1 - p) * -0.8, (1 - p) * -3));
      l.rotation.set((1 - p) * -1.0, 0, 0);
      l.scale.setScalar(Math.max(0.001, p));
    });
    OV.block('endSub', { t, tIn: T.end + 0.8, html: `<div class="small" style="direction:${TX.dir};font-size:46px;color:rgba(255,255,255,0.9)">${TX.endSub}</div>`, y: 1060 });
    OV.block('endUrl', { t, tIn: T.end + 1.0, html: '<div class="url">beginmap.github.io/begin-nav</div>', y: 1150 });
    OV.block('credits', { t, tIn: T.end + 1.3, html: `<div class="credits"><span class="lbl" style="direction:${TX.dir}">${TX.creditsLabel}</span>@david.ik. &nbsp;·&nbsp; @liamna01_</div>`, y: 1370 });
    OV.block('idea', { t, tIn: T.end + 1.55, html: `<div class="credits" style="font-size:42px"><span class="lbl" style="direction:${TX.dir}">${TX.ideaLabel}</span>@amitbiton24</div>`, y: 1560 });
    F().uFade.value = 1 - ease.inQuad(remap(t, T.total - 0.9, T.total));
  }

  // ---- cue sheet for the sound design ----------------------------------------------------
  const cues = {
    edit: 'story',
    T,
    voAt: VO_AT,
    voDur: Object.fromEntries(Object.keys(vo.lines).map((k) => [k, vo.lines[k].dur])),
    cloudIn: 1.45,
    cloudOut: 2.65,
    bell: wt('hook', 5),
    land: 6.5,
    hookSlam: wt('hook', -2) - 0.12,
    tags: lostTags.map((s, i) => T.lost + 0.35 + i * 0.16),
    qs: lostQ.map((s, i) => T.lost + 1.3 + i * 0.3),
    vertigo: [wt('maze', S.maze) - 0.3, T.app - 0.1],
    raise: raiseT,
    screenOn: screenOnT,
    logoIn: wt('reveal', S.revealLogo) - 0.2,
    revealSub: wt('reveal', S.revealSub) - 0.05,
    tapSearch: tapSearchT,
    typing: seqApp.filter((x, i) => i >= 2 && i < seqApp.length - 1).map((x) => x.at),
    pick: pickT,
    crane: T.route,
    routeDraw: [gateT0, gateT1],
    pinArrive: pinT + 0.35,
    startTap: startTapT,
    launch: launchT,
    arDraw: [arT0, arT1],
    chips: S.chips.map((i) => wt('chips', i) - 0.05),
    chipPress: pressT,
    toiletRoute: pressT + 0.2,
    v3dIn: T.view3d,
    v3dTap: v3dTapT,
    cards: cards.map((c, i) => cardsT() + i * 0.13),
    langs: langAt,
    tagline: T.tagline,
    walk: walkT0,
    tag1: wt('tagline', S.tag1) - 0.08,
    tag2: wt('tagline', S.tag2) - 0.08,
    cta: T.cta,
    end: T.end,
    total: T.total,
  };

  return { update, cues };
}
