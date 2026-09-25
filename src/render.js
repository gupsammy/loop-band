// One clip: one pad, over one chord, in one key, at one tempo → one bar of stereo audio (plus its ringing tail).
// Drum clips also carry `snare`: the snare alone, in mono. Pure: runs in the page's workers and in Node for tests.
import { hashString, stereo, mixInto, dB } from './synth/dsp.js';
import { guitar, bass } from './synth/strings.js';
import { drums } from './synth/drums.js';
import { note } from './synth/keys.js';
import { rowOfPad, padById, padNotes } from './pads.js';

// Each clip starts this long before its bar line, so a strum or a drum hit pushed a little early still fits.
export const PRE = 0.03;

// Drums don't depend on chord or key, so their clips are shared across all chords.
export const clipKey = ({ row, pad, chord, key, bpm }) => (row === 'drums' ? [row, pad, bpm] : [row, pad, chord, key, bpm]).join('|');

// spec: { row (the lane), pad, chord (0–5), key (0–11, C = 0), bpm, sr }
export function renderClip(spec) {
  const { row: lane, pad: padId, bpm, sr } = spec, seed = hashString(clipKey(spec));
  const row = rowOfPad(lane, padId), pad = padById(lane, padId);
  const e8 = 30 / bpm, at = (e) => PRE + e * e8; // an eighth note lasts half a beat
  const n = Math.round((PRE + 8 * e8 + row.tail) * sr), out = stereo(n), gain = dB(row.trim + (pad.gain || 0));

  if (lane === 'drums') {
    const { kick, snare, hats } = drums(n, sr, pad.hits.map(([e, d, v]) => [at(e), d, v]), seed, pad.kit);
    mixInto(out, kick, gain, 0);
    mixInto(out, snare, gain, 0);
    mixInto(out, hats, gain * 0.7, 0.3);
    for (let i = 0; i < n; i++) snare[i] *= gain;
    out.snare = snare; // the snare alone, for the gated reverb
    return out;
  }
  // A note that lasts to the end of the bar keeps ringing into the tail; the next bar's clip fades it out.
  const events = padNotes(lane, padId, spec.key, spec.chord).map((x) => ({
    ...x, t: at(x.e), dur: (x.e + x.len >= 8 ? x.len * e8 + row.tail : x.len * e8),
  }));
  if (pad.voice) {
    let k = 0;
    for (const ev of events) for (const midi of ev.midis) note(out.L, out.R, sr, { t: ev.t, len: ev.dur, midi, vel: ev.vel * gain, voice: pad.voice, seed: seed + k++ });
  } else if (lane === 'bass') {
    mixInto(out, bass(n, sr, events, seed), gain, 0);
  } else {
    // Two takes of the same part, one hard left and one hard right, the right a few milliseconds late: double-tracking.
    const tone = pad.tone || 'drive';
    mixInto(out, guitar(n, sr, events, { seed: seed ^ 11 }, tone), gain, -0.85);
    mixInto(out, guitar(n, sr, events, { seed: seed ^ 29, late: 0.004 }, tone), gain, 0.85);
  }
  return out;
}
