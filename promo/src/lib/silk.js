import * as THREE from 'three';

// "Liquid light": large folded silk sheets that glow at grazing angles, drifting in the
// dark. Folds are analytic (sum of travelling waves), so normals are exact and every frame
// is a pure function of time.

const vert = `
  uniform float uTime, uAmp, uFreq, uSpeed, uTwist, uSeed;
  varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying float vH;
  float h(vec2 p){
    float t = uTime * uSpeed + uSeed;
    float a = sin(p.x * uFreq + p.y * uFreq * 0.35 + t) * 1.0;
    a += sin(p.x * uFreq * 0.53 - p.y * uFreq * 0.8 + t * 0.7 + 1.7) * 0.55;
    a += sin((p.x + p.y) * uFreq * 1.9 + t * 1.3 + uSeed * 2.0) * 0.18;
    return a * uAmp;
  }
  void main(){
    vUv = uv;
    vec3 p = position;
    p.x += sin(p.y * 0.08 + uTime * 0.2 * uSpeed + uSeed) * uTwist;
    float e = 0.05;
    float z = h(p.xy);
    float zx = h(p.xy + vec2(e, 0.0)), zy = h(p.xy + vec2(0.0, e));
    vec3 n = normalize(vec3(-(zx - z) / e, -(zy - z) / e, 1.0));
    p.z += z;
    vH = z / max(uAmp, 0.001);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * n);
    vV = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;

const frag = `
  uniform vec3 uColA, uColB, uColC; uniform float uOpacity, uGlow, uTime;
  varying vec3 vN; varying vec3 vV; varying vec2 vUv; varying float vH;
  void main(){
    float ndv = abs(dot(normalize(vN), normalize(vV)));
    float rim = pow(1.0 - ndv, 5.0);
    float edgeLine = pow(1.0 - ndv, 16.0);
    float crest = smoothstep(0.7, 1.0, vH);
    vec3 c = uColA * 0.12;
    c += uColB * (rim * 0.9 + crest * 0.18);
    c += uColC * (edgeLine * 2.6 + crest * rim * 1.2);
    float edge = smoothstep(0.0, 0.2, vUv.x) * smoothstep(1.0, 0.8, vUv.x) * smoothstep(0.0, 0.22, vUv.y) * smoothstep(1.0, 0.78, vUv.y);
    float a = clamp(rim * 0.9 + crest * 0.12 + 0.03, 0.0, 1.0) * edge * uOpacity;
    gl_FragColor = vec4(c * uGlow, a);
  }`;

export function makeSilk({ w = 90, h = 160, seg = [220, 360], colA = '#0a1f6b', colB = '#1d6bff', colC = '#bfe6ff', amp = 6, freq = 0.09, speed = 0.5, twist = 6, seed = 0, glow = 1 } = {}) {
  const m = new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: false,
    uniforms: {
      uTime: { value: 0 }, uAmp: { value: amp }, uFreq: { value: freq }, uSpeed: { value: speed }, uTwist: { value: twist }, uSeed: { value: seed },
      uColA: { value: new THREE.Color(colA) }, uColB: { value: new THREE.Color(colB) }, uColC: { value: new THREE.Color(colC) },
      uOpacity: { value: 1 }, uGlow: { value: glow },
    },
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h, seg[0], seg[1]), m);
  mesh.frustumCulled = false;
  mesh.renderOrder = -2;
  return mesh;
}

// A set of sheets that make up the background "light sculpture".
export function makeSilkField() {
  const group = new THREE.Group();
  const a = makeSilk({ w: 70, h: 200, seg: [260, 420], colA: '#020a2a', colB: '#1d5bff', colC: '#cfeaff', amp: 9, freq: 0.16, speed: 0.55, twist: 10, seed: 0.3, glow: 1.0 });
  a.position.set(-4, 0, -30);
  a.rotation.set(0.25, 0.65, -0.5);
  const b = makeSilk({ w: 60, h: 190, seg: [240, 400], colA: '#04103a', colB: '#3a7dff', colC: '#ffffff', amp: 7, freq: 0.2, speed: 0.7, twist: 7, seed: 2.1, glow: 0.85 });
  b.position.set(9, -4, -42);
  b.rotation.set(-0.2, -0.6, -0.7);
  const c = makeSilk({ w: 60, h: 180, seg: [240, 400], colA: '#1a0802', colB: '#ff6a10', colC: '#ffe0b0', amp: 8, freq: 0.17, speed: 0.6, twist: 8, seed: 4.2, glow: 0.0 });
  c.position.set(2, 3, -36);
  c.rotation.set(0.1, 0.7, -0.62);
  group.add(a, b, c);
  return { group, sheets: [a, b, c], blue: [a, b], warm: c };
}
