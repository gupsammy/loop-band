// Shared sound-making parts: seeded randomness and filters. Everything works on plain numbers, one sample at a time.

export const TAU = Math.PI * 2;
export const dB = (d) => Math.pow(10, d / 20);
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// Seeded random numbers in [0, 1) (mulberry32): the same seed always gives the same sequence.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// A bell-curve random number (mean 0, spread 1), for human timing and tuning wobble.
export const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(TAU * r());
export function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

// Two-pole filter from the Audio EQ Cookbook (RBJ). Types: lp, hp, bp, peak, ls (low shelf), hs (high shelf).
export class Biquad {
  constructor(type, f, q, gain, sr) {
    const w = (TAU * clamp(f, 5, sr * 0.49)) / sr, c = Math.cos(w), s = Math.sin(w), A = Math.pow(10, (gain || 0) / 40);
    const al = s / (2 * q), sA = 2 * Math.sqrt(A) * al;
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * c; a2 = 1 - al; }
    else if (type === 'peak') { b0 = 1 + al * A; b1 = -2 * c; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * c; a2 = 1 - al / A; }
    else if (type === 'ls') {
      b0 = A * (A + 1 - (A - 1) * c + sA); b1 = 2 * A * (A - 1 - (A + 1) * c); b2 = A * (A + 1 - (A - 1) * c - sA);
      a0 = A + 1 + (A - 1) * c + sA; a1 = -2 * (A - 1 + (A + 1) * c); a2 = A + 1 + (A - 1) * c - sA;
    } else {
      b0 = A * (A + 1 + (A - 1) * c + sA); b1 = -2 * A * (A - 1 + (A + 1) * c); b2 = A * (A + 1 + (A - 1) * c - sA);
      a0 = A + 1 - (A - 1) * c + sA; a1 = 2 * (A - 1 - (A + 1) * c); a2 = A + 1 - (A - 1) * c - sA;
    }
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    this.z1 = 0; this.z2 = 0;
  }
  tick(x) {
    const y = this.b0 * x + this.z1;
    this.z1 = this.b1 * x - this.a1 * y + this.z2;
    this.z2 = this.b2 * x - this.a2 * y;
    return y;
  }
}
// Filters in series, from a list of [type, freq, q, gain].
export function chain(spec, sr) {
  const fs = spec.map(([t, f, q, g]) => new Biquad(t, f, q, g, sr));
  return (x) => { for (const f of fs) x = f.tick(x); return x; };
}

// Resonant filter that can be retuned while it runs (Cytomic state-variable filter), for synth sweeps.
export class SVF {
  constructor() { this.s1 = 0; this.s2 = 0; this.set(1000, 0.7, 44100); }
  set(fc, q, sr) {
    const g = Math.tan((Math.PI * clamp(fc, 20, sr * 0.45)) / sr);
    this.k = 1 / q; this.a1 = 1 / (1 + g * (g + this.k)); this.a2 = g * this.a1; this.a3 = g * this.a2;
  }
  lp(x) {
    const v3 = x - this.s2, v1 = this.a1 * this.s1 + this.a2 * v3, v2 = this.s2 + this.a2 * this.s1 + this.a3 * v3;
    this.s1 = 2 * v1 - this.s1; this.s2 = 2 * v2 - this.s2;
    return v2;
  }
}

// Stereo buffer helpers. pan: -1 left … 1 right, equal-power.
export const stereo = (n) => ({ L: new Float32Array(n), R: new Float32Array(n) });
export function mixInto(dst, src, gain, pan) {
  const a = ((pan + 1) * Math.PI) / 4, gl = gain * Math.cos(a), gr = gain * Math.sin(a);
  for (let i = 0; i < src.length && i < dst.L.length; i++) { dst.L[i] += src[i] * gl; dst.R[i] += src[i] * gr; }
}
