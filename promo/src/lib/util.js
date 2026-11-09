// Small, deterministic animation helpers. Every animation in the promo is a pure
// function of time, so any frame can be rendered on its own.

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const remap = (x, a, b) => clamp((x - a) / (b - a));
export const smooth = (x) => x * x * (3 - 2 * x);
export const smoother = (x) => x * x * x * (x * (x * 6 - 15) + 10);

export const ease = {
  linear: (x) => x,
  inQuad: (x) => x * x,
  outQuad: (x) => 1 - (1 - x) * (1 - x),
  inOutQuad: (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2),
  inCubic: (x) => x * x * x,
  outCubic: (x) => 1 - Math.pow(1 - x, 3),
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  outQuart: (x) => 1 - Math.pow(1 - x, 4),
  inOutQuart: (x) => (x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2),
  outQuint: (x) => 1 - Math.pow(1 - x, 5),
  inQuint: (x) => x * x * x * x * x,
  inOutQuint: (x) => (x < 0.5 ? 16 * x ** 5 : 1 - Math.pow(-2 * x + 2, 5) / 2),
  outExpo: (x) => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x)),
  inExpo: (x) => (x <= 0 ? 0 : Math.pow(2, 10 * x - 10)),
  inOutExpo: (x) =>
    x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? Math.pow(2, 20 * x - 10) / 2 : (2 - Math.pow(2, -20 * x + 10)) / 2,
  outBack: (x, s = 1.70158) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2),
  inBack: (x, s = 1.70158) => (s + 1) * x * x * x - s * x * x,
  outElastic: (x) =>
    x <= 0 ? 0 : x >= 1 ? 1 : Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
};

// Progress of an animation that runs from t0 for `dur` seconds, eased.
export const prog = (t, t0, dur, fn = ease.inOutCubic) => fn(clamp((t - t0) / dur));

// Damped spring response to a step at t0 (0 -> 1 with overshoot). Pure function of time.
export function spring(t, t0, { freq = 2.2, damp = 0.45 } = {}) {
  const x = t - t0;
  if (x <= 0) return 0;
  const w = 2 * Math.PI * freq;
  const z = damp;
  if (z >= 1) return 1 - Math.exp(-w * x) * (1 + w * x);
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * x) * (Math.cos(wd * x) + ((z * w) / wd) * Math.sin(wd * x));
}

// In/out envelope: 0 before a, rises over `inDur`, holds, falls over `outDur` ending at b.
export function envelope(t, a, b, inDur = 0.4, outDur = 0.4, fin = ease.outCubic, fout = ease.inCubic) {
  if (t <= a || t >= b) return 0;
  const i = fin(clamp((t - a) / inDur));
  const o = 1 - fout(clamp((t - (b - outDur)) / outDur));
  return Math.min(i, o);
}

// Seeded PRNG (mulberry32) so "random" layouts are identical on every frame/worker.
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth pseudo-noise for organic camera drift (sum of incommensurate sines).
export function wobble(t, seed = 0, amp = 1) {
  return (
    amp *
    (Math.sin(t * 0.73 + seed * 1.7) * 0.5 +
      Math.sin(t * 1.31 + seed * 3.1) * 0.3 +
      Math.sin(t * 2.17 + seed * 5.3) * 0.2)
  );
}

// Plan pixel -> world metres. Plan is 2000x1500 px at 0.108 m/px, centred on the origin.
export const MPP = 0.108;
export const px2w = (x, y) => [(x - 1000) * MPP, (y - 750) * MPP];
