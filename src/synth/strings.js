// Plucked strings (Karplus–Strong), the guitar amp and the bass amp.
import { TAU, clamp, rng, gauss, Biquad, chain } from './dsp.js';
import { mtof } from '../theory.js';

// One plucked note, added into `out` (sample rate sr).
// A string is a loop: a short buffer one period long (sr / f samples) that is read, gently low-pass filtered, and
// written back. Each trip round the loop dulls the sound a little and makes it quieter, as a real string loses its
// high overtones first. What starts in the buffer is the shape of a string pulled aside at the pick point.
//   o: { t, f, len, vel, mute (0–1 palm mute), pick (0–1 along the string), damp, ring (seconds to fade 60 dB), seed }
export function pluck(out, sr, o) {
  const r = rng(o.seed), i0 = Math.round(o.t * sr), f = o.f, vel = o.vel ?? 1, mute = o.mute || 0;
  const damp = clamp((o.damp ?? 0.12) + mute * 0.5, 0, 0.9);
  const t60 = mute ? 0.16 + (1 - Math.sqrt(mute)) * (o.ring ?? 4) : o.ring ?? 4;
  const g = Math.pow(10, -3 / (t60 * f)); // loss per trip that makes the note fade 60 dB in t60 seconds
  // The loop is N whole samples plus a fraction (an allpass filter), minus the delay the low-pass filter adds.
  const P = sr / f, w = (TAU * f) / sr;
  const pd = Math.atan2(damp * Math.sin(w), 1 - damp * Math.cos(w)) / w;
  const N = Math.max(2, Math.floor(P - pd - 0.2)), frac = P - pd - N, apc = (1 - frac) / (1 + frac);
  // Starting shape: a triangle peaking at the pick point, plus pick noise; a softer pick is a duller shape.
  const d = new Float32Array(N), apex = clamp(Math.round((o.pick ?? 0.14) * N), 1, N - 1);
  const bright = clamp(0.2 + 0.8 * vel - 0.55 * mute, 0.05, 1);
  const soft = 1 - Math.exp((-TAU * (500 + 9000 * bright * bright)) / sr);
  let s = 0, mean = 0;
  for (let k = 0; k < N; k++) {
    const tri = k < apex ? k / apex : (N - k) / (N - apex);
    s += soft * (tri + (r() - 0.5) * 0.5 * bright - s);
    d[k] = s; mean += s;
  }
  mean /= N;
  for (let k = 0; k < N; k++) d[k] = (d[k] - mean) * vel;
  // A pickup under the string hears it minus a copy delayed by where the pickup sits: that notch shapes the tone.
  const M = Math.max(1, Math.round(0.1 * P)), hist = new Float32Array(M + 1);
  const nLen = Math.round(o.len * sr), rel = Math.round(0.012 * sr), n = nLen + rel;
  let p = 0, h = 0, lp = 0, apx = 0, apy = 0;
  for (let i = 0; i < n; i++) {
    const j = i0 + i;
    if (j >= out.length) break;
    const y = d[p];
    lp += (1 - damp) * (y - lp);
    const ap = apc * lp + apx - apc * apy; apx = lp; apy = ap;
    d[p] = ap * g;
    if (++p === N) p = 0;
    hist[h] = y;
    const back = hist[(h + 1) % (M + 1)];
    if (++h > M) h = 0;
    let v = y - 0.8 * back;
    if (i >= nLen) v *= 1 - (i - nLen) / rel; // the fret hand lifts: a quick fade
    if (j >= 0) out[j] += v;
  }
}

// One guitarist's take of a list of chord events, as the raw pickup signal. Every take drifts in time, is tuned a
// few cents off per string, and picks each string a little differently, so two takes never match exactly.
//   events: [{ t, dur, midis, vel, mute, up }]
export function guitarTake(n, sr, events, take) {
  const di = new Float32Array(n), r = rng(take.seed);
  const cents = Array.from({ length: 6 }, () => (r() - 0.5) * 6);
  let drift = 0;
  for (const ev of events) {
    drift += gauss(r) * 0.0012 - drift * 0.08;
    const start = ev.t + gauss(r) * 0.0025 + drift + (take.late || 0);
    const notes = ev.up ? ev.midis.slice().reverse() : ev.midis;
    const spread = (ev.mute ? 0.006 : 0.011) * (0.8 + 0.4 * r()); // a strum: strings sound one after another
    notes.forEach((m, s) => {
      const string = ev.up ? notes.length - 1 - s : s;
      const t = start + (notes.length > 1 ? (s / (notes.length - 1)) * spread : 0);
      pluck(di, sr, {
        t, len: Math.max(0.02, ev.dur - (t - ev.t)), f: mtof(m + (cents[string] + gauss(r) * 0.7) / 100),
        vel: (ev.vel ?? 0.9) * (1 - 0.06 * s) * (0.92 + 0.16 * r()), mute: ev.mute || 0,
        pick: 0.11 + 0.06 * r(), ring: take.ring ?? 4, seed: (r() * 4294967296) >>> 0,
      });
    });
  }
  return di;
}

