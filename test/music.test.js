import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STYLES, rowOf, padNotes, mapPads } from '../src/pads.js';

const ROWS = STYLES.flatMap((st) => st.rows);
import { CHORDS, chordName } from '../src/theory.js';
import { WORDS, TRICKS, FX_INFO, parseMarks } from '../src/learn.js';

const KEYS = [...Array(12).keys()];
// The C major scale's pitch classes, moved to each key: written out here, not taken from theory.js.
const inScale = (m, key) => [0, 2, 4, 5, 7, 9, 11].includes((((m - key) % 12) + 12) % 12);

test('bass, guitar and keys only ever play notes in the key', () => {
  for (const row of ROWS.filter((r) => r.id !== 'drums')) for (const pad of row.pads) for (const key of KEYS) for (let ci = 0; ci < 6; ci++) {
    for (const n of padNotes(row.id, pad.id, key, ci)) for (const m of n.midis) {
      assert.ok(inScale(m, key), `${row.id} ${pad.id} plays ${m} over chord ${ci} in key ${key}`);
    }
  }
});

test('power chords are always root, perfect fifth, octave', () => {
  for (const pad of ['strum', 'chug', 'ring']) for (const key of KEYS) for (let ci = 0; ci < 6; ci++) {
    const [m] = padNotes('guitar', pad, key, ci).map((n) => n.midis);
    assert.deepEqual(m.map((x) => x - m[0]), [0, 7, 12]);
  }
});

test('chords I, IV and V are major; ii, iii and vi are minor, in every key', () => {
  for (const key of KEYS) CHORDS.forEach((c, ci) => {
    assert.equal(chordName(key, ci).endsWith('m'), c.roman === c.roman.toLowerCase(), `${c.roman} in key ${key}`);
  });
});

test('each row stays in its own register, in every style', () => {
  for (const st of STYLES) {
    const span = (lane) => {
      const all = rowOf(st.id, lane).pads.flatMap((p) => KEYS.flatMap((k) => [0, 5].flatMap((ci) => padNotes(lane, p.id, k, ci).flatMap((n) => n.midis))));
      return [Math.min(...all), Math.max(...all)];
    };
    const bass = span('bass'), guitar = span('guitar');
    assert.ok(bass[0] >= 28 && bass[1] <= 64, `${st.id} bass ${bass}`); // E1 up to the octave above the highest root
    assert.ok(guitar[0] >= 40, `${st.id} guitar ${guitar}`); // nothing below the low E string
  }
});

test('switching style keeps each playing lane on the pad in the same place, and stopped lanes stopped', () => {
  const rock = { drums: 'rock', bass: null, guitar: 'chug', keys: 'whoa' };
  const synth = mapPads(rock, 'synth');
  assert.deepEqual(synth, { drums: 'sw-gated', bass: null, guitar: 'sw-rush', keys: 'sw-bells' });
  assert.deepEqual(mapPads(synth, 'rock'), rock);
});

test('every marked word in the app has a glossary entry', () => {
  const texts = [
    ...ROWS.flatMap((r) => [r.about, ...r.pads.flatMap((p) => [p.tip, p.why])]),
    ...STYLES.flatMap((st) => [st.about, st.why]),
    ...Object.values(FX_INFO).flatMap((f) => [f.tip, f.why]),
    ...CHORDS.map((c) => c.feel),
    ...TRICKS.flatMap((t) => [t.how, t.why]),
  ];
  for (const t of texts) for (const p of parseMarks(t)) if (typeof p !== 'string') assert.ok(WORDS[p.word], `no entry for "${p.word}"`);
});

/* ---- tricks: each ticks on a history that does it and not on one that nearly does */
const EMPTY = { drums: null, bass: null, guitar: null, keys: null };
const bar = (pads, more = {}) => ({ run: 1, chord: 0, key: 0, bpm: 120, pads: { ...EMPTY, ...pads }, vol: { drums: 0.8, bass: 0.8, guitar: 0.8, keys: 0.8 }, fMin: 0, fMax: 0, fEnd: 0, ...more });
const band = { drums: 'rock', bass: 'roots', guitar: 'strum' };
const chords = (...cs) => cs.map((c) => bar(band, { chord: c }));
const trick = (id) => TRICKS.find((t) => t.id === id).check;

