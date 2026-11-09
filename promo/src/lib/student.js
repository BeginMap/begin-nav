import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makePhone } from './phone.js';

// The student: three.js' Mixamo "X Bot" (idle + walk clips), dressed procedurally
// (Begin-blue t-shirt, jeans, sneakers, hair, backpack) and posed per frame, with
// two-bone IK that puts both hands on a real phone showing the app.
// The model is not committed: it is cached in promo/build/cache by tools/make.js,
// with the three.js repository as a fallback.

const GH = 'https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/models/gltf/';
const SRC = ['../build/cache/Xbot.glb', GH + 'Xbot.glb'];
// the visible human: Mixamo "Michelle" (casual clothes), driven by the X Bot skeleton
const SKIN = ['../build/cache/Michelle.glb', GH + 'Michelle.glb'];

async function loadFirst(loader, urls) {
  for (const u of urls) {
    try { return await loader.loadAsync(u); } catch (e) { /* try next */ }
  }
  return null;
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// colour / roughness zones in the model's bind pose (centimetres, T-pose, facing +Z)
const ZONES = /* glsl */ `
  vec3 zoneCol; float zoneRough; float zoneSheen;
  {
    vec3 p = vBind * 100.0;
    float ax = abs(p.x);
    vec3 skin = vec3(0.80, 0.58, 0.45);
    vec3 shirt = vec3(0.13, 0.36, 0.92);
    vec3 jeans = vec3(0.16, 0.21, 0.33);
    vec3 shoe = vec3(0.93, 0.93, 0.92);
    float n = sin(p.x * 3.1 + p.y * 0.7) * sin(p.y * 2.3 - p.z * 1.9) * sin(p.z * 2.9 + p.x * 1.3);
    zoneCol = skin; zoneRough = 0.55; zoneSheen = 0.0;
    bool torso = p.y > 96.5 && p.y < 146.0 && ax < 27.0;
    if (torso) {
      zoneCol = shirt * (0.95 + 0.05 * n); zoneRough = 0.78; zoneSheen = 1.0;
      // collar band + small chest logo dot
      if (p.y > 141.0 && p.z > 0.0) zoneCol = shirt * 0.82;
      if (p.y > 96.5 && p.y < 99.5) zoneCol = shirt * 0.85;
    } else if (p.y <= 96.5 && p.y > 8.0) {
      zoneCol = jeans * (0.9 + 0.1 * n); zoneRough = 0.88; zoneSheen = 0.6;
      if (p.y > 92.0) zoneCol = vec3(0.10, 0.10, 0.12); // belt
    } else if (p.y <= 8.0) {
      zoneCol = shoe; zoneRough = 0.5;
      if (p.y < 2.2) zoneCol = vec3(0.98); // sole
      if (p.y > 6.5) zoneCol = jeans * 0.8; // hem
    }
  }
`;

function dress(mat) {
  const m = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.6, metalness: 0, sheen: 0.0, sheenRoughness: 0.6, sheenColor: new THREE.Color('#9fc0ff') });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBind;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `${ZONES}\nvec4 diffuseColor = vec4( zoneCol, opacity );`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = zoneRough;');
  };
  m.customProgramCacheKey = () => 'student-zones';
  return m;
}

