// Render every pad over every chord and print each clip's peak and loudness (RMS), per row, plus render time.
// Used to set each row's `trim` (pads.js) so the rows sit at similar levels.   node tools/levels.js [bpm] [style]
import { renderClip } from '../src/render.js';
import { STYLES } from '../src/pads.js';

const bpm = Number(process.argv[2]) || 120, only = process.argv[3], sr = 44100;
const db = (x) => (20 * Math.log10(x)).toFixed(1).padStart(6);
for (const style of STYLES.filter((s) => !only || s.id === only)) {
  console.log(`— ${style.name}`);
  for (const row of style.rows) {
    for (const pad of row.pads) {
      let peak = 0, sum = 0, count = 0, ms = 0;
      const chords = row.id === 'drums' ? 1 : 6;
      for (let chord = 0; chord < chords; chord++) {
        const t = performance.now(), { L, R } = renderClip({ row: row.id, pad: pad.id, chord, key: 0, bpm, sr });
        ms += performance.now() - t;
        for (const ch of [L, R]) for (const v of ch) { const a = Math.abs(v); if (a > peak) peak = a; sum += v * v; count++; }
      }
      console.log(`${row.name.padEnd(13)} ${pad.name.padEnd(8)} peak ${db(peak)} dB   rms ${db(Math.sqrt(sum / count))} dB   ${(ms / chords).toFixed(0).padStart(4)} ms/clip`);
    }
  }
}
