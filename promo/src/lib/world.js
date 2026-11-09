import * as THREE from 'three';

// Sky dome + daylight rig + fog. Night/day/golden-hour are blends driven per frame.
export function makeWorld(scene) {
  const skyU = {
    uNight: { value: 1 },
    uWarm: { value: 0 },
    uStudio: { value: 0 },
    uStudioTop: { value: new THREE.Color('#f4f7fd') },
    uStudioBot: { value: new THREE.Color('#d9e2f2') },
    uFog: { value: new THREE.Color('#c9dbf2') },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1500, 48, 24),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: skyU,
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform float uNight, uWarm, uStudio; uniform vec3 uStudioTop, uStudioBot, uFog; varying vec3 vDir;
        float hash(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        void main(){
          float h = clamp(vDir.y, -1.0, 1.0);
          vec3 dayTop = vec3(0.16, 0.42, 0.92), dayHor = vec3(0.74, 0.85, 0.97);
          vec3 day = mix(dayHor, dayTop, pow(max(h,0.0), 0.55));
          vec3 warmTop = vec3(0.30, 0.38, 0.70), warmHor = vec3(1.00, 0.70, 0.45);
          vec3 warm = mix(warmHor, warmTop, pow(max(h,0.0), 0.45));
          vec3 nTop = vec3(0.010, 0.016, 0.045), nHor = vec3(0.045, 0.075, 0.16);
          vec3 night = mix(nHor, nTop, pow(max(h,0.0), 0.5));
          vec3 sp = vDir * 260.0;
          vec3 cell = floor(sp);
          float hs = hash(cell);
          vec3 fo = fract(sp) - 0.5 - (vec3(hash(cell + 3.1), hash(cell + 7.7), hash(cell + 1.3)) - 0.5) * 0.5;
          float st = step(0.965, hs) * smoothstep(0.16, 0.0, length(fo)) * (0.4 + 0.6 * hash(cell + 9.2));
          night += vec3(0.85, 0.9, 1.0) * st * smoothstep(0.04, 0.3, h) * 1.4;
          vec3 c = mix(day, warm, uWarm);
          c = mix(c, night, uNight);
          c = mix(c, uFog, smoothstep(0.07, -0.01, h));
          vec3 studio = mix(uStudioBot, uStudioTop, smoothstep(-0.3, 0.6, h));
          c = mix(c, studio, uStudio);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    })
  );
  sky.renderOrder = -10;
  scene.add(sky);

  const hemi = new THREE.HemisphereLight('#dfe9ff', '#a8977c', 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff4e6', 2.6);
  sun.position.set(-70, 120, 60);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -125; sc.right = 125; sc.top = 100; sc.bottom = -100; sc.near = 10; sc.far = 400;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);

  const fog = new THREE.Fog('#dfe7f2', 160, 900);
  scene.fog = fog;
  const fogDay = new THREE.Color('#c9dbf2'), fogNight = new THREE.Color('#0a1226'), fogWarm = new THREE.Color('#f0c7a0');

  function set({ night = 0, warm = 0, studio = 0, fogNear = 160, fogFar = 900 } = {}) {
    skyU.uNight.value = night;
    skyU.uWarm.value = warm;
    skyU.uStudio.value = studio;
    fog.color.copy(fogDay).lerp(fogWarm, warm).lerp(fogNight, night);
    skyU.uFog.value.copy(fog.color);
    fog.near = fogNear;
    fog.far = fogFar;
    sun.color.set('#fff4e6').lerp(new THREE.Color('#ffc38a'), warm);
    sun.intensity = 2.5 * (1 - 0.2 * warm);
    sun.position.set(-70 - 60 * warm, 120 - 70 * warm, 60 + 20 * warm);
    hemi.intensity = 1.0 * (1 - 0.2 * warm);
  }
  set();
  return { sky, sun, hemi, fog, set, skyU };
}

// Environment map for glossy materials (window glass, metal): soft sky dome, warm ground, a sun.
export function makeSkyEnv(renderer) {
  const sc = new THREE.Scene();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(50, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: `varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec3 vD; void main(){
        float h = vD.y;
        vec3 sky = mix(vec3(0.85, 0.9, 0.98), vec3(0.28, 0.5, 0.92), pow(max(h, 0.0), 0.6));
        vec3 gnd = mix(vec3(0.62, 0.55, 0.45), vec3(0.4, 0.36, 0.3), clamp(-h * 3.0, 0.0, 1.0));
        vec3 c = h > 0.0 ? sky : gnd;
        vec3 sunDir = normalize(vec3(-0.45, 0.75, 0.4));
        c += vec3(1.0, 0.95, 0.85) * pow(max(dot(vD, sunDir), 0.0), 220.0) * 30.0;
        gl_FragColor = vec4(c, 1.0); }`,
    })
  );
  sc.add(dome);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(sc, 0.0).texture;
  pm.dispose();
  return tex;
}