// The amp: boost the mids, clip softly twice (like two tube stages), shape the tone, clip once more (the power amp).
// Runs on a signal at twice the output rate; clipping makes new high overtones, and the extra room keeps them from
// folding back down as harsh noise.
const AMPS = {
  drive: { mid: [800, 0.8, 6], g1: 12, g2: 5, tone: [['ls', 120, 0.7, 2], ['peak', 640, 0.8, -4], ['hs', 2800, 0.7, 2]], g3: 1.5 },
  crunch: { mid: [900, 0.8, 3], g1: 3.5, g2: 2, tone: [['peak', 500, 0.8, -2], ['hs', 2500, 0.7, 3]], g3: 1.2 },
};
function amp(di, sr2, name) {
  const P = AMPS[name], out = new Float32Array(di.length);
  const pre = chain([['hp', 130, 0.7], ['peak', ...P.mid], ['lp', 7500, 0.7]], sr2), tone = chain(P.tone, sr2);
  const c1 = new Biquad('lp', 7000, 0.6, 0, sr2), dc = new Biquad('hp', 20, 0.7, 0, sr2);
  const bias = 0.25, off = Math.tanh(bias), n3 = 1 / Math.tanh(P.g3);
  for (let i = 0; i < di.length; i++) {
    let x = pre(di[i]);
    x = dc.tick(c1.tick(Math.tanh(x * P.g1 + bias) - off)); // stage 1: the bias makes it clip unevenly, like a tube
    x = Math.tanh(x * P.g2);
    out[i] = Math.tanh(tone(x) * P.g3) * n3;
  }
  return out;
}
// Halve the sample rate: filter away everything the lower rate can't hold, then keep every other sample.
function halve(x, sr2) {
  const aa = chain([['lp', 0.22 * sr2, 0.54], ['lp', 0.22 * sr2, 1.31], ['lp', 0.22 * sr2, 0.54], ['lp', 0.22 * sr2, 1.31]], sr2);
  const y = new Float32Array(x.length >> 1);
  for (let i = 0; i < x.length; i++) { const v = aa(x[i]); if (!(i & 1)) y[i >> 1] = v; }
  return y;
}
// A miked 4x12 speaker cabinet, copied as a set of fixed EQ bumps and dips.
const CAB = [['hp', 80, 0.8], ['peak', 115, 1.2, 3], ['peak', 400, 1, -3], ['peak', 1500, 1.2, 2], ['peak', 2600, 2, 4],
  ['peak', 3800, 3, -5], ['lp', 5600, 0.8], ['lp', 7500, 0.6]];

// A guitar take through the amp and cabinet, at sample rate sr.
export function guitar(n, sr, events, take, ampName) {
  const sr2 = sr * 2; // event times are in seconds, so they carry over to the doubled rate unchanged
  const y = halve(amp(guitarTake(n * 2, sr2, events, take), sr2, ampName), sr2), cab = chain(CAB, sr);
  for (let i = 0; i < y.length; i++) y[i] = cab(y[i]);
  return y;
}

// Bass: the same string model, darker, through a bass amp: the clean low end plus a driven copy of the upper
// part for grit, then a simple level-evening compressor.
export function bass(n, sr, events, seed) {
  const di = new Float32Array(n), r = rng(seed);
  for (const ev of events) {
    const t = ev.t + gauss(r) * 0.002;
    pluck(di, sr, { t, len: ev.dur, f: mtof(ev.midis[0]), vel: ev.vel * (0.94 + 0.12 * r()), damp: 0.3, ring: 2.5, pick: 0.2, seed: (r() * 4294967296) >>> 0 });
  }
  const hp = new Biquad('hp', 35, 0.7, 0, sr), gHp = new Biquad('hp', 300, 0.7, 0, sr), gLp = new Biquad('lp', 2400, 0.7, 0, sr);
  const eq = chain([['peak', 90, 0.9, 2], ['peak', 260, 1, -3], ['peak', 1000, 1.1, 2], ['lp', 4500, 0.7]], sr);
  const at = 1 - Math.exp(-1 / (0.004 * sr)), rt = 1 - Math.exp(-1 / (0.09 * sr));
  let env = 0;
  for (let i = 0; i < n; i++) {
    const x = hp.tick(di[i]);
    let y = x + gLp.tick(Math.tanh(gHp.tick(x) * 6)) * 0.3;
    const a = Math.abs(y);
    env += (a > env ? at : rt) * (a - env);
    if (env > 0.3) y *= Math.pow(0.3 / env, 0.7);
    di[i] = eq(y);
  }
  return di;
}
