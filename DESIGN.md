# Loop Band — design

A pad board for playing a four-piece band live in the browser. Tap a pad and that
loop joins on the next bar. Tap a chord and every pitched loop follows it. Every
sound is computed in code; there are no samples.

Inspired by the JAM screen of [Claw'd-o-Matic](https://clawd.ajsmithhq.com/),
cut down so each part can be read and understood.

## What you see

```
  LOOP BAND   [▶ START]  STYLE [Rock|Synthwave]  BPM − 120 +  KEY [C major ▾]  ● ● ● ●

  DRUMS   (gate)        [Rock ] [Punk ] [Half ] [Disco]   [stop]
  BASS    (pump)(echo)  [Roots] [Octav] [Fifth] [Hold ]   [stop]
  GUITAR  (pump)(echo)  [Strum] [Chug ] [Skank] [Ring ]   [stop]
  KEYS    (pump)(echo)  [Pad  ] [Arp  ] [Stabs] [Whoa ]   [stop]

  CHORD   [ C  I ] [ Dm ii ] [ Em iii ] [ F IV ] [ G V ] [ Am vi ]

  ┌ What's this? ───────────────────────────────────────────┐
  │ Bass · Octaves: the root note, then the same note an    │
  │ octave up, on every eighth note. Notes now: C2 C3 C2 …  │
  └─────────────────────────────────────────────────────────┘
```

- Each pad draws its own notes as a tiny grid (time across, pitch up). While a
  pad plays, a line sweeps across it, so you see which note you hear.
- A tapped pad blinks until the next bar line, then lights up. Tapping the lit
  pad again, or `stop`, silences that row at the next bar. Tapping a blinking pad
  again takes the tap back. The first pad you tap starts the band.
- Chord changes also wait for the next bar line, so the band never changes chord
  mid-bar.
- The "What's this?" panel explains the last pad or chord you touched, in plain
  words, and names the notes it plays now.
- Keys: `Space` start/stop; rows `Q W E R` / `A S D F` / `Z X C V` / `U I O P`;
  chords `1`–`6`.
- Each row has a volume slider. Below the chords sits the **DJ filter**, one
  slider across the whole band: left muffles it (low-pass), right thins it
  (high-pass), centre is off. Sweeping it back to centre is the classic build-up.

## Effects

Each row head has effect switches. They are mixer settings, so they act at once
(not on the next bar), and tapping one also explains it in "What's this?".

| Switch | Rows | What it does |
|---|---|---|
| **Pump** | bass, guitar, keys | Sidechain pump. Pumped rows share one volume control that dips 55% on every kick of the drums pad now playing and swells back over three 16ths, so the music breathes with the kick. The engine knows each kick's time from the pad's data, so the dips are scheduled in advance, not detected. No drums, no pump. |
| **Echo** | bass, guitar, keys | A send to one shared ping-pong delay: a dotted eighth (three 16ths) long, 35% fed back, darkened each repeat, echoes alternating left and right. The delay follows the tempo from each bar line. |
| **Gate** | drums | Gated reverb, the 1980s snare. Drum clips also carry the snare on its own (a stem). With Gate on, the stem feeds a big reverb whose output opens for 200 ms at each snare hit, then slams shut. |

Wiring: row gain → dry gain → mix, and row gain → wet gain → pump → mix. The
Pump switch cross-fades dry and wet in 20 ms. Echo and Gate are send levels.

## Styles

A style is a band: four rows of pads in the same four lanes. The lane ids
(`drums bass guitar keys`) are the rock band's; other styles give each lane
its own name, colour and sound. A picker in the transport switches style.

- Switching style moves each playing lane to the pad in the same position in
  the new style, from the next bar. Nothing stops.
- Each style brings its own effect settings. Turning an effect off after the
  switch is the fastest way to hear what it adds.
- A row's level, ring-out tail and cross-fade time live on the row, since a
  synth pad that fades in needs a slow cross-fade where a guitar needs a cut.

**Rock**: the band above. No effects on.

**Synthwave** (after punch-clock's title music). Effects: Gate on drums, Pump
on bass and pad, Echo on the arp.

| Lane | Name | Pads |
|---|---|---|
| drums | Drum machine | Gated (kick 1 and 3, snare 2 and 4, off-beat hats), Four (four on the floor with a clap), Half, Drive (16th hats). Exactly on the grid, as a machine plays. |
| bass | Synth bass | Pulse (every beat, octave jump on 4), Octaves (eighths), Roll (16ths around the beat), Sub (one held sine). A saw plus a sine an octave down. |
| guitar | Arp | Up-down (the title arp: square-wave plucks up and down the chord), Rush (16th saw arp), Hook (a lead line with vibrato), Stabs (off-beat chords). |
| keys | Pad | Wide (three detuned saws per note), Swell (filter opens over the bar), Chop (the chord cut into 16ths), Bells (FM bells). |

Pad ids are unique within a lane across styles, so clip keys need no style
field. Each bar in the history still records its style, so a trick can ask
for one.

## Learning as you play

- **Tooltips.** Every pad, chord, slider and button says what it does on hover,
  or on a long press on a phone.
- **Words.** Tips and the "What's this?" panel underline music terms (root,
  fifth, backbeat, palm mute …). Hover or tap one for a one-line meaning. The
  Words tab lists them all. The terms and their meanings live in one table
  (`src/learn.js`); tips mark a term as `[[term]]`.
- **Tricks.** A list of short recipes: "Drop out: stop everything but the drums
  for a bar, then bring it all back", "Play I – V – vi – IV, one chord a bar",
  "Sweep the filter from muffled to open over two bars", "Play the Punch Clock
  title: Synthwave, 100 BPM, vi vi IV IV I I V V". Each trick has a check
  that reads what the band played bar by bar, and ticks itself when you do it.

## Music rules (why nothing sounds wrong)

- The song has a key (C major by default). The six chord pads are the key's own
  chords: I ii iii IV V vi. Their names change with the key; the numbers do not.
- Pads never store note names. A bass or guitar note is "the chord's root", "its
  fifth" or "an octave up". A keys melody is "2 steps up the scale from the chord's
  root". So every pad fits every chord in every key.
- Guitar plays power chords (root, fifth, octave), which have no major or minor
  third and so fit any chord. Keys play full triads, so they carry the major/minor
  colour.
- Timing is counted in eighth notes: a bar holds 8. All pads loop every bar.

## How sound is made

Each (row, pad, chord, key, BPM) combination is one clip: one bar of stereo audio,
computed once and cached. Clips are computed in Web Workers so the page never
stutters, then played back by Web Audio on the bar grid.

| Row | Method |
|---|---|
| Guitar | Karplus–Strong string model: a short burst in a delay line whose length sets the pitch, fed back through a low-pass filter so it rings and dies like a string. The burst is shaped like a string pulled at the pick point. Palm muting raises the damping. The string feeds an amp: gain, two soft-clip stages, a tone filter and a speaker-cabinet EQ. The guitar is computed at twice the sample rate, then filtered and halved, so the distortion stays clean. |
| Bass | The same string model an octave or two down, darker, with light drive. |
| Drums | Kick: a sine wave whose pitch falls fast, plus a click. Snare: two tones plus filtered noise. Hi-hat: high-passed noise with a short (closed) or long (open) tail. |
| Keys | Two slightly detuned saw waves (band-limited so they don't alias) through a resonant low-pass filter with its own envelope. |
| Synth voices | Saw or square waves, two or three per note a few cents apart, an optional sine an octave down, a resonant low-pass whose cutoff falls (pluck) or rises (swell) over the note. Bells are FM: one sine bends the pitch of another at four times its speed. |
| Drum machine | The same drum recipes with no timing wobble, a longer deeper kick, and a clap: three quick noise bursts and a tail. |

What makes it sound played rather than printed:

- The guitar is recorded twice: a left take and a right take, each with its own
  small timing drift, tuning offsets, pick position and strength. Two takes that
  differ slightly sound wide and thick.
- Chords are strummed: strings sound a few milliseconds apart, low to high on a
  downstroke, high to low on an upstroke.
- Every hit gets a small random change in strength. The randomness is seeded
  from the clip's name, so the same clip always sounds the same.

The main thread builds the mix: row volumes, a shared reverb (its echo pattern
is computed decaying noise, not a recording), a gentle compressor and a limiter.

## Timing

- Bar length = 4 × 60 / BPM seconds. Bar *n* starts at `t0 + n × barLength`.
- A scheduler runs every 25 ms and places each bar that starts within the next
  0.15 s (2.5 s when the tab is hidden, where timers slow down). The short look-ahead
  means a tap up to 0.15 s before a bar line still makes that bar.
- Pitched rows choke: when a row's next clip starts, the old one fades out, as a
  player stops the old chord to play the new one: 20 ms for plucked and struck
  rows, a slow cross-fade for pads. Drum clips overlap, so cymbals ring over the
  bar line.
- A clip that isn't computed yet when its bar comes plays silence for that bar.
  The worker queue computes clips for lit pads on the current chord first, then all
  pads on the current chord, then every other chord.
- Changing key or BPM throws away the cache.

## Files

```
index.html, styles.css
src/theory.js        keys, chords, scales, note numbers → frequency (pure)
src/pads.js          styles and their pads: notes as data, names, explanations (pure)
src/learn.js         glossary terms and tricks with their checks (pure)
src/synth/dsp.js     filters, noise, seeded random (pure)
src/synth/*.js       guitar, bass, drums, keys: spec → Float32Array (pure)
src/render.js        one clip spec → { L, R, snare? } (pure; runs in workers and Node)
src/worker.js        the worker wrapper around render.js
src/engine.js        AudioContext, mixer and effects, clip cache, scheduler
src/ui.js            pad board, transport, keyboard, the per-frame lighting
src/guide.js         the guide panel (What's this? · Tricks · Words), tooltips
src/main.js          boot
test/*.test.js       npm test
tools/levels.js      npm run levels: peak and loudness of every clip, for setting row levels
```

Run it with `npm run dev` (http://localhost:8793). The engine is on `window.loopBand` for poking at from
the console.

Everything under `src/` except `engine.js`, `ui.js`, `guide.js`, `main.js` and `worker.js`
runs in Node, so tests measure real output.

## Tests

- A plucked string tuned to a note measures within 0.3% (5 cents) of that pitch.
- Across every pad, chord and key, the keys and bass play only notes in the key's
  scale.
- The same clip spec renders to identical samples twice.
- No clip peaks above 0 dBFS.
- Each trick ticks on a bar history that does it, and not on one that nearly does.
- A drum clip's snare stem holds the snare hits and nothing at the kicks.
- Switching style keeps each playing lane on the pad in the same position.
- Every `[[term]]` in the pads' tips has a glossary entry.

## Later

1. Record: a REC button writes what you played into a row of bars you can replay.
2. Stage: a Three.js band above the board that moves with the music.
3. Songwriter: a seed picks a style, a chord progression and pads for each section.
4. More sounds: amp choice, one-shots (crash, fill), shouts.
