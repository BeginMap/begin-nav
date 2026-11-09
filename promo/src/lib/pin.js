import * as THREE from 'three';

// The Begin Map pin in 3D: glossy brand-blue drop with a white "eye", like the app icon.
export function makePin(envMap) {
  const R = 1.0, cy = 2.25;
  const phi0 = -Math.asin(R / cy);
  const pts = [new THREE.Vector2(0.0001, 0)];
  const tip = new THREE.Vector2(R * Math.cos(phi0), cy + R * Math.sin(phi0));
  for (let i = 1; i <= 8; i++) {
    const k = i / 8;
    // slightly concave flank for an elegant silhouette
    const x = tip.x * k * (1 - 0.12 * Math.sin(Math.PI * k));
    pts.push(new THREE.Vector2(x, tip.y * k));
  }
  for (let i = 1; i <= 40; i++) {
    const a = phi0 + ((Math.PI / 2 - phi0) * i) / 40;
    pts.push(new THREE.Vector2(Math.max(0.0001, R * Math.cos(a)), cy + R * Math.sin(a)));
  }
  const geo = new THREE.LatheGeometry(pts, 64);
  const blue = new THREE.MeshPhysicalMaterial({
    color: '#1d4ed8', roughness: 0.2, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.06, envMap, envMapIntensity: 1.1,
  });
  const body = new THREE.Mesh(geo, blue);
  body.castShadow = true;
  const white = new THREE.MeshStandardMaterial({ color: '#eef2fb', roughness: 0.35, envMap, envMapIntensity: 0.5 });
  const capGeo = new THREE.SphereGeometry(R * 1.004, 48, 12, 0, Math.PI * 2, 0, 0.43);
  for (const s of [1, -1]) {
    const cap = new THREE.Mesh(capGeo, white);
    cap.rotation.x = (s * Math.PI) / 2;
    cap.position.y = cy;
    body.add(cap);
  }
  const pin = new THREE.Group();
  pin.add(body);
  pin.userData.body = body;
  pin.userData.material = blue;

  // contact shadow
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,0.55)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 3.2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.06;
  shadow.renderOrder = 2;
  pin.userData.shadow = shadow;
  return pin;
}

// Expanding ring on the ground (impact / arrival pulse).
export function makeRing(color = '#4f8dff') {
  const m = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 }, uWidth: { value: 0.08 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity, uWidth; varying vec2 vUv;
      void main(){ float r = length(vUv-0.5)*2.0; float a = smoothstep(1.0, 1.0-uWidth, r) * smoothstep(1.0-uWidth*2.5, 1.0-uWidth, r);
      a += smoothstep(1.0, 0.0, r) * 0.12; gl_FragColor = vec4(uColor * 1.6, a * uOpacity); }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 5;
  return mesh;
}
