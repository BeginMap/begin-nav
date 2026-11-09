import * as THREE from 'three';
import { px2w } from './util.js';
import { glowSprite } from './labels.js';

// AR walking path: a flat glowing ribbon on the ground with flowing chevrons that
// draws itself (uProg), plus a "launch" arc that shoots from the phone to the ground.

const ribbonFrag = /* glsl */ `
uniform float uProg, uTime, uLen, uOpacity, uWidthM;
uniform vec3 uColor;
varying vec2 vUv;
void main(){
  float s = vUv.x * uLen;              // metres along the path
  float head = uProg * uLen;
  if (s > head) discard;
  float x = abs(vUv.y - 0.5) * 2.0;    // 0 centre .. 1 edge
  float edge = smoothstep(1.0, 0.86, x);
  float rim = smoothstep(0.62, 0.86, x) * edge;
  // chevrons pointing along the walking direction, flowing forward
  float k = fract((s - abs(vUv.y - 0.5) * uWidthM * 0.9) / 1.6 - uTime * 0.9);
  float chev = smoothstep(0.0, 0.08, k) * smoothstep(0.42, 0.3, k) * smoothstep(0.75, 0.45, x);
  vec3 c = uColor * (0.85 + 0.5 * rim) + vec3(1.0, 0.96, 0.88) * chev * 0.9;
  // bright, hot head + a soft start fade
  float h = smoothstep(head - 2.5, head, s);
  c += vec3(1.0, 0.92, 0.75) * h * 1.2;
  float a = edge * (0.82 + 0.18 * chev) * uOpacity * smoothstep(0.0, 0.6, s);
  gl_FragColor = vec4(c * 1.35, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const glowFrag = /* glsl */ `
uniform float uProg, uLen, uOpacity; uniform vec3 uColor; varying vec2 vUv;
void main(){
  float s = vUv.x * uLen; if (s > uProg * uLen) discard;
  float x = abs(vUv.y - 0.5) * 2.0;
  float a = pow(1.0 - x, 2.2) * 0.42 * uOpacity * smoothstep(0.0, 1.0, s);
  gl_FragColor = vec4(uColor * 1.2, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const vert = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

function ribbon(curve, len, width, y) {
  const n = Math.max(80, Math.round(len * 6));
  const pos = [], uv = [], idx = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    t.y = 0;
    t.normalize();
    const side = new THREE.Vector3().crossVectors(t, up).multiplyScalar(width / 2);
    pos.push(p.x - side.x, y, p.z - side.z, p.x + side.x, y, p.z + side.z);
    uv.push(u, 0, u, 1);
    if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

export function makeARPath(pts, { color = '#ff7a1a', width = 0.8, y = 0.05, prefix = [] } = {}) {
  const v3 = [...prefix, ...pts.map(([x, yy]) => { const [X, Z] = px2w(x, yy); return new THREE.Vector3(X, 0, Z); })];
  const curve = new THREE.CatmullRomCurve3(v3, false, 'centripetal');
  const len = curve.getLength();
  const uniforms = {
    uProg: { value: 0 }, uTime: { value: 0 }, uLen: { value: len }, uOpacity: { value: 1 },
    uWidthM: { value: width }, uColor: { value: new THREE.Color(color) },
  };
  const group = new THREE.Group();
  const main = new THREE.Mesh(ribbon(curve, len, width, y + 0.02), new THREE.ShaderMaterial({
    uniforms, vertexShader: vert, fragmentShader: ribbonFrag, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  }));
  main.renderOrder = 7;
  const glow = new THREE.Mesh(ribbon(curve, len, width * 4.5, y), new THREE.ShaderMaterial({
    uniforms, vertexShader: vert, fragmentShader: glowFrag, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  glow.renderOrder = 6;
  const head = glowSprite('#ffd7a0', width * 4);
  head.material.depthTest = true;
  group.add(glow, main, head);

  const api = {
    group, curve, len, uniforms,
    set(prog, { time = 0, opacity = 1 } = {}) {
      uniforms.uProg.value = prog;
      uniforms.uTime.value = time;
      uniforms.uOpacity.value = opacity;
      group.visible = prog > 0.0001 && opacity > 0.001;
      const p = curve.getPointAt(Math.min(0.999, Math.max(0, prog)));
      head.position.set(p.x, y + 0.35, p.z);
      head.material.opacity = opacity * (prog < 0.995 ? 1 : 0.3);
    },
    pointAt(u) { return curve.getPointAt(Math.min(1, Math.max(0, u))); },
    tangentAt(u) { return curve.getTangentAt(Math.min(1, Math.max(0, u))); },
  };
  api.set(0);
  return api;
}

// A glowing arc (tube) between two moving points — the route leaving the phone.
export function makeLaunchArc(color = '#ffb066') {
  const N = 64;
  const geo = new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(), new THREE.Vector3(0, 1, 0)), N, 1, 10, false);
  const uniforms = { uProg: { value: 0 }, uTail: { value: 0 }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uProg, uTail, uOpacity; uniform vec3 uColor; varying vec2 vUv;
      void main(){ if (vUv.x > uProg || vUv.x < uTail) discard;
        float h = smoothstep(uProg - 0.12, uProg, vUv.x);
        vec3 c = uColor * 1.6 + vec3(1.0, 0.95, 0.85) * (0.6 + 1.6 * h);
        gl_FragColor = vec4(c, uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 8;
  mesh.frustumCulled = false;
  const head = glowSprite('#ffe2b8', 0.9);
  const group = new THREE.Group();
  group.add(mesh, head);
  const tmpCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3());
  return {
    group,
    // a -> b with a lifted control point; r = tube radius
    set(a, b, lift, prog, { tail = 0, r = 0.02, opacity = 1 } = {}) {
      group.visible = prog > tail + 0.001 && opacity > 0.001;
      if (!group.visible) return;
      tmpCurve.v0.copy(a);
      tmpCurve.v2.copy(b);
      tmpCurve.v1.copy(a).lerp(b, 0.5).add(new THREE.Vector3(0, lift, 0));
      const g = new THREE.TubeGeometry(tmpCurve, N, r, 10, false);
      mesh.geometry.dispose();
      mesh.geometry = g;
      uniforms.uProg.value = prog;
      uniforms.uTail.value = tail;
      uniforms.uOpacity.value = opacity;
      head.position.copy(tmpCurve.getPoint(Math.min(1, prog)));
      head.material.opacity = opacity;
      head.scale.setScalar(r * 30);
    },
  };
}
