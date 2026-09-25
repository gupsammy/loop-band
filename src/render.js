// One clip: one pad, over one chord, in one key, at one tempo → one bar of stereo audio (plus its ringing tail).
// Pure: runs in the page's workers and in Node for tests.
import { hashString, stereo, mixInto, dB } from './synth/dsp.js';
import { guitar, bass } from './synth/strings.js';
import { drums } from './synth/drums.js';
import { note } from './synth/keys.js';
import { padById, padNotes } from './pads.js';

// Each clip starts this long before its bar line, so a strum or a drum hit pushed a little early still fits.
export const PRE = 0.03;
// How long each row may ring past the bar line.
const TAIL = { drums: 0.6, bass: 0.4, guitar: 0.6, keys: 0.8 };
// Row levels in dB, set by measuring clips (npm run levels): drums peak near -3 dB, the other rows sit at similar
// loudness (RMS). A pad can add its own `gain` to match its row.
const TRIM = { drums: -7.5, bass: -1, guitar: -18, keys: -10.5 };

// Drums don't depend on chord or key, so their clips are shared across all chords.
export const clipKey = ({ row, pad, chord, key, bpm }) => (row === 'drums' ? [row, pad, bpm] : [row, pad, chord, key, bpm]).join('|');

// spec: { row, pad, chord (0–5), key (0–11, C = 0), bpm, sr }
export function renderClip(spec) {
  const { row, pad, bpm, sr } = spec, seed = hashString(clipKey(spec));
  const e8 = 30 / bpm, at = (e) => PRE + e * e8; // an eighth note lasts half a beat
  const n = Math.round((PRE + 8 * e8 + TAIL[row]) * sr), out = stereo(n), gain = dB(TRIM[row] + (padById(row, pad).gain || 0));

  if (row === 'drums') {
    const { kit, hats } = drums(n, sr, padById(row, pad).hits.map(([e, d, v]) => [at(e), d, v]), seed);
    mixInto(out, kit, gain, 0);
    mixInto(out, hats, gain * 0.7, 0.3);
    return out;
  }
  // A note that lasts to the end of the bar keeps ringing into the tail; the next bar's clip cuts it off.
  const events = padNotes(row, pad, spec.key, spec.chord).map((x) => ({
    ...x, t: at(x.e), dur: (x.e + x.len >= 8 ? x.len * e8 + TAIL[row] : x.len * e8),
  }));
  if (row === 'bass') {
    mixInto(out, bass(n, sr, events, seed), gain, 0);
  } else if (row === 'guitar') {
    // Two takes of the same part, one hard left and one hard right, the right a few milliseconds late: double-tracking.
    const tone = padById(row, pad).tone || 'drive';
    mixInto(out, guitar(n, sr, events, { seed: seed ^ 11 }, tone), gain, -0.85);
    mixInto(out, guitar(n, sr, events, { seed: seed ^ 29, late: 0.004 }, tone), gain, 0.85);
  } else {
    const voice = padById(row, pad).voice;
    let k = 0;
    for (const ev of events) for (const midi of ev.midis) note(out.L, out.R, sr, { t: ev.t, len: ev.dur, midi, vel: ev.vel * gain, voice, seed: seed + k++ });
  }
  return out;
}
