// The drum kit. Each drum is a recipe of a few simple sounds added together.
import { TAU, rng, gauss, Biquad } from './dsp.js';

// Kick: a sine wave that starts high and drops fast to about 52 Hz (the "boom"), plus a click where the beater hits.
function kick(out, sr, i0, vel, r) {
  const n = Math.round(0.5 * sr), f1 = 52 * (1 + (r() - 0.5) * 0.03);
  const click = new Biquad('bp', 4000, 0.9, 0, sr), knock = new Biquad('bp', 1700, 1.6, 0, sr);
  let ph = 0;
  for (let i = 0; i < n && i0 + i < out.length; i++) {
    const t = i / sr, f = f1 * (1 + 1.2 * Math.exp(-t / 0.012));
    ph += f / sr;
    const body = Math.sin(TAU * ph) * (0.85 * Math.exp(-t / 0.14) + 0.15 * Math.exp(-t / 0.05)) * Math.min(1, t / 0.0008);
    const noise = r() * 2 - 1;
    const v = body + click.tick(noise) * Math.exp(-t / 0.003) * 0.6 + knock.tick(noise) * Math.exp(-t / 0.01) * 0.3;
    out[i0 + i] += Math.tanh(v * 1.3) * vel;
  }
}

// Snare: two short tones (the drum head) plus a burst of bright noise (the wires under the drum).
function snare(out, sr, i0, vel, r) {
  const n = Math.round(0.4 * sr), hp = new Biquad('hp', 1500, 0.7, 0, sr), bp = new Biquad('bp', 5000, 0.7, 0, sr);
  let p1 = r(), p2 = r();
  for (let i = 0; i < n && i0 + i < out.length; i++) {
    const t = i / sr, drop = 1 + 0.25 * Math.exp(-t / 0.01);
    p1 += (180 * drop) / sr; p2 += (330 * drop) / sr;
    const head = Math.sin(TAU * p1) * Math.exp(-t / 0.06) * 0.55 + Math.sin(TAU * p2) * Math.exp(-t / 0.035) * 0.35;
    const wires = bp.tick(hp.tick(r() * 2 - 1)) * 2.2 * Math.exp(-t / (0.12 + 0.06 * vel)) * Math.min(1, t / 0.001);
    out[i0 + i] += (head + wires) * vel * 0.8;
  }
}

// Hi-hat: six square waves at clashing pitches (the Roland TR-808's recipe for "metal"), kept to the top end.
// Closed hats die in a few hundredths of a second; the open hat rings.
const METAL = [205.3, 304.4, 369.6, 522.7, 540, 800];
function hat(out, sr, i0, vel, r, open) {
  const n = Math.round((open ? 0.6 : 0.12) * sr), decay = open ? 0.22 : 0.03;
  const bp = new Biquad('bp', 10000, 0.8, 0, sr), hp = new Biquad('hp', 7000, 0.7, 0, sr);
  const ph = METAL.map(() => r());
  for (let i = 0; i < n && i0 + i < out.length; i++) {
    const t = i / sr;
    let m = 0;
    for (let k = 0; k < 6; k++) { ph[k] += (METAL[k] * 1.7) / sr; m += ph[k] % 1 < 0.5 ? 1 : -1; }
    const v = hp.tick(bp.tick(m / 6 + (r() - 0.5) * 0.6));
    out[i0 + i] += v * Math.exp(-t / decay) * Math.min(1, t / 0.0005) * vel * 0.9;
  }
}

