import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pluck } from '../src/synth/strings.js';
import { renderClip, PRE } from '../src/render.js';
import { STYLES, padById } from '../src/pads.js';

const ROWS = STYLES.flatMap((st) => st.rows);

// The strongest repeat in the signal (autocorrelation), as a frequency. A parabola through the best lag and its
// neighbours finds the period between whole samples, so the measurement is good to a few cents.
function measurePitch(x, sr, lo = 50, hi = 1000) {
  const ac = (lag) => { let s = 0; for (let i = 0; i + lag < x.length; i++) s += x[i] * x[i + lag]; return s; };
  let best = -Infinity, bestLag = 0;
  for (let lag = Math.floor(sr / hi); lag <= Math.ceil(sr / lo); lag++) { const s = ac(lag); if (s > best) { best = s; bestLag = lag; } }
  const a = ac(bestLag - 1), c = ac(bestLag + 1);
  return sr / (bestLag + (a - c) / (2 * (a - 2 * best + c)));
}

test('a plucked string sounds at the pitch it was tuned to', () => {
  for (const sr of [44100, 48000]) for (const f of [82.41, 110, 196, 329.63]) {
    const out = new Float32Array(sr);
    pluck(out, sr, { t: 0, f, len: 1, vel: 1, seed: 7 });
    const got = measurePitch(out.subarray(Math.round(0.1 * sr), Math.round(0.4 * sr)), sr);
    assert.ok(Math.abs(got / f - 1) < 0.003, `${f} Hz at ${sr} Hz measured ${got.toFixed(2)} Hz`);
  }
});

test('a palm-muted note dies much faster than an open one', () => {
  const sr = 44100, energy = (mute) => {
    const out = new Float32Array(sr);
    pluck(out, sr, { t: 0, f: 110, len: 1, vel: 1, mute, seed: 3 });
    let e = 0;
    for (let i = Math.round(0.3 * sr); i < Math.round(0.5 * sr); i++) e += out[i] * out[i];
    return e;
  };
  assert.ok(energy(0.85) < energy(0) / 100);
});

test('the same clip renders to the same samples every time', () => {
  for (const spec of [{ row: 'guitar', pad: 'strum' }, { row: 'keys', pad: 'arp' }, { row: 'drums', pad: 'rock' }, { row: 'bass', pad: 'octaves' }]) {
    const full = { ...spec, chord: 3, key: 7, bpm: 140, sr: 44100 }, a = renderClip(full), b = renderClip(full);
    assert.deepEqual(a.L, b.L, `${spec.row} ${spec.pad}`);
    assert.deepEqual(a.R, b.R, `${spec.row} ${spec.pad}`);
  }
});

test('no clip peaks above 0 dBFS, at the slowest and fastest tempo and in the highest key', () => {
  for (const bpm of [70, 200]) for (const row of ROWS) for (const pad of row.pads) {
    for (let chord = 0; chord < (row.id === 'drums' ? 1 : 6); chord++) {
      const { L, R } = renderClip({ row: row.id, pad: pad.id, chord, key: 11, bpm, sr: 44100 });
      let peak = 0;
      for (const ch of [L, R]) for (const v of ch) peak = Math.max(peak, Math.abs(v));
      assert.ok(peak < 1, `${row.id} ${pad.id} chord ${chord} at ${bpm} BPM peaks at ${peak.toFixed(3)}`);
    }
  }
});

test('the snare stem holds the snares and claps and nothing else', () => {
  const sr = 44100, bpm = 120, e8 = 30 / bpm;
  for (const pad of ['rock', 'sw-gated', 'sw-four']) {
    const { snare } = renderClip({ row: 'drums', pad, chord: 0, key: 0, bpm, sr });
    const hitAt = new Set(padById('drums', pad).hits.filter(([, d]) => d === 'snare' || d === 'clap').map(([e]) => e));
    const energy = (e) => { let s = 0; for (let i = Math.round((PRE + e * e8) * sr), j = i + Math.round(0.05 * sr); i < j; i++) s += snare[i] * snare[i]; return s; };
    const hits = [...hitAt].map(energy);
    // eighths with no snare on them or just before them, so no snare tail rings there either
    const quiet = [...Array(8).keys()].filter((e) => !hitAt.has(e) && !hitAt.has(e - 1)).map(energy);
    assert.ok(hits.length && quiet.length, pad);
    assert.ok(Math.max(...quiet) < Math.min(...hits) / 1000, `${pad}: quiet ${Math.max(...quiet)} vs hits ${Math.min(...hits)}`);
  }
});
