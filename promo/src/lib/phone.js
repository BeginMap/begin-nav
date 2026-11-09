import * as THREE from 'three';

// A modern phone built from primitives, with a screen shader that cross-fades /
// slides between real Begin Map screenshots and draws touch indicators.

export const SCREEN_W = 0.672, SCREEN_H = 1.454; // 390 x 844 css px aspect
const BODY_W = 0.716, BODY_H = 1.5, DEPTH = 0.052, CORNER = 0.118;

function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

const screenVert = `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;

const screenFrag = `
uniform sampler2D uA, uB; uniform float uMix, uMode, uBright, uSheen, uZoom;
uniform vec2 uZoomC;
uniform vec4 uTap; // x,y in uv, age (s), strength
uniform vec2 uSize; uniform float uRad;
varying vec2 vUv; varying vec3 vN; varying vec3 vV;
float sdRound(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q,0.0)) + min(max(q.x,q.y),0.0) - r; }
vec2 zoomUv(vec2 uv){ return (uv - uZoomC) / uZoom + uZoomC; }
void main(){
  vec2 p = (vUv - 0.5) * uSize;
  float d = sdRound(p, uSize * 0.5, uRad);
  if (d > 0.0) discard;
  vec2 uv = zoomUv(vUv);
  vec3 a, b; vec3 c;
  if (uMode < 0.5) {
    a = texture2D(uA, uv).rgb; b = texture2D(uB, uv).rgb; c = mix(a, b, smoothstep(0.0, 1.0, uMix));
  } else if (uMode < 1.5) {
    // push: B slides in from the right (RTL feel), A moves out and dims
    float k = uMix;
    vec2 ua = uv + vec2(k * 0.35, 0.0); vec2 ub = uv - vec2((1.0 - k), 0.0);
    a = texture2D(uA, ua).rgb * (1.0 - 0.5 * k);
    b = texture2D(uB, ub).rgb;
    c = (ub.x >= 0.0) ? b : a;
  } else {
    // zoom-through: A scales up and fades, B scales from 0.94
    vec2 ua = (uv - 0.5) / (1.0 + uMix * 0.25) + 0.5; vec2 ub = (uv - 0.5) / (0.94 + uMix * 0.06) + 0.5;
    a = texture2D(uA, ua).rgb; b = texture2D(uB, ub).rgb; c = mix(a, b, smoothstep(0.0, 1.0, uMix));
  }
  // touch indicator: pressed dot + expanding ring
  vec2 tp = (vUv - uTap.xy) * uSize;
  float r = length(tp);
  float age = uTap.z;
  float press = smoothstep(0.0, 0.08, age) * (1.0 - smoothstep(0.18, 0.45, age));
  float dotA = (1.0 - smoothstep(0.034, 0.038, r)) * press * 0.55;
  float ringR = 0.03 + age * 0.22;
  float ringA = exp(-pow((r - ringR) / 0.006, 2.0)) * (1.0 - smoothstep(0.1, 0.6, age)) * step(0.0, age) * 0.9;
  c = mix(c, vec3(0.55), dotA * uTap.w);
  c += vec3(1.0) * ringA * uTap.w * 0.5;
  // dynamic island
  vec2 ip = p - vec2(0.0, uSize.y * 0.5 - 0.042);
  float isl = sdRound(ip, vec2(0.105, 0.0175), 0.0175);
  c = mix(c, vec3(0.0), 1.0 - smoothstep(-0.001, 0.001, isl));
  c *= uBright;
  // glass sheen (view dependent, cheap)
  float sh = smoothstep(0.35, 0.0, abs(vUv.x * 0.8 + vUv.y * 0.6 - uSheen)) * 0.10;
  float fres = pow(1.0 - max(dot(vN, vV), 0.0), 3.0) * 0.25;
  c += vec3(sh + fres);
  float edge = smoothstep(-0.004, 0.0, d);
  gl_FragColor = vec4(c * (1.0 - edge), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function makePhone(envMap) {
  const group = new THREE.Group();
  const shape = roundedRectShape(BODY_W, BODY_H, CORNER);
  const bevel = 0.012;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: DEPTH, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 5, curveSegments: 24,
  });
  geo.translate(0, 0, -DEPTH / 2);
  const frame = new THREE.MeshPhysicalMaterial({
    color: '#3a3f47', metalness: 1.0, roughness: 0.28, envMap, envMapIntensity: 1.3, clearcoat: 0.6, clearcoatRoughness: 0.2,
  });
  const glass = new THREE.MeshPhysicalMaterial({
    color: '#05060a', metalness: 0.0, roughness: 0.04, envMap, envMapIntensity: 1.0, clearcoat: 1, clearcoatRoughness: 0.02,
  });
  const body = new THREE.Mesh(geo, [glass, frame]);
  body.castShadow = true;
  group.add(body);

  // side buttons
  const btnMat = frame;
  const btn = (h, y, side) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.012, h, 0.022), btnMat);
    m.position.set(side * (BODY_W / 2 + bevel + 0.004), y, 0);
    group.add(m);
  };
  btn(0.2, 0.32, 1);
  btn(0.12, 0.42, -1);
  btn(0.12, 0.27, -1);

  const uniforms = {
    uA: { value: null }, uB: { value: null }, uMix: { value: 0 }, uMode: { value: 0 }, uBright: { value: 0.9 },
    uSheen: { value: 0.3 }, uZoom: { value: 1 }, uZoomC: { value: new THREE.Vector2(0.5, 0.5) },
    uTap: { value: new THREE.Vector4(0, 0, -1, 0) },
    uSize: { value: new THREE.Vector2(SCREEN_W, SCREEN_H) }, uRad: { value: 0.092 },
  };
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(SCREEN_W, SCREEN_H),
    new THREE.ShaderMaterial({ uniforms, vertexShader: screenVert, fragmentShader: screenFrag })
  );
  screen.position.z = DEPTH / 2 + bevel + 0.0015;
  group.add(screen);

  return {
    group,
    screen,
    uniforms,
    // tap position given in app CSS pixels (390 x 844)
    show(texA, texB = null, mix = 0, mode = 0) {
      uniforms.uA.value = texA;
      uniforms.uB.value = texB || texA;
      uniforms.uMix.value = texB ? mix : 0;
      uniforms.uMode.value = mode;
    },
    tap(x, y, age, strength = 1) {
      uniforms.uTap.value.set(x / 390, 1 - y / 844, age, age < 0 || age > 0.9 ? 0 : strength);
    },
    zoom(z, cx = 195, cy = 422) {
      uniforms.uZoom.value = z;
      uniforms.uZoomC.value.set(cx / 390, 1 - cy / 844);
    },
  };
}

export async function loadScreens(lang, names) {
  const loader = new THREE.TextureLoader();
  const out = {};
  await Promise.all(
    names.map(async (n) => {
      const t = await loader.loadAsync(`../assets/screens/${lang}/${n}.jpg`);
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      out[n] = t;
    })
  );
  return out;
}
