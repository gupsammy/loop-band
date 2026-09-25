// Synth voices: a few copies of one wave, a little out of tune with each other, through a resonant low-pass filter.
// Plus FM bells, where one sine wave bends the pitch of another.
import { TAU, rng, SVF } from './dsp.js';
import { mtof } from '../theory.js';

// A saw wave with its sharp jump smoothed (polyBLEP), so high notes don't make buzzy aliasing noise.
function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}
const saw = (p, dt) => 2 * p - 1 - blep(p, dt);
// A square wave is a saw minus the same saw half a cycle later.
const WAVES = { saw, square: (p, dt) => saw(p, dt) - saw((p + 0.5) % 1, dt), sine: (p) => Math.sin(TAU * p) };

// wave: saw | square | sine; unison: how many copies, spread over `detune` cents and across the stereo field by
// `width` (0 mono … 1 one copy per side); sine: a pure sine at the same pitch, unfiltered, for weight.
// attack/decay/release in seconds, sustain 0–1. The filter sits at `cutoff` and moves by `env` Hz on each note over
// `envDecay` seconds: closing (a pluck) or, with rise, opening (a swell).
const BASE = { wave: 'saw', unison: 2, sine: 0, rise: false };
export const VOICES = {
  pad: { attack: 0.25, decay: 0.5, sustain: 0.9, release: 0.6, cutoff: 900, env: 500, envDecay: 1, q: 0.8, detune: 12, width: 1, level: 0.45 },
  pluck: { attack: 0.003, decay: 0.25, sustain: 0, release: 0.08, cutoff: 400, env: 4000, envDecay: 0.12, q: 1.5, detune: 6, width: 0.5, level: 0.6 },
  stab: { attack: 0.004, decay: 0.2, sustain: 0.35, release: 0.08, cutoff: 900, env: 3500, envDecay: 0.15, q: 1.2, detune: 10, width: 0.7, level: 0.5 },
  lead: { attack: 0.02, decay: 0.3, sustain: 0.8, release: 0.15, cutoff: 1500, env: 2000, envDecay: 0.3, q: 1, detune: 5, width: 0.3, level: 0.55, vibrato: 0.15 },
  // Synthwave
  sbass: { unison: 1, sine: 1.6, attack: 0.004, decay: 0.3, sustain: 0.7, release: 0.05, cutoff: 140, env: 760, envDecay: 0.15, q: 3, detune: 0, width: 0, level: 0.5 },
  sub: { wave: 'sine', unison: 1, attack: 0.03, decay: 1, sustain: 1, release: 0.2, cutoff: 400, env: 0, envDecay: 1, q: 0.7, detune: 0, width: 0, level: 0.9 },
  sqpluck: { wave: 'square', attack: 0.003, decay: 0.3, sustain: 0, release: 0.06, cutoff: 500, env: 1700, envDecay: 0.12, q: 3, detune: 6, width: 0.5, level: 0.35 },
  pad3: { unison: 3, attack: 0.3, decay: 0.5, sustain: 0.9, release: 0.6, cutoff: 1100, env: 0, envDecay: 1, q: 0.5, detune: 18, width: 0.8, level: 0.3 },
  swell: { unison: 3, rise: true, attack: 0.05, decay: 1, sustain: 1, release: 0.5, cutoff: 250, env: 3500, envDecay: 1.2, q: 1.4, detune: 24, width: 1, level: 0.3 },
  chop: { attack: 0.003, decay: 0.08, sustain: 0.5, release: 0.03, cutoff: 1400, env: 1500, envDecay: 0.05, q: 1, detune: 10, width: 0.8, level: 0.35 },
  fm: { fm: true, ratio: 3.5, index: 2.2, ring: 1.2, release: 0.3, level: 0.5 },
};

// One note into stereo buffers L, R.
export function note(L, R, sr, o) {
  const V = { ...BASE, ...VOICES[o.voice] };
  if (V.fm) return bell(L, R, sr, o, V);
  const r = rng(o.seed), f = mtof(o.midi), wave = WAVES[V.wave], n0 = V.unison;
  const i0 = Math.round(o.t * sr), n = Math.round((o.len + V.release) * sr), relAt = o.len;
  // copy k: its detune in cents, its place across the stereo field, its own filter and starting phase
  const cents = Array.from({ length: n0 }, (_, k) => (n0 === 1 ? 0 : (k / (n0 - 1) - 0.5) * V.detune));
  const pan = cents.map((_, k) => (n0 === 1 ? 0 : (2 * k) / (n0 - 1) - 1));
  const gl = pan.map((p) => (p <= 0 ? 1 : 1 - p * V.width)), gr = pan.map((p) => (p >= 0 ? 1 : 1 + p * V.width));
  const filt = cents.map(() => new SVF()), ph = cents.map(() => r()), step = cents.map((c) => Math.pow(2, c / 1200));
  let level = 0, sp = 0;
  for (let i = 0; i < n && i0 + i < L.length; i++) {
    const tt = i / sr;
    if (i % 16 === 0) { // retune the filters every 16 samples: often enough to sound smooth, rare enough to be cheap
      const sweep = V.rise ? 1 - Math.exp(-tt / V.envDecay) : Math.exp(-tt / V.envDecay);
      for (const flt of filt) flt.set(V.cutoff + V.env * sweep + f, V.q, sr);
    }
    // envelope: rise, fall to the sustain level, and fade once the key is let go
    if (tt < relAt) level = tt < V.attack ? tt / V.attack : V.sustain + (1 - V.sustain) * Math.exp(-(tt - V.attack) / V.decay);
    else level *= 1 - (1 - Math.exp(-1 / (V.release * 0.3 * sr)));
    const vib = V.vibrato && tt > 0.25 ? Math.pow(2, (V.vibrato * Math.sin(TAU * 5.5 * tt) * Math.min(1, (tt - 0.25) * 3)) / 12) : 1;
    let l = 0, rr = 0;
    for (let k = 0; k < n0; k++) {
      const dt = (f * step[k] * vib) / sr;
      ph[k] += dt; if (ph[k] >= 1) ph[k] -= 1;
      const v = filt[k].lp(wave(ph[k], dt));
      l += v * gl[k]; rr += v * gr[k];
    }
    if (V.sine) { sp += (f * vib) / sr; if (sp >= 1) sp -= 1; const s = Math.sin(TAU * sp) * V.sine; l += s; rr += s; }
    const g = level * o.vel * V.level;
    L[i0 + i] += g * l;
    R[i0 + i] += g * rr;
  }
}

// FM bell: a sine (the carrier) whose phase is pushed around by a second sine (the modulator) at `ratio` times its
// pitch. The push (`index`) starts strong and fades, so the tone starts bright and clangy and mellows as it rings.
function bell(L, R, sr, o, V) {
  const f = mtof(o.midi), i0 = Math.round(o.t * sr), n = Math.round((o.len + V.ring) * sr);
  let pc = 0, pm = 0;
  for (let i = 0; i < n && i0 + i < L.length; i++) {
    const t = i / sr;
    pc += f / sr; pm += (f * V.ratio) / sr;
    const index = V.index * Math.exp(-t / 0.25) + 0.3;
    const amp = Math.min(1, t / 0.003) * Math.exp(-t / V.ring) * (t > o.len ? Math.exp(-(t - o.len) / V.release) : 1);
    const v = Math.sin(TAU * pc + index * Math.sin(TAU * pm)) * amp * o.vel * V.level;
    L[i0 + i] += v; R[i0 + i] += v;
  }
}
