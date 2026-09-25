// The styles and their pads. A style is a band: four rows filling the four lanes (drums, bass, guitar, keys; the lane
// ids are the rock band's, other styles give each lane its own name and sound). Pad ids are unique within a lane
// across styles, so a pad id alone says what to play.
// Every pad is one bar, counted in eighth notes (a bar holds 8; 0.5 is a sixteenth).
//   Drum pads:    hits  [eighth, drum, strength]
//   Pitched pads: notes [eighth, length in eighths, scale steps above the chord's root, strength, options]
// A pitched pad never names a note: step 0 is the chord's root, 2 its third, 4 its fifth, 7 the root an octave up.
// So every pad fits every chord in every key.
import { chordRootPc, rootFrom, scaleStep } from './theory.js';

const eighths = (f) => Array.from({ length: 8 }, (_, e) => f(e));
const POWER = [0, 4, 7], TRIAD = [0, 2, 4];

// Each row also has: low (its lowest chord root), trim (level in dB, set with npm run levels), tail (seconds it may
// ring past the bar line), fade (seconds the old clip takes to fade when the next one starts).
const ROCK = [
  {
    id: 'drums', name: 'Drums', keys: 'QWER', color: '#f2b441', role: 'the beat', trim: -7.5, tail: 0.6, fade: 0.02,
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
    id: 'bass', name: 'Bass', keys: 'ASDF', low: 28, color: '#ef5f8a', role: 'the low end', trim: -1, tail: 0.4, fade: 0.02, // roots E1–D♯2
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
    id: 'guitar', name: 'Guitar', keys: 'ZXCV', low: 40, color: '#ff8a4c', role: 'the power', trim: -18, tail: 0.6, fade: 0.02, // roots E2 (the low string)–D♯3
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
    id: 'keys', name: 'Keys', keys: 'UIOP', low: 53, color: '#a88bff', role: 'the colour', trim: -10.5, tail: 0.8, fade: 0.25, // roots F3–E4
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

// Synthwave: after Punch Clock's title music. A drum machine, a synth bass, an arpeggio and a pad.
const SYNTH = [
  {
    id: 'drums', name: 'Drum machine', keys: 'QWER', color: '#ffb347', role: 'the beat', trim: -3, tail: 0.6, fade: 0.02,
    about: 'A [[drum machine]] plays every hit exactly on the grid and exactly as hard. That machine precision is part of the sound.',
    pads: [
      {
        id: 'sw-gated', name: 'Gated', kit: 'machine',
        tip: 'The Punch Clock title beat: [[kick]] on 1 and 3, [[snare]] on 2 and 4, a [[hi-hat]] on each [[offbeat]]. Gate is on.',
        why: 'With [[gated reverb]] the snare fills a huge room for an instant, then stops dead: the 1980s sound.',
        hits: [[0, 'kick', 1], [4, 'kick', 1], [2, 'snare', 1], [6, 'snare', 1], ...[1, 3, 5, 7].map((e) => [e, 'hat', 0.8])],
      },
      {
        id: 'sw-four', name: 'Four', kit: 'machine',
        tip: '[[four on the floor|Four on the floor]] with a [[clap]] on 2 and 4 and open hi-hats between the beats.',
        why: 'The pulse of synth-pop and house. With Pump on, the whole band breathes on every beat.',
        hits: [...[0, 2, 4, 6].map((e) => [e, 'kick', 1]), [2, 'clap', 1], [6, 'clap', 1], ...[1, 3, 5, 7].map((e) => [e, 'open', 0.7])],
      },
      {
        id: 'sw-half', name: 'Half', kit: 'machine',
        tip: '[[half-time|Half-time]]: one snare, on beat 3. Slow and heavy.',
        why: 'Drops the energy for a quiet section without changing the tempo.',
        hits: [[0, 'kick', 1], [5, 'kick', 0.8], [4, 'snare', 1], ...[0, 2, 4, 6].map((e) => [e, 'hat', 0.7])],
      },
      {
        id: 'sw-drive', name: 'Drive', kit: 'machine',
        tip: 'Hi-hats on every [[sixteenth note]], kick and snare pushing underneath.',
        why: 'Sixteenth hats make the same tempo feel twice as busy: night-drive energy.',
        hits: [...Array.from({ length: 16 }, (_, k) => [k / 2, 'hat', k % 4 === 0 ? 0.8 : k % 2 ? 0.45 : 0.6]), [0, 'kick', 1], [3, 'kick', 0.9], [4, 'kick', 1], [2, 'snare', 1], [6, 'snare', 1]],
      },
    ],
  },
  {
    id: 'bass', name: 'Synth bass', keys: 'ASDF', low: 31, color: '#ff4fa3', role: 'the low end', trim: -14, tail: 0.3, fade: 0.02, // roots G1–F♯2
    about: 'A [[sawtooth wave]] through a closing filter, with a [[sine wave]] at the same pitch for weight. Pump on: it ducks under every kick.',
    pads: [
      {
        id: 'sw-pulse', name: 'Pulse', voice: 'sbass',
        tip: 'The title bass: the [[root]] on every [[beat]], jumping an [[octave]] on beat 4.',
        why: 'Notes on the beat lock the bass to the kick; the octave jump at the end of the bar pulls you into the next one.',
        notes: [[0, 1.5, [0], 1], [2, 1.5, [0], 0.9], [4, 1.5, [0], 0.95], [6, 1.5, [7], 0.9]],
      },
      {
        id: 'sw-oct', name: 'Octaves', voice: 'sbass',
        tip: 'Root and octave bouncing on every [[eighth note]]. The classic synthwave bass.',
        why: 'Octaves add motion without new notes, so the bass drives while the chord stays clear.',
        notes: eighths((e) => [e, 0.8, [e % 2 ? 7 : 0], e % 2 ? 0.8 : 1]),
      },
      {
        id: 'sw-roll', name: 'Roll', voice: 'sbass',
        tip: 'Three [[sixteenth note|sixteenths]] after each beat: root, root, octave. The beat itself is left to the kick.',
        why: 'Leaving the beat empty and filling the gaps around it makes the kick and bass sound like one instrument.',
        notes: [0, 2, 4, 6].flatMap((b) => [[b + 0.5, 0.45, [0], 0.8], [b + 1, 0.45, [0], 0.9], [b + 1.5, 0.45, [b === 6 ? 4 : 7], 0.85]]),
      },
      {
        id: 'sw-sub', name: 'Sub', voice: 'sub', gain: -4,
        tip: 'One long, pure [[sine wave]] on the root: the [[sub bass]].',
        why: 'You feel a sub more than hear it. It fills the floor under the pad without getting in anyone\'s way.',
        notes: [[0, 8, [0], 1]],
      },
    ],
  },
  {
    id: 'guitar', name: 'Arp', keys: 'ZXCV', low: 57, color: '#3ee6ff', role: 'the motion', trim: -9, tail: 0.6, fade: 0.1, // roots A3–G♯4
    about: 'A lead synth playing [[arpeggio|arpeggios]] and hooks. Echo is on: a [[dotted eighth]] [[echo]] fills the gaps between its notes.',
    pads: [
      {
        id: 'sw-updown', name: 'Up-down', voice: 'sqpluck',
        tip: "The title arp: the chord's notes up and down in eighths, on a [[square wave]] that plucks.",
        why: 'With Echo, each note answers itself a dotted eighth later, so eight notes a bar sound like a rolling sixteenth pattern.',
        notes: [0, 2, 4, 7, 9, 7, 4, 2].map((s, e) => [e, 0.9, [s], e % 4 ? 0.8 : 1]),
      },
      {
        id: 'sw-rush', name: 'Rush', voice: 'pluck',
        tip: 'A fast [[sawtooth wave|saw]] [[arpeggio]] in sixteenths, climbing the chord again and again.',
        why: 'Short notes with a filter that snaps shut sound like a machine running: tension without volume.',
        notes: Array.from({ length: 16 }, (_, k) => [k / 2, 0.45, [[0, 2, 4, 7][k % 4]], k % 4 ? 0.7 : 1]),
      },
      {
        id: 'sw-hook', name: 'Hook', voice: 'lead',
        tip: 'A singing lead line with [[vibrato]]: fifth, sixth, fifth, third, root.',
        why: 'A short tune that ends on the root sounds finished, so it can repeat forever without tiring.',
        notes: [[0, 1.4, [4], 1], [1.5, 1.4, [5], 0.9], [3, 0.9, [4], 0.9], [4, 1.9, [2], 0.95], [6, 1.9, [0], 0.9]],
      },
      {
        id: 'sw-stabs', name: 'Stabs', voice: 'stab', gain: 2,
        tip: 'Short chord [[stab|stabs]] on every [[offbeat]].',
        why: 'Chords between the beats leave the beats to the drums: the two parts lock together.',
        notes: [1, 3, 5, 7].map((e) => [e, 0.4, TRIAD, e === 7 ? 1 : 0.85]),
      },
    ],
  },
  {
    id: 'keys', name: 'Pad', keys: 'UIOP', low: 53, color: '#9d6bff', role: 'the colour', trim: -10.5, tail: 1, fade: 0.35, // roots F3–E4
    about: 'Held chords that fill the background. Three [[sawtooth wave|saws]] per note, a little out of tune with each other ([[detune]]), sound wide and warm. Pump is on.',
    pads: [
      {
        id: 'sw-wide', name: 'Wide', voice: 'pad3',
        tip: 'The title pad: the [[triad]] plus the root an octave up, each note three detuned saws.',
        why: 'Detuned copies drift in and out of step, which makes one synth sound like a string section.',
        notes: [[0, 8, [...TRIAD, 7], 0.8]],
      },
      {
        id: 'sw-swell', name: 'Swell', voice: 'swell', gain: -1,
        tip: 'A chord whose [[low-pass filter]] slowly opens across the bar: dark to bright.',
        why: 'A sound that brightens feels like it is rising, even on one chord. A small [[build-up]] every bar.',
        notes: [[0, 8, TRIAD, 0.8]],
      },
      {
        id: 'sw-chop', name: 'Chop', voice: 'chop', gain: 4,
        tip: 'The chord cut into [[sixteenth note|sixteenths]], like a pad switched on and off very fast.',
        why: 'Chopping a held chord turns it into rhythm. With Pump on, the chops swell back after each kick.',
        notes: Array.from({ length: 16 }, (_, k) => [k / 2, 0.35, TRIAD, k % 4 === 0 ? 1 : 0.75]),
      },
      {
        id: 'sw-bells', name: 'Bells', voice: 'fm', reg: 12,
        tip: "Glassy bells on the chord's notes, one per beat. Made with [[fm synthesis|FM synthesis]].",
        why: 'Bells have a bright attack and a long ring, so a few notes fill a lot of space.',
        notes: [[0, 2, [7], 1], [2, 2, [4], 0.85], [4, 2, [2], 0.9], [6, 2, [4], 0.8]],
      },
    ],
  },
];

export const LANES = ['drums', 'bass', 'guitar', 'keys'];
export const STYLES = [
  { id: 'rock', name: 'Rock', about: 'A four-piece rock band: drums, bass, a distorted guitar recorded twice, and a synth.',
    why: 'Real players, copied in code: plucked strings through an [[distortion|overdriven]] amp, drums a little off the grid like a person plays them. The guitar and bass carry the chords as [[power chord|power chords]] and roots.',
    fx: {}, rows: ROCK },
  {
    id: 'synth', name: 'Synthwave',
    about: 'Night-drive 1980s synths, after Punch Clock\'s title music: a drum machine with a gated snare, a pumping bass and pad, and an echoing arpeggio.',
    why: 'Everything is a [[synthesizer]] or a [[drum machine]], locked to the grid. [[sawtooth wave|Saw waves]] through a [[low-pass filter]] make the bass and pads; a [[gated reverb]] makes the big 80s snare; a [[sidechain pump]] makes the bass and pad breathe with the kick; and an [[echo]] on the [[arpeggio]] fills the gaps. Try it at 100 BPM on vi, IV, I, V.',
    fx: { drums: { gate: true }, bass: { pump: true }, guitar: { echo: true }, keys: { pump: true } },
    rows: SYNTH,
  },
];
export const styleById = (id) => STYLES.find((s) => s.id === id);
export const rowOf = (styleId, lane) => styleById(styleId).rows.find((r) => r.id === lane);
// The row, in whichever style, that holds a pad.
export const rowOfPad = (lane, padId) => STYLES.map((s) => rowOf(s.id, lane)).find((r) => r.pads.some((p) => p.id === padId));
export const padById = (lane, padId) => rowOfPad(lane, padId).pads.find((p) => p.id === padId);

// Switching style: each playing lane moves to the pad in the same position in the new style.
export function mapPads(pads, styleId) {
  return Object.fromEntries(Object.entries(pads).map(([lane, id]) => [lane, id && rowOf(styleId, lane).pads[rowOfPad(lane, id).pads.findIndex((p) => p.id === id)].id]));
}

// A pitched pad's notes as MIDI numbers over one chord in one key.
export function padNotes(lane, padId, key, ci) {
  const row = rowOfPad(lane, padId), pad = padById(lane, padId);
  const root = rootFrom(chordRootPc(key, ci), row.low + (pad.reg || 0));
  return pad.notes.map(([e, len, steps, vel, opts]) => ({ e, len, vel, ...opts, midis: steps.map((s) => scaleStep(root, s, key)) }));
}
