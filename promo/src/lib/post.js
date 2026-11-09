import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';

// Final look: subtle vignette, chromatic fringe at the edges, film grain and a
// "flash" uniform used for hard cuts / impacts.
const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.32 },
    uGrain: { value: 0.026 },
    uCA: { value: 0.0012 },
    uFlash: { value: 0 },
    uFade: { value: 1 },
    uRes: { value: new THREE.Vector2(1080, 1920) },
    uContrast: { value: 1.08 },
    uSat: { value: 1.12 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uVignette, uGrain, uCA, uFlash, uFade, uContrast, uSat; uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
    void main(){
      vec2 c = vUv - 0.5;
      float r2 = dot(c*vec2(0.5625,1.0), c*vec2(0.5625,1.0));
      vec2 off = c * uCA * (0.4 + r2 * 6.0);
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + off).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - off).b;
      float L = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(L), col, uSat);
      col = (col - 0.5) * uContrast + 0.5;
      col = clamp(col, 0.0, 1.0);
      float vig = smoothstep(0.75, 0.12, r2 * 2.2);
      col *= mix(1.0 - uVignette, 1.0, vig);
      float n = hash(vUv * uRes + fract(uTime * 7.13) * 100.0) - 0.5;
      col += n * uGrain;
      col = mix(col, vec3(1.0), uFlash);
      col *= uFade;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export function makeComposer(renderer, scene, camera, W, H, samples = 4) {
  const pr = renderer.getPixelRatio();
  const rt = new THREE.WebGLRenderTarget(W * pr, H * pr, { type: THREE.HalfFloatType, samples });
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(pr);
  composer.setSize(W, H);
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  const bokeh = new BokehPass(scene, camera, { focus: 3.4, aperture: 0.02, maxblur: 0.009 });
  bokeh.enabled = false;
  composer.addPass(bokeh);
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.35, 0.55, 1.25);
  composer.addPass(bloom);
  const out = new OutputPass();
  composer.addPass(out);
  const finish = new ShaderPass(FinishShader);
  finish.uniforms.uRes.value.set(W * pr, H * pr);
  composer.addPass(finish);
  return { composer, bloom, finish, renderPass, bokeh };
}