export async function loadStudent(envMap) {
  const loader = new GLTFLoader();
  const gltf = await loadFirst(loader, SRC);
  if (!gltf) throw new Error('student model not found (run tools/make.js once to cache it)');

  const root = new THREE.Group(); // metric, faces +Z
  const model = gltf.scene;
  const S = 0.92; // a teenager, ~1.65 m
  model.scale.setScalar(S);
  root.add(model);
  const bodyMat = dress();
  model.traverse((o) => {
    if (o.isMesh) {
      o.material = bodyMat;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
    }
  });
  const bone = (n) => model.getObjectByName('mixamorig' + n);
  const B = {};
  for (const n of ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand']) B[n] = bone(n);
  const fingers = { Left: [], Right: [] };
  for (const side of ['Left', 'Right']) {
    for (const f of ['Index', 'Middle', 'Ring', 'Pinky']) for (let k = 1; k <= 3; k++) fingers[side].push({ b: bone(`${side}Hand${f}${k}`), k, f });
    for (let k = 1; k <= 3; k++) fingers[side].push({ b: bone(`${side}HandThumb${k}`), k, f: 'Thumb' });
  }

  // ---- hair (cap on the head bone, cut along a hairline) ----------------------
  const surf = model.getObjectByName('Beta_Surface') || model.children.find((c) => c.isSkinnedMesh);
  const headIdx = surf.skeleton.bones.indexOf(B.Head);
  const pos = surf.geometry.attributes.position, si = surf.geometry.attributes.skinIndex, sw = surf.geometry.attributes.skinWeight;
  const hb = new THREE.Box3();
  for (let i = 0; i < pos.count; i++) {
    let best = 0, bi = -1;
    for (let c = 0; c < 4; c++) { const w = sw.getComponent(i, c); if (w > best) { best = w; bi = si.getComponent(i, c); } }
    if (bi === headIdx && best > 0.6) hb.expandByPoint(V(pos.getX(i), pos.getY(i), pos.getZ(i)));
  }
  const hc = hb.getCenter(V()), hs = hb.getSize(V());
  const hairGeo = new THREE.SphereGeometry(1, 64, 48);
  const hairMat = new THREE.MeshPhysicalMaterial({ color: '#2a1a12', roughness: 0.42, sheen: 1, sheenColor: new THREE.Color('#8a5a3c'), sheenRoughness: 0.35 });
  hairMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDir;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvDir = normalize(position);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDir;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
        float line = mix(-0.55, 0.42, smoothstep(-0.9, 0.9, vDir.z)) + 0.06 * sin(atan(vDir.x, vDir.z) * 9.0);
        if (vDir.y < line) discard;
        float strand = 0.85 + 0.15 * sin(atan(vDir.x, vDir.z) * 90.0 + vDir.y * 14.0);
        vec4 diffuseColor = vec4( diffuse * strand, opacity );`);
  };
  hairMat.side = THREE.DoubleSide;
  const hair = new THREE.Mesh(hairGeo, hairMat);
  // head-bone space: bind pose of the head bone is translation only (rotations ~identity)
  B.Head.updateMatrixWorld(true);
  surf.updateMatrixWorld(true);
  const headBind = new THREE.Matrix4().copy(surf.skeleton.boneInverses[headIdx]); // mesh -> head bone (bind)
  const hcBone = hc.clone().applyMatrix4(headBind);
  hs.multiplyScalar(100); // mesh metres -> bone centimetres
  hair.position.copy(hcBone).add(V(0, hs.y * 0.06, -hs.z * 0.03));
  hair.scale.set(hs.x * 0.56, hs.y * 0.57, hs.z * 0.6);
  hair.castShadow = true;
  B.Head.add(hair);

  // ---- backpack ----------------------------------------------------------------
  const packMat = new THREE.MeshPhysicalMaterial({ color: '#1b2a4a', roughness: 0.7, sheen: 0.6, sheenColor: new THREE.Color('#5b7bc0') });
  const accMat = new THREE.MeshStandardMaterial({ color: '#ff9a3c', roughness: 0.45 });
  const pack = new THREE.Group();
  const bodyP = new THREE.Mesh(new RoundedBoxGeometry(30, 40, 15, 5, 5), packMat);
  const pocket = new THREE.Mesh(new RoundedBoxGeometry(24, 17, 6, 4, 3), packMat);
  pocket.position.set(0, -9, -9);
  const zip = new THREE.Mesh(new THREE.BoxGeometry(20, 0.9, 1), accMat);
  zip.position.set(0, -0.6, -12.1);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.8, 8, 20, Math.PI), packMat);
  handle.position.set(0, 20, -1);
  pack.add(bodyP, pocket, zip, handle);
  // straps: tubes from the top of the pack, over the shoulders, down the chest
  const strapMat = new THREE.MeshStandardMaterial({ color: '#121a2e', roughness: 0.8 });
  for (const sx of [-1, 1]) {
    const c = new THREE.CatmullRomCurve3([V(sx * 8, 17, 4), V(sx * 9.5, 24, 13), V(sx * 10, 22.5, 24), V(sx * 10.5, 10, 28.5), V(sx * 11.5, -10, 26), V(sx * 12, -18, 10)]);
    const st = new THREE.Mesh(new THREE.TubeGeometry(c, 40, 1.4, 8, false), strapMat);
    st.scale.set(1, 1, 1);
    pack.add(st);
  }
  pack.position.set(0, 2, -21);
  pack.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  B.Spine2.add(pack);

  // ---- phone ---------------------------------------------------------------------
  const phone = makePhone(envMap);
  phone.group.scale.setScalar(0.1);
  phone.group.traverse((o) => { o.castShadow = false; });
  root.add(phone.group);

  // ---- animation ------------------------------------------------------------------
  const mixer = new THREE.AnimationMixer(model);
  const clip = (n) => gltf.animations.find((c) => c.name === n);
  const acts = {};
  for (const n of ['idle', 'walk']) {
    const a = mixer.clipAction(clip(n));
    a.play();
    acts[n] = a;
  }
  const dur = { idle: clip('idle').duration, walk: clip('walk').duration };

  // ---- IK helpers -------------------------------------------------------------------
  const tmp = { a: V(), b: V(), c: V(), q: new THREE.Quaternion(), q2: new THREE.Quaternion(), m: new THREE.Matrix4() };
  const wpos = (o, out = V()) => o.getWorldPosition(out);
  const setWorldQuat = (o, qw) => {
    o.parent.getWorldQuaternion(tmp.q2);
    o.quaternion.copy(tmp.q2.invert().multiply(qw));
    o.updateMatrixWorld(true);
  };
  const swing = (o, from, to) => {
    // rotate bone o (world) so that direction `from` maps onto `to`
    const d = new THREE.Quaternion().setFromUnitVectors(from.clone().normalize(), to.clone().normalize());
    const qw = o.getWorldQuaternion(new THREE.Quaternion());
    setWorldQuat(o, d.multiply(qw));
  };
  function solveArm(side, target, pole, w, BB = B) {
    if (w <= 0.001) return;
    const up = BB[side + 'Arm'], fo = BB[side + 'ForeArm'], ha = BB[side + 'Hand'];
    const save = [up.quaternion.clone(), fo.quaternion.clone()];
    const S0 = wpos(up), E0 = wpos(fo), H0 = wpos(ha);
    const a = S0.distanceTo(E0), b = E0.distanceTo(H0);
    const toT = target.clone().sub(S0);
    const d = Math.min(Math.max(toT.length(), Math.abs(a - b) + 1e-3), a + b - 1e-3);
    const dir = toT.normalize();
    const x = (a * a - b * b + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, a * a - x * x));
    const pp = pole.clone().sub(S0);
    const perp = pp.sub(dir.clone().multiplyScalar(pp.dot(dir))).normalize();
    const E = S0.clone().add(dir.clone().multiplyScalar(x)).add(perp.multiplyScalar(h));
    swing(up, E0.clone().sub(S0), E.clone().sub(S0));
    const H1 = wpos(ha), E1 = wpos(fo);
    swing(fo, H1.clone().sub(E1), target.clone().sub(E1));
    if (w < 0.999) {
      up.quaternion.copy(save[0].slerp(up.quaternion, w));
      fo.quaternion.copy(save[1].slerp(fo.quaternion, w));
      up.updateMatrixWorld(true);
    }
  }
  // hand frames in the root space: bind pose fingers point along -X (right) / +X (left), palm -Y
  const handBasis = (side, X, Y, Z) => {
    // target: palm against the back of the phone, fingers up along it (hidden from her view),
    // splayed a little outwards
    const out = side === 'Right' ? 1 : -1;
    const f = Y.clone().multiplyScalar(0.94).add(X.clone().multiplyScalar(0.34 * out)).normalize();
    const p = Z.clone();
    const a1 = side === 'Right' ? V(-1, 0, 0) : V(1, 0, 0), a2 = V(0, -1, 0);
    const A = new THREE.Matrix4().makeBasis(a1, a2, a1.clone().cross(a2));
    const Bm = new THREE.Matrix4().makeBasis(f, p, f.clone().cross(p));
    return new THREE.Quaternion().setFromRotationMatrix(Bm.multiply(A.transpose()));
  };
  const GRIP = { Right: [0.42, -0.95, -0.42], Left: [-0.42, -0.95, -0.42] };
  const state = { phonePos: V(), phoneQuat: new THREE.Quaternion() };
  const qCurl = new THREE.Quaternion();
  const AX = { Right: V(0, 0, 1), Left: V(0, 0, -1) };

  /**
   * Pose for this frame. All inputs are plain numbers so any frame can be rendered alone.
   * o: { t, walk (0..1 blend), walkPhase (s), headYaw, headPitch, phone (0..1 raise), phoneTilt, look (0..1 look at phone), tap }
   */
  function pose(o) {
    const wWalk = o.walk || 0;
    acts.idle.setEffectiveWeight(1 - wWalk);
    acts.walk.setEffectiveWeight(wWalk);
    acts.idle.time = (o.t || 0) % dur.idle;
    acts.walk.time = (o.walkPhase || 0) % dur.walk;
    mixer.update(0);
    root.updateMatrixWorld(true);

    // head / neck look
    const yaw = o.headYaw || 0, pitch = o.headPitch || 0;
    const qy = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), yaw * 0.5);
    const qp = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), pitch * 0.5);
    B.Neck.quaternion.premultiply(qy).premultiply(qp);
    B.Head.quaternion.premultiply(qy).premultiply(qp);
    if (o.chestYaw) B.Spine1.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), o.chestYaw));
    root.updateMatrixWorld(true);

    // phone in front of the chest, screen towards the eyes
    const r = o.phone || 0;
    const rest = { p: V(0.2, 0.86, 0.06), tilt: -1.4 }; // tucked by the hip
    const held = { p: V(0.0, 1.13 + (o.phoneLift || 0), 0.33), tilt: 0.62 + (o.phoneTilt || 0) };
    const pp = rest.p.clone().lerp(held.p, r);
    phone.group.position.copy(pp);
    const eye = V(0, 1.55, 0.06);
    const look = new THREE.Object3D();
    look.position.copy(pp);
    look.lookAt(eye.clone().lerp(pp.clone().add(V(0, -1, 0.3)), 1 - r));
    phone.group.quaternion.copy(look.quaternion);
    phone.group.visible = r > 0.02;
    phone.group.updateMatrixWorld(true);

    if (r > 0.001) {
      const M = phone.group.matrixWorld;
      const X = V(), Y = V(), Z = V();
      phone.group.matrix.extractBasis(X, Y, Z);
      X.normalize(); Y.normalize(); Z.normalize();
      // hands in root space -> world
      const loc = (x, y, z) => V(x, y, z).applyMatrix4(M);
      const k = Math.min(1, r * 1.4);
      const tapR = o.tap ? Math.sin(Math.min(1, Math.max(0, o.tap)) * Math.PI) : 0;
      const rw = (x, y, z) => V(x, y, z).applyMatrix4(root.matrixWorld);
      solveArm('Right', loc(...GRIP.Right), rw(-0.5, 0.7, -0.1), k);
      solveArm('Left', loc(...GRIP.Left), rw(0.5, 0.7, -0.1), k);
      const rootQ = root.getWorldQuaternion(new THREE.Quaternion());
      for (const side of ['Right', 'Left']) {
        const hq = rootQ.clone().multiply(handBasis(side, X, Y, Z));
        const ha = B[side + 'Hand'];
        const cur = ha.getWorldQuaternion(new THREE.Quaternion());
        setWorldQuat(ha, cur.slerp(hq, k));
        // curl fingers around the phone edge
        for (const { b, k: j, f } of fingers[side]) {
          if (!b) continue;
          if (f === 'Thumb') {
            qCurl.setFromAxisAngle(V(0, 1, 0), (side === 'Right' ? 1 : -1) * (j === 1 ? 0.35 : 0.2) * k);
          } else {
            qCurl.setFromAxisAngle(AX[side], (j === 1 ? 0.45 : 0.35) * k);
          }
          b.quaternion.multiply(qCurl);
        }
      }
      root.updateMatrixWorld(true);
    }
    if (skin) retarget(r);
    state.phonePos.setFromMatrixPosition(phone.group.matrixWorld);
    phone.group.getWorldQuaternion(state.phoneQuat);
  }

  // ---- human skin: copy the driver's pose bone by bone (world-space deltas from T-pose) ----
  let skin = null;
  const sg = await loadFirst(loader, SKIN);
  if (sg) {
    const mModel = sg.scene;
    const SM = 0.97;
    mModel.scale.setScalar(SM);
    root.add(mModel);
    mModel.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        o.frustumCulled = false;
        const m = o.material;
        for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) if (m[k]) { m[k].anisotropy = 8; }
        m.metalness = 0;
        m.metalnessMap = null;
        m.roughnessMap = null; // the source stores glossiness there
        m.roughness = 0.62;
        m.envMap = envMap;
        m.envMapIntensity = 0.3;
        m.needsUpdate = true;
      }
    });
    // reference pose: the skin's own T-pose clip; the driver's bind pose is a T-pose with identity rotations
    const tpClip = sg.animations.find((c) => c.name === 'TPose');
    const mm = new THREE.AnimationMixer(mModel);
    if (tpClip) { mm.clipAction(tpClip).play(); mm.update(0); }
    root.updateMatrixWorld(true);
    const rootQinv = root.getWorldQuaternion(new THREE.Quaternion()).invert();
    const pairs = [];
    mModel.traverse((o) => {
      if (!o.isBone) return;
      const x = model.getObjectByName(o.name);
      if (!x) return;
      pairs.push({ x, m: o, ref: rootQinv.clone().multiply(o.getWorldQuaternion(new THREE.Quaternion())) });
    });
    mm.stopAllAction();
    const mb = (n) => mModel.getObjectByName('mixamorig' + n);
    const MB = { Arm: null };
    for (const n of ['Hips', 'Spine2', 'Head', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand']) MB[n] = mb(n);
    const mHips0 = root.worldToLocal(MB.Hips.getWorldPosition(V()));
    const xHips0 = root.worldToLocal(B.Hips.getWorldPosition(V()));
    const hipK = mHips0.y / xHips0.y;
    // the driver's dressing is not needed any more
    model.visible = false;
    hair.visible = false;
    pack.removeFromParent();
    pack.position.set(0, 4, -17);
    pack.scale.setScalar(0.9);
    MB.Spine2.add(pack);
    skin = { model: mModel, pairs, MB, hipK, mHips0 };
  }
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion();
  function retarget(r) {
    const rq = root.getWorldQuaternion(new THREE.Quaternion());
    const rqi = rq.clone().invert();
    for (const p of skin.pairs) {
      p.x.getWorldQuaternion(qa);
      qb.copy(rqi).multiply(qa).multiply(p.ref);
      setWorldQuat(p.m, rq.clone().multiply(qb));
    }
    // hips: same motion, scaled to the skin's leg length
    const xh = root.worldToLocal(B.Hips.getWorldPosition(V()));
    const target = root.localToWorld(V(xh.x * skin.hipK, xh.y * skin.hipK, xh.z * skin.hipK));
    const hp = skin.MB.Hips;
    hp.position.copy(hp.parent.worldToLocal(target));
    hp.updateMatrixWorld(true);
    // re-run the arm IK on the skin so its own hands land on the phone
    if (r > 0.001) {
      const k = Math.min(1, r * 1.4);
      const M = phone.group.matrixWorld;
      const loc = (x, y, z) => V(x, y, z).applyMatrix4(M);
      const rw = (x, y, z) => V(x, y, z).applyMatrix4(root.matrixWorld);
      const handQ = {};
      for (const side of ['Right', 'Left']) handQ[side] = skin.MB[side + 'Hand'].getWorldQuaternion(new THREE.Quaternion());
      solveArm('Right', loc(...GRIP.Right), rw(-0.5, 0.7, -0.1), k, skin.MB);
      solveArm('Left', loc(...GRIP.Left), rw(0.5, 0.7, -0.1), k, skin.MB);
      for (const side of ['Right', 'Left']) setWorldQuat(skin.MB[side + 'Hand'], handQ[side]);
    }
  }

  const headWorld = (out = V()) => B.Head.getWorldPosition(out);
  return { root, model, phone, pose, bones: B, headWorld, state, dur, S, skin: () => skin };
}
