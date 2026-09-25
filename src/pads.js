// The pad catalog. Every pad is one bar, counted in eighth notes (a bar holds 8; 0.5 is a sixteenth).
//   Drum pads:    hits  [eighth, drum, strength]
//   Pitched pads: notes [eighth, length in eighths, scale steps above the chord's root, strength, options]
// A pitched pad never names a note: step 0 is the chord's root, 2 its third, 4 its fifth, 7 the root an octave up.
// So every pad fits every chord in every key.
import { chordRootPc, rootFrom, scaleStep } from './theory.js';

const eighths = (f) => Array.from({ length: 8 }, (_, e) => f(e));
const POWER = [0, 4, 7], TRIAD = [0, 2, 4];

export const ROWS = [
  {
    id: 'drums', name: 'Drums', keys: 'QWER', color: '#f2b441', role: 'the beat',
    about: 'Drums keep time. The [[kick]] and [[snare]] carry the [[beat]]; the [[hi-hat]] fills in between. Change the drums and the whole song changes feel.',
    pads: [
      {
        id: 'rock', name: 'Rock',
        tip: '[[kick|Kick]] on beats 1 and 3, [[snare]] on 2 and 4, [[hi-hat]] on every [[eighth note]].',
        why: 'The snare on 2 and 4 is the [[backbeat]]: the beat people clap along to in almost every pop and rock song.',
        hits: [...eighths((e) => [e, 'hat', e % 2 ? 0.55 : 0.8]), [0, 'kick', 1], [4, 'kick', 1], [5, 'kick', 0.8], [2, 'snare', 1], [6, 'snare', 1]],
      },
      {
        id: 'punk', name: 'Punk',
        tip: 'Kick and snare take turns on every eighth note. Fast and frantic.',
        why: 'Twice as many snare hits doubles the energy without changing the tempo.',
        hits: [...eighths((e) => [e, 'hat', e % 2 ? 0.6 : 0.75]), ...eighths((e) => (e % 2 ? [e, 'snare', e === 7 ? 1 : 0.85] : [e, 'kick', 1]))],
      },
      {
        id: 'half', name: 'Half',
        tip: '[[half-time|Half-time]]: the snare only on beat 3, so the song feels half as fast though the tempo has not changed.',
        why: 'Good for heavy breakdowns or a calm verse. The pulse slows while everything else keeps moving.',
        hits: [[0, 'kick', 1], [5, 'kick', 0.8], [4, 'snare', 1], [0, 'hat', 0.8], [2, 'hat', 0.6], [4, 'hat', 0.7], [6, 'open', 0.55]],
      },
      {
        id: 'disco', name: 'Disco',
        tip: '[[four on the floor|Four on the floor]]: a kick on every [[beat]], an open hi-hat on the [[offbeat|offbeats]], snare on 2 and 4.',
        why: 'A kick on every beat is the easiest pulse to dance to. House and disco are built on it.',
        hits: [...[0, 2, 4, 6].map((e) => [e, 'kick', 1]), ...[1, 3, 5, 7].map((e) => [e, 'open', 0.6]), [2, 'snare', 0.9], [6, 'snare', 0.9], ...[0, 2, 4, 6].map((e) => [e, 'hat', 0.45])],
      },
    ],
  },
  {
    id: 'bass', name: 'Bass', keys: 'ASDF', low: 28, color: '#ef5f8a', role: 'the low end', // roots from E1 up to D♯2
    about: 'The bass joins the drums to the chords. It plays low, mostly the chord\'s [[root]], so you feel it more than hear it.',
    pads: [
      {
        id: 'roots', name: 'Roots',
        tip: "The chord's [[root]] note on every eighth. Always right.",
        why: 'The root is the note the chord is named after, so it holds the harmony down.',
        notes: eighths((e) => [e, 0.9, [0], e % 2 ? 0.8 : 0.95]),
      },
      {
        id: 'octaves', name: 'Octaves',
        tip: 'The root, then the same note an [[octave]] up, bouncing on every eighth.',
        why: 'An octave up is the same note vibrating twice as fast. It adds movement without adding new harmony.',
        notes: eighths((e) => [e, 0.9, [e % 2 ? 7 : 0], e % 2 ? 0.85 : 0.95]),
      },
      {
        id: 'fifths', name: 'Fifths',
        tip: 'Two roots, then two [[fifth|fifths]] (4 [[scale step|scale steps]] up), and again.',
        why: 'After the root, the fifth is the steadiest note in a chord. Rock and country bass lives on root and fifth.',
        notes: eighths((e) => [e, 0.9, [e % 4 < 2 ? 0 : 4], e % 2 ? 0.8 : 0.95]),
      },
      {
        id: 'hold', name: 'Hold',
        tip: 'One long root note for the whole bar.',
        why: 'Space. A slow bass line leaves room for the drums and guitar.',
        notes: [[0, 8, [0], 1]],
      },
    ],
  },
  {
    id: 'guitar', name: 'Guitar', keys: 'ZXCV', low: 40, color: '#ff8a4c', role: 'the power', // roots from E2 (the low string) up to D♯3
    about: 'An electric guitar through a driven amp ([[distortion]]), recorded twice and panned left and right ([[double-tracking]]). It makes the band loud.',
    pads: [
      {
        id: 'strum', name: 'Strum',
        tip: 'Open power chords [[strum|strummed]] on every eighth. The loud chorus sound.',
        why: 'A [[power chord]] is root + fifth + octave. With no [[third]] it is neither major nor minor, so it fits every chord.',
        notes: eighths((e) => [e, 1, POWER, e === 0 ? 1 : e % 2 ? 0.8 : 0.9]),
      },
      {
        id: 'chug', name: 'Chug',
        tip: '[[palm mute|Palm-muted]] eighths, with the chord ringing open on beat 1.',
        why: 'Resting the picking hand on the strings damps them: short, tight, drum-like. The classic verse sound.',
        notes: eighths((e) => [e, e ? 0.9 : 1, POWER, e === 0 ? 1 : e % 2 ? 0.75 : 0.85, e ? { mute: 0.85 } : undefined]),
      },
      {
        id: 'skank', name: 'Skank', reg: 12, tone: 'crunch', gain: 6,
        tip: 'Short, bright [[upstroke|upstrokes]] of a full [[triad]] between the beats. Ska and reggae.',
        why: 'Playing only between the beats makes the drum beats feel stronger. That push and pull is the [[groove]].',
        notes: [1, 3, 5, 7].map((e) => [e, 0.5, [...TRIAD, 7], e === 7 ? 0.9 : 0.8, { up: true }]),
      },
      {
        id: 'ring', name: 'Ring',
        tip: 'One big chord, left to ring for the whole bar.',
        why: 'A held chord sets the mood and leaves room for a melody on top.',
        notes: [[0, 8, POWER, 1]],
      },
    ],
  },
  {
    id: 'keys', name: 'Keys', keys: 'UIOP', low: 53, color: '#a88bff', role: 'the colour', // roots from F3 up to E4
    about: 'A synth. It plays full chords and melodies higher up, so it decides whether the music sounds [[major|happy]] or [[minor|sad]].',
    pads: [
      {
        id: 'pad', name: 'Pad', voice: 'pad',
        tip: 'A [[synth pad]]: a soft, wide chord held for the whole [[bar]].',
        why: 'Every other note of the [[scale]] (steps 0, 2, 4) makes a triad. Its middle note decides [[major]] or [[minor]].',
        notes: [[0, 8, TRIAD, 0.8]],
      },
      {
        id: 'arp', name: 'Arp', voice: 'pluck',
        tip: "The chord's notes one at a time, up and down, in [[sixteenth note|sixteenth notes]].",
        why: 'An [[arpeggio]] is a chord spread out over time. Your ear still hears the chord, plus movement.',
        notes: [0, 2, 4, 7, 9, 7, 4, 2, 0, 2, 4, 7, 9, 7, 4, 2].map((s, k) => [k / 2, 0.5, [s], k % 4 ? 0.75 : 0.95]),
      },
      {
        id: 'stabs', name: 'Stabs', voice: 'stab',
        tip: 'Short chord [[stab|stabs]] on a 3 + 3 + 2 rhythm.',
        why: 'Splitting the 8 eighths as 3 + 3 + 2 lands hits off the beat, which pushes the music forward.',
        notes: [[0, 0.7, [...TRIAD, 7], 1], [3, 0.7, [...TRIAD, 7], 0.9], [6, 0.7, [...TRIAD, 7], 0.95]],
      },
      {
        id: 'whoa', name: 'Whoa', voice: 'lead', reg: 12,
        tip: 'A sung-style [[riff]]: fifth, third, root. The "whoa-oh" of every pop-punk chorus.',
        why: "Walking down the chord's own notes to its root always sounds settled: a [[resolution]].",
        notes: [[0, 3, [4], 1], [3, 1, [2], 0.9], [4, 3.6, [0], 0.95]],
      },
    ],
  },
];

export const rowById = (id) => ROWS.find((r) => r.id === id);
export const padById = (row, id) => rowById(row).pads.find((p) => p.id === id);

// A pitched pad's notes as MIDI numbers over one chord in one key.
export function padNotes(rowId, padId, key, ci) {
  const row = rowById(rowId), pad = padById(rowId, padId);
  const root = rootFrom(chordRootPc(key, ci), row.low + (pad.reg || 0));
  return pad.notes.map(([e, len, steps, vel, opts]) => ({ e, len, vel, ...opts, midis: steps.map((s) => scaleStep(root, s, key)) }));
}
