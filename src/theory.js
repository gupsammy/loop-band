// Keys, chords and scales. Notes are MIDI numbers (60 = middle C); a pitch class is a note number mod 12 (C = 0).

export const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
// Semitones above the key note for the seven notes of a major scale.
export const MAJOR = [0, 2, 4, 5, 7, 9, 11];

// The six chords the chord pads offer: built on scale degrees 1–6 of the key.
export const CHORDS = [
  { roman: 'I', degree: 0, feel: 'Home. Songs usually start and end here.' },
  { roman: 'ii', degree: 1, feel: 'A soft minor chord that likes to lead on to V.' },
  { roman: 'iii', degree: 2, feel: 'Shares two notes with I: home, but moodier.' },
  { roman: 'IV', degree: 3, feel: 'Steps away from home. Bright and open.' },
  { roman: 'V', degree: 4, feel: '[[tension|Tension]]: it wants to go back to I.' },
  { roman: 'vi', degree: 5, feel: 'The sad twin of I (they share two notes). I – V – vi – IV is the most used [[progression]] in pop.' },
];

export const mod12 = (x) => ((x % 12) + 12) % 12;
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const noteName = (m) => NOTE_NAMES[mod12(m)] + (Math.floor(m / 12) - 1);

export const scalePcs = (key) => MAJOR.map((s) => mod12(key + s));
export const inKey = (m, key) => scalePcs(key).includes(mod12(m));
export const chordRootPc = (key, ci) => mod12(key + MAJOR[CHORDS[ci].degree]);

// The note `steps` scale steps from note m (m must be in the key). Steps can be negative.
export function scaleStep(m, steps, key) {
  const pcs = scalePcs(key), dir = Math.sign(steps);
  let x = m;
  for (let k = Math.abs(steps); k > 0;) { x += dir; if (pcs.includes(mod12(x))) k--; }
  return x;
}

// The lowest note of pitch class pc at or above `low`.
export const rootFrom = (pc, low) => low + mod12(pc - low);

// A chord is major when its third is 4 semitones up, minor when 3.
export function chordName(key, ci) {
  const root = rootFrom(chordRootPc(key, ci), 48);
  const minor = scaleStep(root, 2, key) - root === 3;
  return NOTE_NAMES[mod12(root)] + (minor ? 'm' : '');
}