/* ---- the drum machine (as in Punch Clock): simpler recipes, tuned for punch rather than realism */
// Kick: a sine gliding from 150 Hz down to 44 Hz in a tenth of a second, and a short triangle-wave click.
function machineKick(out, sr, i0, vel) {
  const n = Math.round(0.38 * sr);
  let p1 = 0, p2 = 0;
  for (let i = 0; i < n && i0 + i < out.length; i++) {
    const t = i / sr, f = 44 + 106 * Math.exp(-t / 0.03), fc = 250 + 850 * Math.exp(-t / 0.004);
    p1 += f / sr; p2 += fc / sr;
    const body = Math.sin(TAU * p1) * Math.exp(-t / 0.12) * Math.min(1, t / 0.001);
    const click = t < 0.022 ? (1 - 4 * Math.abs((p2 % 1) - 0.5)) * Math.exp(-t / 0.006) * 0.25 : 0;
    out[i0 + i] += (body * 0.95 + click) * vel;
  }
}
// Snare: noise through a band around 2.4 kHz, and a triangle tone falling from 185 to 150 Hz.
function machineSnare(out, sr, i0, vel, r) {
  const n = Math.round(0.2 * sr), bp = new Biquad('bp', 2400, 0.7, 0, sr), hp = new Biquad('hp', 800, 0.7, 0, sr);
  let p = 0;
  for (let i = 0; i < n && i0 + i < out.length; i++) {
    const t = i / sr;
    p += (150 + 35 * Math.exp(-t / 0.03)) / sr;
    const tri = (1 - 4 * Math.abs((p % 1) - 0.5)) * Math.exp(-t / 0.035) * 0.35;
    out[i0 + i] += (hp.tick(bp.tick(r() * 2 - 1)) * 1.4 * Math.exp(-t / 0.05) + tri) * vel;
  }
}
// Clap: three quick bursts of noise (several hands, not quite together), then a short tail.
function clap(out, sr, i0, vel, r) {
  const bp = new Biquad('bp', 1300, 1.3, 0, sr), n = Math.round(0.22 * sr);
  for (let i = 0; i < n && i0 + i < out.length; i++) {
    const t = i / sr, k = Math.floor(t / 0.011), tb = t - k * 0.011;
    const env = k < 2 ? Math.exp(-tb / 0.004) : Math.exp(-(t - 0.022) / 0.05);
    out[i0 + i] += bp.tick(r() * 2 - 1) * env * 1.6 * vel;
  }
}
// Hats: high-passed noise with a lift at 10 kHz.
function machineHat(out, sr, i0, vel, r, open) {
  const n = Math.round((open ? 0.3 : 0.06) * sr), hp = new Biquad('hp', 7000, 0.7, 0, sr), pk = new Biquad('peak', 10000, 1, 6, sr);
  for (let i = 0; i < n && i0 + i < out.length; i++) {
    const t = i / sr;
    out[i0 + i] += pk.tick(hp.tick(r() * 2 - 1)) * Math.exp(-t / (open ? 0.08 : 0.015)) * vel * 0.5;
  }
}

const KITS = {
  acoustic: { kick, snare, hat: (o, sr, i, v, r) => hat(o, sr, i, v, r, false), open: (o, sr, i, v, r) => hat(o, sr, i, v, r, true) },
  machine: { kick: machineKick, snare: machineSnare, clap, hat: (o, sr, i, v, r) => machineHat(o, sr, i, v, r, false), open: (o, sr, i, v, r) => machineHat(o, sr, i, v, r, true) },
};
export const DRUM_NAMES = { kick: 'kick', snare: 'snare', clap: 'clap', hat: 'hi-hat', open: 'open hi-hat' };

// Hits [[time in seconds, drum, strength]] → three stems: { kick, snare, hats }. The snare (and clap) get their own
// stem so the mixer can send them alone to the gated reverb. A drummer is never exactly on the grid or equally hard
// twice, so each hit moves by a few milliseconds and its strength by a few percent. A drum machine is, and doesn't.
const STEM = { kick: 'kick', snare: 'snare', clap: 'snare', hat: 'hats', open: 'hats' };
export function drums(n, sr, hits, seed, kitName = 'acoustic') {
  const stems = { kick: new Float32Array(n), snare: new Float32Array(n), hats: new Float32Array(n) }, r = rng(seed);
  const kit = KITS[kitName], human = kitName === 'acoustic';
  for (const [t, name, vel] of hits) {
    const at = Math.max(0, Math.round((t + (human ? gauss(r) * 0.003 : 0)) * sr));
    kit[name](stems[STEM[name]], sr, at, vel * (human ? 0.92 + 0.16 * r() : 1), r);
  }
  return stems;
}
