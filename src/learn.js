// The words and the tricks. Pure data plus checks, so tests can run them in Node.
// Text anywhere in the app marks a glossary word as [[word]] or [[word|shown text]].

export const WORDS = {
  // time
  'beat': 'The steady pulse you tap your foot to. Here a bar has 4.',
  'bar': 'A group of 4 beats. Every pad here is a one-bar loop.',
  'bpm': 'Beats per minute: the tempo. 120 BPM is two beats a second.',
  'eighth note': 'Half a beat. A bar holds 8. Most pads here are counted in eighths.',
  'sixteenth note': 'A quarter of a beat. A bar holds 16.',
  'offbeat': 'Halfway between two beats: the "and" when you count 1-and-2-and.',
  'backbeat': 'Beats 2 and 4, where the snare usually hits. It is what people clap along to.',
  'half-time': 'The drums play as if the tempo were half as fast, while the song keeps its speed.',
  'four on the floor': 'A kick drum on every beat. The pulse of disco and house.',
  'groove': 'The feel that makes you move: how the parts push and pull against the beat.',
  'loop': 'A short piece of music that repeats. Each pad here is a one-bar loop.',
  // drums
  'kick': 'The big low drum played with a foot pedal. The "boom".',
  'snare': 'The sharp "crack" drum, with metal wires stretched under it.',
  'hi-hat': 'Two cymbals on a stand. Closed it ticks; open it rings.',
  // notes and harmony
  'key': 'The home note and the scale a song uses. In C major, C feels like home.',
  'scale': 'The 7 notes a key uses. C major is C D E F G A B: the white piano keys.',
  'scale step': 'Moving to the next note of the scale. Pads here count notes in scale steps from the chord\'s root.',
  'semitone': 'The smallest step in Western music: from one piano key to the very next one.',
  'chord': 'Three or more notes played together.',
  'root': 'The note a chord is named after. The root of G is G.',
  'third': 'Two scale steps above the root. It decides the mood: 4 semitones up is major, 3 is minor.',
  'fifth': 'Four scale steps above the root. After the root, the steadiest note in a chord.',
  'octave': 'The same note higher or lower. One octave up vibrates twice as fast.',
  'triad': 'A three-note chord: root, third and fifth.',
  'major': 'A chord or key with a bright, happy sound: its third is 4 semitones above the root.',
  'minor': 'A chord or key with a darker, sadder sound: its third is 3 semitones above the root.',
  'power chord': 'Root + fifth (+ octave). No third, so it is neither major nor minor. Loud guitars love it.',
  'roman numerals': 'Chords numbered by where they sit in the key: I is home, V is built on the 5th note. Capitals are major, small letters minor.',
  'progression': 'A series of chords. I – V – vi – IV is the most famous one.',
  'tension': 'A feeling that the music wants to move on. V is full of it.',
  'resolution': 'The feeling of arriving home, as when V moves to I.',
  'key change': 'Moving the whole song up or down. Up one step for the last chorus is the "truck driver\'s gear change".',
  // playing
  'strum': 'Brushing the pick across several strings, so their notes sound a moment apart.',
  'upstroke': 'Strumming upward, high strings first. Lighter and brighter than a downstroke.',
  'palm mute': 'Resting the side of the picking hand on the strings to cut notes short: a tight "chug".',
  'arpeggio': 'The notes of a chord played one at a time instead of together.',
  'stab': 'A short, sharp chord hit.',
  'riff': 'A short, catchy musical phrase that repeats.',
  'synth pad': 'A soft, held synth chord that fills the background.',
  'double-tracking': 'Recording the same part twice and panning the takes left and right. The small differences make it sound wide and thick.',
  'distortion': 'Pushing a signal harder than the amp can take, which rounds and clips it into a gritty, loud sound.',
  // mixing
  'mix': 'Balancing how loud each part is so every one can be heard.',
  'low-pass filter': 'Lets low sounds through and muffles high ones, like music through a wall.',
  'high-pass filter': 'Cuts the low end, so the sound goes thin like a phone speaker.',
  'build-up': 'A stretch where tension grows before a big moment: rising filter, more drums, more parts.',
  'drop': 'The moment everything comes back in after a build-up or a break.',
  'breakdown': 'A stripped-back section: fewer parts, often half-time drums.',
  'arrangement': 'Deciding which parts play when. Taking parts away is as strong as adding them.',
};