const CASES = {
  layers: [
    [bar({ drums: 'rock' }), bar({ drums: 'rock', bass: 'roots' }), bar(band), bar({ ...band, keys: 'pad' })],
    [bar({ drums: 'rock' }), bar({ drums: 'rock', bass: 'roots' }), bar({ ...band, keys: 'pad' }), bar({ ...band, keys: 'pad' })],
  ],
  pop: [chords(0, 4, 5, 3), chords(0, 4, 3, 5)],
  sad: [chords(5, 3, 0, 4), chords(5, 3, 0, 0)],
  dropout: [
    [bar(band), bar({ drums: 'rock' }), bar(band)],
    [bar(band), bar({}), bar(band)], // silence is a stop, not a drop-out
  ],
  chorus: [
    [bar({ guitar: 'chug' }), bar({ guitar: 'chug' }), bar({ guitar: 'strum' })],
    [bar({ guitar: 'ring' }), bar({ guitar: 'chug' }), bar({ guitar: 'strum' })],
  ],
  breakdown: [
    [bar({ drums: 'half' }), bar({ drums: 'half' }), bar({ drums: 'punk' })],
    [bar({ drums: 'half' }), bar({ drums: 'half' }), bar({ drums: 'disco' })],
  ],
  sweep: [
    [bar(band, { fMin: -1, fEnd: -1 }), bar(band, { fMin: -0.6, fEnd: 0 })],
    [bar(band, { fMin: -0.6, fEnd: -0.6 }), bar(band, { fMin: -0.6, fEnd: 0 })],
  ],
  room: [
    [bar(band, { vol: { ...bar({}).vol, guitar: 0.3 } }), bar(band, { vol: { ...bar({}).vol, guitar: 0.8 } })],
    [bar(band, { vol: { ...bar({}).vol, guitar: 0.3 } }), bar(band, { vol: { ...bar({}).vol, guitar: 0.5 } })],
  ],
  gear: [[bar(band), bar(band, { key: 1 })], [bar(band), bar(band, { key: 5 })]],
  pump: [
    [bar({ drums: 'rock', keys: 'pad' }, { fx: fx('keys', 'pump') }), bar({ drums: 'rock', keys: 'pad' }, { fx: fx('keys', 'pump') })],
    [bar({ drums: 'rock', bass: 'roots' }, { fx: fx('keys', 'pump') }), bar({ drums: 'rock', bass: 'roots' }, { fx: fx('keys', 'pump') })], // pump on a silent row
  ],
  echo: [
    [bar({ keys: 'arp' }, { fx: fx('keys', 'echo') }), bar({ keys: 'arp' }, { fx: fx('keys', 'echo') })],
    [bar({ keys: 'arp' }, { fx: fx('keys', 'echo') }), bar({ keys: 'arp' })],
  ],
  gate: [
    [bar({ drums: 'rock' }, { fx: fx('drums', 'gate') }), bar({ drums: 'rock' }, { fx: fx('drums', 'gate') })],
    [bar({ bass: 'roots' }, { fx: fx('drums', 'gate') }), bar({ bass: 'roots' }, { fx: fx('drums', 'gate') })],
  ],
  title: [title(100), title(120)],
};
function fx(row, name) { return { [row]: { [name]: true } }; }
function title(bpm) {
  return [5, 5, 3, 3, 0, 0, 4, 4].map((chord) => bar({ drums: 'sw-gated', guitar: 'sw-updown', keys: 'sw-wide' }, { style: 'synth', bpm, chord }));
}

test('every trick has a case here', () => assert.deepEqual(Object.keys(CASES).sort(), TRICKS.map((t) => t.id).sort()));
for (const [id, [yes, no]] of Object.entries(CASES)) {
  test(`trick "${id}" ticks when done, and not on a near miss`, () => {
    assert.equal(trick(id)(yes), true);
    assert.equal(trick(id)(no), false);
  });
}

test('a trick does not count across a stop and a new start', () => {
  const h = chords(0, 4, 5, 3);
  h[2].run = h[3].run = 2;
  assert.equal(trick('pop')(h), false);
});
