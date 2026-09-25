// Synth keys: two saw waves, a little out of tune with each other, through a resonant low-pass filter.
import { rng, SVF } from './dsp.js';
import { mtof } from '../theory.js';

// A saw wave with its sharp jump smoothed (polyBLEP), so high notes don't make buzzy aliasing noise.
function blep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

// attack/decay/release in seconds, sustain 0–1; cutoff + env: the filter opens by `env` Hz on each note and closes
// over `envDecay` seconds (that sweep is the "pluck"); detune in cents; width 0 (mono) … 1 (one saw per side).
export const VOICES = {
  pad: { attack: 0.25, decay: 0.5, sustain: 0.9, release: 0.6, cutoff: 900, env: 500, envDecay: 1, q: 0.8, detune: 12, width: 1, level: 0.45 },
  pluck: { attack: 0.003, decay: 0.25, sustain: 0, release: 0.08, cutoff: 400, env: 4000, envDecay: 0.12, q: 1.5, detune: 6, width: 0.5, level: 0.6 },
  stab: { attack: 0.004, decay: 0.2, sustain: 0.35, release: 0.08, cutoff: 900, env: 3500, envDecay: 0.15, q: 1.2, detune: 10, width: 0.7, level: 0.5 },
  lead: { attack: 0.02, decay: 0.3, sustain: 0.8, release: 0.15, cutoff: 1500, env: 2000, envDecay: 0.3, q: 1, detune: 5, width: 0.3, level: 0.55, vibrato: 0.15 },
};

// One note into stereo buffers L, R.
export function note(L, R, sr, { t, len, midi, vel, voice, seed }) {
  const V = VOICES[voice], r = rng(seed), f = mtof(midi);
  const i0 = Math.round(t * sr), n = Math.round((len + V.release) * sr), relAt = len;
  const fa = new SVF(), fb = new SVF(), up = Math.pow(2, V.detune / 2400), down = 1 / up;
  let pa = r(), pb = r(), level = 0;
  for (let i = 0; i < n && i0 + i < L.length; i++) {
    const tt = i / sr;
    if (i % 16 === 0) { // retune the filters every 16 samples: often enough to sound smooth, rare enough to be cheap
      const fc = V.cutoff + V.env * Math.exp(-tt / V.envDecay) + f;
      fa.set(fc, V.q, sr); fb.set(fc, V.q, sr);
    }
    // envelope: rise, fall to the sustain level, and fade once the key is let go
    const target = tt < V.attack ? tt / V.attack : tt < relAt ? V.sustain + (1 - V.sustain) * Math.exp(-(tt - V.attack) / V.decay) : 0;
    const speed = tt < relAt ? 1 : 1 - Math.exp(-1 / (V.release * 0.3 * sr));
    level += tt < relAt ? target - level : speed * (0 - level);
    const vib = V.vibrato && tt > 0.25 ? Math.pow(2, (V.vibrato * Math.sin(2 * Math.PI * 5.5 * tt) * Math.min(1, (tt - 0.25) * 3)) / 12) : 1;
    const da = (f * up * vib) / sr, db = (f * down * vib) / sr;
    pa += da; if (pa >= 1) pa -= 1;
    pb += db; if (pb >= 1) pb -= 1;
    const a = fa.lp(2 * pa - 1 - blep(pa, da)), b = fb.lp(2 * pb - 1 - blep(pb, db));
    const g = level * vel * V.level, w = V.width;
    L[i0 + i] += g * (a + b * (1 - w));
    R[i0 + i] += g * (b + a * (1 - w));
  }
}
