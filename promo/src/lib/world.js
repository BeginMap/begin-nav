import * as THREE from 'three';

// Sky dome + daylight rig + fog. Night/day/golden-hour are blends driven per frame.
export function makeWorld(scene) {
  const skyU = {
    uNight: { value: 1 },
    uWarm: { value: 0 },
    uStudio: { value: 0 },
    uStudioTop: { value: new THREE.Color('#f4f7fd') },
    uStudioBot: { value: new THREE.Color('#d9e2f2') },
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
        uniform float uNight, uWarm, uStudio; uniform vec3 uStudioTop, uStudioBot; varying vec3 vDir;
        float hash(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        void main(){
          float h = clamp(vDir.y, -1.0, 1.0);
          vec3 dayTop = vec3(0.16, 0.42, 0.92), dayHor = vec3(0.74, 0.85, 0.97);
          vec3 day = mix(dayHor, dayTop, pow(max(h,0.0), 0.55));
          vec3 warmTop = vec3(0.30, 0.38, 0.70), warmHor = vec3(1.00, 0.70, 0.45);
          vec3 warm = mix(warmHor, warmTop, pow(max(h,0.0), 0.45));
          vec3 nTop = vec3(0.010, 0.016, 0.045), nHor = vec3(0.045, 0.075, 0.16);
          vec3 night = mix(nHor, nTop, pow(max(h,0.0), 0.5));
          vec3 sd = floor(vDir * 420.0);
          float st = step(0.9975, hash(sd)) * smoothstep(0.05, 0.35, h);
          night += vec3(st) * 0.9;
          vec3 c = mix(day, warm, uWarm);
          c = mix(c, night, uNight);
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
