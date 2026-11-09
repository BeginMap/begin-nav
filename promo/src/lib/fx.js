import * as THREE from 'three';
import { rng } from './util.js';

// GPU particle effects and atmospherics. Every effect is a pure function of time
// (all motion is computed in the vertex shader from uniforms), so any frame can be
// rendered on its own and sub-frames for motion blur stay consistent.

const softPointFrag = `
  uniform vec3 uColorA, uColorB; uniform float uOpacity;
  varying float vA; varying float vMix;
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float r = length(c) * 2.0;
    float a = smoothstep(1.0, 0.0, r);
    a = a * a;
    float core = smoothstep(0.35, 0.0, r);
    vec3 col = mix(uColorA, uColorB, vMix) * (1.0 + core * 1.5);
    gl_FragColor = vec4(col, a * vA * uOpacity);
    if (gl_FragColor.a < 0.003) discard;
  }`;

function pointsMaterial(uniforms, vertexShader) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColorA: { value: new THREE.Color('#ffd28a') },
      uColorB: { value: new THREE.Color('#ffffff') },
      uOpacity: { value: 1 },
      uTime: { value: 0 },
      uSize: { value: 1 },
      uPx: { value: 1920 },
      ...uniforms,
    },
    vertexShader,
    fragmentShader: softPointFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
}

// Floating motes (fireflies at night, dust in golden light) inside a box.
export function makeMotes(count = 700, size = [160, 26, 130], seed = 3) {
  const R = rng(seed);
  const pos = new Float32Array(count * 3);
  const sd = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (R() - 0.5) * size[0];
    pos[i * 3 + 1] = R() * size[1];
    pos[i * 3 + 2] = (R() - 0.5) * size[2];
    sd.set([R(), R(), R(), R()], i * 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 4));
  const m = pointsMaterial({ uH: { value: size[1] } }, `
    attribute vec4 aSeed; uniform float uTime, uSize, uPx, uH; varying float vA; varying float vMix;
    void main(){
      vec3 p = position;
      float t = uTime;
      p.x += sin(t * (0.3 + aSeed.x * 0.5) + aSeed.y * 6.28) * 2.2;
      p.z += cos(t * (0.25 + aSeed.z * 0.4) + aSeed.w * 6.28) * 2.2;
      p.y = mod(p.y + t * (0.4 + aSeed.x * 0.8), uH);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      float tw = 0.55 + 0.45 * sin(t * (2.0 + aSeed.w * 3.0) + aSeed.z * 20.0);
      vA = tw * smoothstep(0.0, 2.0, p.y) * smoothstep(uH, uH - 4.0, p.y);
      vMix = aSeed.y;
      gl_PointSize = uSize * (0.5 + aSeed.z) * uPx / max(1.0, -mv.z) * 0.6;
    }`);
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.renderOrder = 25;
  return pts;
}

// One-shot burst of sparks from a point: outward + up, drag and gravity.
export function makeBurst(count = 500, seed = 7) {
  const R = rng(seed);
  const dir = new Float32Array(count * 3);
  const sd = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const a = R() * Math.PI * 2;
    const up = 0.15 + R() * 0.85;
    const h = Math.sqrt(1 - up * up);
    dir.set([Math.cos(a) * h, up, Math.sin(a) * h], i * 3);
    sd.set([R(), R(), R(), R()], i * 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 4));
  const m = pointsMaterial({ uOrigin: { value: new THREE.Vector3() }, uSpeed: { value: 30 }, uLife: { value: 2.2 }, uGrav: { value: 9 } }, `
    attribute vec3 aDir; attribute vec4 aSeed; uniform float uTime, uSize, uPx, uSpeed, uLife, uGrav; uniform vec3 uOrigin;
    varying float vA; varying float vMix;
    void main(){
      float t = uTime;
      float life = uLife * (0.45 + aSeed.x * 0.75);
      float k = 2.2;
      float sp = uSpeed * (0.35 + aSeed.y * 0.9);
      vec3 p = uOrigin + aDir * sp * (1.0 - exp(-k * t)) / k;
      p.y += -0.5 * uGrav * t * t * (0.3 + aSeed.z * 0.7);
      p.y = max(p.y, 0.15);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      vA = (t > 0.0 ? 1.0 : 0.0) * smoothstep(life, life * 0.3, t) * (0.6 + 0.4 * sin(t * 30.0 + aSeed.w * 40.0));
      vMix = aSeed.w;
      gl_PointSize = uSize * (0.4 + aSeed.z * 1.1) * uPx / max(1.0, -mv.z) * 0.5;
    }`);
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.renderOrder = 26;
  return pts;
}

