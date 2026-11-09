import * as THREE from 'three';

// Shared "night -> day" grade. One daylight lighting rig is used everywhere; night is a
// per-fragment colour grade that a radial wave (from the pin impact) washes away.
export const G = {
  uNight: { value: 1 },
  uRevealCenter: { value: new THREE.Vector2(0, 0) },
  uRevealRadius: { value: -1000 },
  uRing: { value: 0 },
  uWarm: { value: 0 }, // golden-hour tint for the finale
  uTime: { value: 0 },
  uGlowCenter: { value: new THREE.Vector2(0, 0) },
  uGlowRadius: { value: 1e5 },
};

const VERT_DECL = 'varying vec3 vWorldN;\n';
const VERT_BODY = `
  #ifdef USE_INSTANCING
    vWorldN = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  #else
    vWorldN = (modelMatrix * vec4(transformed, 1.0)).xyz;
  #endif
`;

const FRAG_DECL = `
varying vec3 vWorldN;
uniform float uNight;
uniform vec2 uRevealCenter;
uniform float uRevealRadius;
uniform float uRing;
uniform float uWarm;
uniform vec2 uGlowCenter;
uniform float uGlowRadius;
`;

// opts.glow: GLSL expression (vec3) added at night (e.g. lit windows)
export function graded(material, opts = {}) {
  const extraDecl = opts.decl || '';
  const glow = opts.glow || 'vec3(0.0)';
  const nightTint = opts.nightTint || 'vec3(0.10, 0.15, 0.30)';
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, G, opts.uniforms || {});
    shader.vertexShader = VERT_DECL + shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_BODY);
    shader.fragmentShader = FRAG_DECL + extraDecl + shader.fragmentShader.replace(
      '#include <opaque_fragment>',
      `#include <opaque_fragment>
      {
        float dRev = distance(vWorldN.xz, uRevealCenter);
        float nightAmt = uNight * smoothstep(uRevealRadius - 14.0, uRevealRadius, dRev);
        vec3 c = gl_FragColor.rgb;
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        float gk = smoothstep(uGlowRadius, uGlowRadius - 12.0, distance(vWorldN.xz, uGlowCenter));
        vec3 nightC = l * ${nightTint} * 0.42 + c * 0.012 + (${glow}) * gk;
        c = mix(c, nightC, nightAmt);
        float ring = exp(-pow((dRev - uRevealRadius) / 2.6, 2.0)) * uRing;
        c += vec3(0.35, 0.62, 1.0) * ring * 1.6;
        c = mix(c, c * vec3(1.10, 0.93, 0.78) + vec3(0.03, 0.012, 0.0), uWarm);
        gl_FragColor.rgb = c;
      }`
    );
  };
  material.customProgramCacheKey = () => 'graded:' + (opts.key || '') + glow;
  return material;
}
