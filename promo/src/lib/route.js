import * as THREE from 'three';
import { px2w } from './util.js';
import { glowSprite } from './labels.js';

// A walking route as a glowing tube that draws itself (uProg 0..1) with flowing chevrons.
export function makeRoute(pts, { color = '#ff7a1a', radius = 0.5, y = 0.45 } = {}) {
  const v3 = pts.map(([x, yy]) => {
    const [X, Z] = px2w(x, yy);
    return new THREE.Vector3(X, y, Z);
  });
  const curve = new THREE.CatmullRomCurve3(v3, false, 'centripetal');
  const len = curve.getLength();
  const geo = new THREE.TubeGeometry(curve, Math.max(200, Math.round(len * 4)), radius, 12, false);
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uProg: { value: 0 },
      uTail: { value: 0 },
      uTime: { value: 0 },
      uLen: { value: len },
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: 1 },
    },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv = uv; vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uProg, uTail, uTime, uLen, uOpacity; uniform vec3 uColor; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
        if (vUv.x > uProg || vUv.x < uTail) discard;
        float fres = pow(1.0 - abs(dot(vN, vV)), 2.0);
        float lit = 0.75 + 0.35 * max(dot(vN, normalize(vec3(-0.3, 0.9, 0.3))), 0.0);
        float s = vUv.x * uLen / 3.2 - uTime * 1.6;
        float chev = smoothstep(0.55, 0.62, fract(s + abs(vUv.y - 0.5) * 0.35)) * smoothstep(0.85, 0.78, fract(s + abs(vUv.y - 0.5) * 0.35));
        vec3 c = uColor * lit + vec3(1.0, 0.95, 0.85) * chev * 0.55 + vec3(1.0, 0.8, 0.55) * fres * 0.5;
        float head = smoothstep(uProg - 0.03, uProg, vUv.x);
        c += vec3(1.0, 0.9, 0.7) * head * 0.8;
        gl_FragColor = vec4(c * 1.6, uOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 6;
  const group = new THREE.Group();
  group.add(mesh);
  // x-ray: where buildings hide the route, draw it ghosted on top (like the app does)
  const ghostMat = mat.clone();
  ghostMat.uniforms = mat.uniforms;
  ghostMat.uniforms.uGhost = { value: 0.5 };
  ghostMat.fragmentShader = mat.fragmentShader.replace('gl_FragColor = vec4(c * 1.6, uOpacity);', 'gl_FragColor = vec4(mix(c * 1.6, vec3(1.0, 0.75, 0.45), 0.25), uOpacity * 0.55);');
  ghostMat.depthFunc = THREE.GreaterDepth;
  ghostMat.depthWrite = false;
  const ghost = new THREE.Mesh(geo, ghostMat);
  ghost.renderOrder = 40;
  group.add(ghost);

  // soft orange glow under the route (fake light spill on the ground)
  const under = new THREE.Mesh(
    new THREE.TubeGeometry(curve, Math.max(200, Math.round(len * 4)), radius * 3.2, 8, false),
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uProg: mat.uniforms.uProg, uTail: mat.uniforms.uTail, uColor: mat.uniforms.uColor, uOpacity: mat.uniforms.uOpacity },
      vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform float uProg, uTail, uOpacity; uniform vec3 uColor; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){ if (vUv.x > uProg || vUv.x < uTail) discard; float f = pow(abs(dot(vN, vV)), 3.0); gl_FragColor = vec4(uColor, f * 0.22 * uOpacity); }`,
    })
  );
  under.renderOrder = 5;
  group.add(under);

  const head = glowSprite('#ffb066', 5);
  head.material.depthTest = false;
  group.add(head);

  const api = {
    group, curve, len, mat,
    set(prog, { tail = 0, time = 0, opacity = 1, headGlow = 1 } = {}) {
      mat.uniforms.uProg.value = prog;
      mat.uniforms.uTail.value = tail;
      mat.uniforms.uTime.value = time;
      mat.uniforms.uOpacity.value = opacity;
      group.visible = prog > 0.0001 && opacity > 0.001;
      const p = curve.getPointAt(Math.min(0.999, Math.max(0, prog)));
      head.position.copy(p);
      head.material.opacity = headGlow * opacity * (prog < 0.999 ? 1 : 0.5);
    },
    pointAt(u) { return curve.getPointAt(Math.min(1, Math.max(0, u))); },
    tangentAt(u) { return curve.getTangentAt(Math.min(1, Math.max(0, u))); },
  };
  api.set(0);
  return api;
}

// "You are here" marker: blue dot with white rim and a breathing halo.
export function makeHereDot() {
  const g = new THREE.Group();
  const halo = new THREE.Mesh(
    new THREE.CircleGeometry(1, 48),
    new THREE.MeshBasicMaterial({ color: '#3b82f6', transparent: true, opacity: 0.25, depthWrite: false })
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.12;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 1.15, 0.3, 40), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }));
  rim.position.y = 0.2;
  rim.castShadow = true;
  const dot = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 0.85, 0.34, 40),
    new THREE.MeshStandardMaterial({ color: '#1d6bff', emissive: '#1d4ed8', emissiveIntensity: 0.9, roughness: 0.3 })
  );
  dot.position.y = 0.22;
  g.add(halo, rim, dot);
  g.userData = { halo, rim, dot };
  return g;
}