// Sparkling trail that follows the head of a route (curve in world space).
export function makeTrail(curve, count = 900, seed = 9) {
  const R = rng(seed);
  const pos = new Float32Array(count * 3);
  const sd = new Float32Array(count * 4);
  const p = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const u = R();
    curve.getPointAt(u, p);
    pos.set([p.x + (R() - 0.5) * 1.6, p.y + R() * 0.6, p.z + (R() - 0.5) * 1.6], i * 3);
    sd.set([u, R(), R(), R()], i * 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 4));
  const m = pointsMaterial({ uHead: { value: 0 }, uLen: { value: 0.16 } }, `
    attribute vec4 aSeed; uniform float uTime, uSize, uPx, uHead, uLen; varying float vA; varying float vMix;
    void main(){
      float age = (uHead - aSeed.x) / uLen;
      vec3 p = position;
      p.y += max(age, 0.0) * (2.0 + aSeed.y * 4.0);
      p.x += sin(uTime * 3.0 + aSeed.z * 30.0) * 0.3 * max(age, 0.0);
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_Position = projectionMatrix * mv;
      vA = step(0.0, age) * smoothstep(1.0, 0.0, age) * (0.5 + 0.5 * sin(uTime * 12.0 + aSeed.w * 50.0));
      vMix = aSeed.y;
      gl_PointSize = uSize * (0.5 + aSeed.z) * uPx / max(1.0, -mv.z) * 0.55;
    }`);
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.renderOrder = 27;
  return pts;
}

// Soft volumetric-looking cloud sheet for the opening dive.
function cloudTexture(seed) {
  const R = rng(seed);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x = 128 + (R() - 0.5) * 150, y = 128 + (R() - 0.5) * 70, r = 30 + R() * 60;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.32)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 256, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function makeClouds(count = 46, seed = 13) {
  const R = rng(seed);
  const group = new THREE.Group();
  const texs = [0, 1, 2, 3].map((k) => cloudTexture(seed + k));
  for (let i = 0; i < count; i++) {
    const m = new THREE.SpriteMaterial({ map: texs[i % 4], transparent: true, depthWrite: false, fog: false, color: '#9fb2d6', opacity: 0.9 });
    const s = new THREE.Sprite(m);
    const ang = R() * Math.PI * 2, rad = 30 + R() * 220;
    s.position.set(-30 + Math.cos(ang) * rad, 150 + R() * 110, 120 + Math.sin(ang) * rad);
    const sc = 90 + R() * 120;
    s.scale.set(sc, sc * 0.55, 1);
    s.renderOrder = 15;
    group.add(s);
  }
  return group;
}

// Holographic ground grid with a radial sweep (for the "map becomes 3D" moment).
export function makeHoloGrid(w = 240, h = 200) {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uR: { value: 0 }, uOpacity: { value: 0 }, uCenter: { value: new THREE.Vector2() }, uColor: { value: new THREE.Color('#45c3ff') } },
    // grid in the plane's own (metre) coordinates so it also works inside a scaled diorama
    vertexShader: `varying vec3 vW; void main(){ vW = vec3(position.x, 0.0, -position.y); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uR, uOpacity; uniform vec2 uCenter; uniform vec3 uColor; varying vec3 vW;
      void main(){
        vec2 g = abs(fract(vW.xz / 4.0) - 0.5);
        float line = smoothstep(0.47, 0.5, max(g.x, g.y));
        vec2 g2 = abs(fract(vW.xz / 20.0) - 0.5);
        float major = smoothstep(0.485, 0.5, max(g2.x, g2.y));
        float d = distance(vW.xz, uCenter);
        float front = exp(-pow((d - uR) / 3.0, 2.0));
        float inside = smoothstep(uR + 2.0, uR - 25.0, d) * smoothstep(uR - 70.0, uR - 25.0, d);
        float a = (line * 0.35 + major * 0.6) * (inside * 0.8 + front * 2.0) + front * 0.35;
        gl_FragColor = vec4(uColor * 2.2, a * uOpacity);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.12;
  mesh.renderOrder = 4;
  return mesh;
}

// Vertical light pillar (destination marker / badges).
export function makePillar(color = '#ffb35a', height = 60, radius = 1.6) {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity, uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        float edge = pow(abs(dot(vN, vV)), 1.5);
        float fade = pow(1.0 - vUv.y, 1.6);
        float bands = 0.75 + 0.25 * sin(vUv.y * 40.0 - uTime * 6.0);
        gl_FragColor = vec4(uColor * 1.8, edge * fade * bands * uOpacity * 0.7);
      }`,
  });
  const geo = new THREE.CylinderGeometry(radius, radius * 1.25, height, 32, 1, true);
  geo.translate(0, height / 2, 0);
  const mesh = new THREE.Mesh(geo, m);
  mesh.renderOrder = 7;
  return mesh;
}