// Split text with [[word]] marks into pieces: strings, and { word, text } for glossary words.
export function parseMarks(text) {
  const out = [], re = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push({ word: m[1].toLowerCase(), text: m[2] || m[1] });
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// A bar record, as the engine writes one per bar:
//   { run, chord, key, bpm, pads: { drums, bass, guitar, keys } (pad id or null), vol: { row: 0–1 }, fMin, fMax, fEnd }
// fMin/fMax/fEnd: the DJ filter's lowest, highest and last value during the bar (-1 muffled … 0 off … 1 thin).
const PITCHED = ['bass', 'guitar', 'keys'];
const playingCount = (b) => Object.values(b.pads).filter(Boolean).length;
const pitchedCount = (b) => PITCHED.filter((r) => b.pads[r]).length;
// Every run of `len` consecutive bars (same run of the transport) in the history.
function* windows(h, len) {
  for (let i = 0; i + len <= h.length; i++) if (h[i + len - 1].run === h[i].run) yield h.slice(i, i + len);
}
const some = (h, len, test) => { for (const w of windows(h, len)) if (test(w)) return true; return false; };
const chordsInRow = (seq) => (h) => some(h, seq.length, (w) => w.every((b, i) => b.chord === seq[i] && pitchedCount(b) > 0));

export const TRICKS = [
  {
    id: 'layers', name: 'Build it up',
    how: 'Start with a drums pad alone. Then add one row per bar: bass, then guitar, then keys.',
    why: 'Adding parts one at a time is the simplest [[build-up]]. Each new part is a small event the listener notices.',
    check: (h) => some(h, 4, (w) => w.map(playingCount).join() === '1,2,3,4' && w[0].pads.drums),
  },
  {
    id: 'pop', name: 'The four-chord song',
    how: 'Tap chords I, V, vi, IV (keys 1, 5, 6, 4), one per bar, with the band playing.',
    why: 'This [[progression]] is in hundreds of hit songs. V brings [[tension]], vi makes it bittersweet, IV lifts back towards home.',
    check: chordsInRow([0, 4, 5, 3]),
  },
  {
    id: 'sad', name: 'Same chords, sadder',
    how: 'Play the same four chords starting from vi: vi, IV, I, V (keys 6, 4, 1, 5).',
    why: 'Starting on the [[minor]] chord makes it sound like the song lives there. Same notes, different home.',
    check: chordsInRow([5, 3, 0, 4]),
  },
  {
    id: 'dropout', name: 'Drop out',
    how: 'With the band playing, stop bass, guitar and keys so the drums play alone for a bar or two. Then bring them back.',
    why: 'Taking parts away makes their return hit harder. That return is a [[drop]].',
    // a full bar before, one or two drums-only bars, a full bar after
    check: (h) => [3, 4].some((len) => some(h, len, (w) => pitchedCount(w[0]) >= 2 && pitchedCount(w[len - 1]) >= 2
      && w.slice(1, -1).every((b) => b.pads.drums && pitchedCount(b) === 0))),
  },
  {
    id: 'chorus', name: 'Verse, then chorus',
    how: 'Play guitar Chug for at least two bars, then switch to Strum.',
    why: 'A [[palm mute|palm-muted]] verse holds energy back; open chords release it. Rock songs move between the two.',
    check: (h) => some(h, 3, (w) => w[0].pads.guitar === 'chug' && w[1].pads.guitar === 'chug' && w[2].pads.guitar === 'strum'),
  },
  {
    id: 'breakdown', name: 'Half-time breakdown',
    how: 'Switch drums to Half for two bars, then back to Punk or Rock.',
    why: 'The [[half-time]] beat feels heavy and slow. Snapping back to the fast beat feels like the song takes off.',
    check: (h) => some(h, 3, (w) => w[0].pads.drums === 'half' && w[1].pads.drums === 'half' && ['punk', 'rock'].includes(w[2].pads.drums)),
  },
  {
    id: 'sweep', name: 'Filter build-up',
    how: 'Drag the DJ filter all the way left to muffle the band, then sweep it back to the middle within two bars.',
    why: 'A [[low-pass filter]] hides the high end. Opening it slowly feels like a door opening onto the music: a DJ\'s favourite [[build-up]].',
    check: (h) => [1, 2, 3].some((len) => some(h, len, (w) => w[0].fMin <= -0.8 && Math.abs(w[len - 1].fEnd) < 0.1)),
  },
  {
    id: 'room', name: 'Make room',
    how: 'With bass and guitar playing, pull the guitar\'s volume below halfway until the bass stands out. Then bring the guitar back up.',
    why: 'In a [[mix]], loud parts hide quieter ones. Turning one part down is often better than turning another up.',
    check: (h) => {
      const low = h.findIndex((b) => b.pads.guitar && b.pads.bass && b.vol.guitar <= 0.45);
      return low >= 0 && h.slice(low + 1).some((b) => b.run === h[low].run && b.pads.guitar && b.vol.guitar >= 0.7);
    },
  },
  {
    id: 'gear', name: 'Truck driver\'s gear change',
    how: 'While the band plays, raise the key by one or two semitones (the key menu).',
    why: 'A [[key change]] upward for the last chorus is an old pop trick: everything suddenly sounds brighter and more urgent.',
    check: (h) => some(h, 2, (w) => pitchedCount(w[0]) > 0 && pitchedCount(w[1]) > 0 && [1, 2].includes((w[1].key - w[0].key + 12) % 12)),
  },
];
