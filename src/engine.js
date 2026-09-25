// Audio: the clip cache and its workers, the mixer, and the bar scheduler.
//
// `next` is what the band will play from the next bar line: the pads, chord, key and tempo. Taps change `next`.
// Each time a bar is placed, `next` is copied into a bar record in `history`, and that record is what you hear.
import { clipKey, PRE } from './render.js';
import { ROWS } from './pads.js';

export const ROW_IDS = ROWS.map((r) => r.id);
const LOOKAHEAD = 0.15, LOOKAHEAD_HIDDEN = 2.5; // a hidden tab runs timers once a second at best
const CHOKE = 0.02; // how fast a pitched row's old clip fades when its next one starts
const SEND = { drums: 0.1, bass: 0, guitar: 0.12, keys: 0.3 }; // how much of each row goes to the reverb

export class Engine {
  constructor(onBar) {
    this.onBar = onBar;
    this.next = { chord: 0, key: 0, bpm: 120, pads: Object.fromEntries(ROW_IDS.map((r) => [r, null])) };
    this.vol = Object.fromEntries(ROW_IDS.map((r) => [r, 0.8]));
    this.filter = 0;
    this.history = [];
    this.run = 0;
    this.playing = false;
    this.cache = new Map(); // clip key → { state: 'queued' | 'rendering' | 'ready', spec, buffer }
    this.queue = [];
    this.waiting = []; // clips a placed bar needs that aren't ready yet: { row, key, rec }
    this.sources = Object.fromEntries(ROW_IDS.map((r) => [r, []]));
    this.ctx = new AudioContext();
    this.buildMixer();
    this.startWorkers();
    this.prefetch();
  }

  /* ---- mixer: rows → DJ filter → compressor → limiter → speakers, with a shared reverb */
  buildMixer() {
    const c = this.ctx;
    this.lowpass = new BiquadFilterNode(c, { type: 'lowpass', frequency: 20000, Q: 1.2 });
    this.highpass = new BiquadFilterNode(c, { type: 'highpass', frequency: 20, Q: 1.2 });
    const glue = new DynamicsCompressorNode(c, { threshold: -14, knee: 6, ratio: 3, attack: 0.01, release: 0.2 });
    const limit = new DynamicsCompressorNode(c, { threshold: -2, knee: 0, ratio: 20, attack: 0.001, release: 0.1 });
    const out = new GainNode(c, { gain: 0.9 });
    this.lowpass.connect(this.highpass).connect(glue).connect(limit).connect(out).connect(c.destination);
    const verb = new ConvolverNode(c, { buffer: roomEcho(c, 1.6) });
    verb.connect(this.lowpass);
    this.lanes = {};
    for (const r of ROW_IDS) {
      const g = new GainNode(c, { gain: this.vol[r] ** 2 }); // squared: the slider feels even across its travel
      g.connect(this.lowpass);
      if (SEND[r]) g.connect(new GainNode(c, { gain: SEND[r] })).connect(verb);
      this.lanes[r] = g;
    }
  }
  setVolume(row, v) {
    this.vol[row] = v;
    this.lanes[row].gain.setTargetAtTime(v * v, this.ctx.currentTime, 0.02);
    const b = this.audible();
    if (b) b.vol[row] = Math.min(b.vol[row], v); // the tricks look for the lowest point in a bar
  }
  // v: -1 (muffled: low-pass down to 200 Hz) … 0 (off) … 1 (thin: high-pass up to 3 kHz)
  setFilter(v) {
    this.filter = v;
    const t = this.ctx.currentTime;
    this.lowpass.frequency.setTargetAtTime(v < 0 ? 20000 * Math.pow(0.01, -v) : 20000, t, 0.03);
    this.highpass.frequency.setTargetAtTime(v > 0 ? 20 * Math.pow(150, v) : 20, t, 0.03);
    const b = this.audible();
    if (b) { b.fMin = Math.min(b.fMin, v); b.fMax = Math.max(b.fMax, v); b.fEnd = v; }
  }

  /* ---- clips: rendered by workers, cached by key */
  startWorkers() {
    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
    this.workers = [];
    for (let i = 0; i < n; i++) {
      const w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => this.onClip(w, e.data);
      this.workers.push(w);
    }
  }
  spec(row, pad, s = this.next) { return { row, pad, chord: s.chord, key: s.key, bpm: s.bpm, sr: this.ctx.sampleRate }; }
  // Queue every clip for the current key and tempo, most urgent first: the lit pads on the next chord, then every
  // pad on the next chord, then everything else.
  prefetch() {
    const s = this.next, lit = [], chord = [], rest = [];
    for (const row of ROWS) for (const pad of row.pads) for (let ci = 0; ci < 6; ci++) {
      const spec = this.spec(row.id, pad.id, { ...s, chord: ci });
      (ci !== s.chord ? rest : s.pads[row.id] === pad.id ? lit : chord).push(spec);
    }
    this.queue = [];
    for (const spec of [...lit, ...chord, ...rest]) {
      const key = clipKey(spec), c = this.cache.get(key);
      if (!c || c.state === 'queued') { this.cache.set(key, { state: 'queued', spec }); this.queue.push(key); }
    }
    this.queue = [...new Set(this.queue)];
    this.pump();
  }
  pump() {
    for (const w of this.workers) {
      if (w.busy) continue;
      let key;
      while ((key = this.queue.shift()) && this.cache.get(key)?.state !== 'queued');
      if (!key) return;
      const c = this.cache.get(key);
      c.state = 'rendering'; w.busy = key;
      w.postMessage({ key, spec: c.spec });
    }
  }
  onClip(w, { key, L, R, error }) {
    w.busy = null;
    const c = this.cache.get(key);
    if (c && error) { console.error('clip', key, error); this.cache.delete(key); }
    else if (c) {
      c.buffer = new AudioBuffer({ numberOfChannels: 2, length: L.length, sampleRate: this.ctx.sampleRate });
      c.buffer.copyToChannel(L, 0); c.buffer.copyToChannel(R, 1);
      c.state = 'ready';
      this.playLate(key);
    }
    this.pump();
  }
  // Clips that aren't for the current key and tempo will never be asked for again.
  forgetOthers() {
    const { key, bpm } = this.next;
    for (const [k, c] of this.cache) if (c.spec.bpm !== bpm || (c.spec.row !== 'drums' && c.spec.key !== key)) this.cache.delete(k);
  }
  progress() {
    let ready = 0;
    for (const c of this.cache.values()) if (c.state === 'ready') ready++;
    return { ready, total: this.cache.size };
  }

  /* ---- what to play next */
  setPad(row, pad) { this.next.pads[row] = pad; this.prefetch(); }
  setChord(ci) { this.next.chord = ci; this.prefetch(); }
  setKey(k) { this.next.key = k; this.forgetOthers(); this.prefetch(); }
  setBpm(bpm) { this.next.bpm = bpm; this.forgetOthers(); this.prefetch(); }

  /* ---- transport */
  async start() {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* older Safari */ } // play through the iPhone silent switch
    await this.ctx.resume();
    if (this.playing) return;
    this.playing = true; this.run++;
    this.nextBarTime = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.tick(), 25);
    this.tick();
  }
  stop() {
    if (!this.playing) return;
    this.playing = false;
    clearInterval(this.timer);
    const t = this.ctx.currentTime;
    for (const r of ROW_IDS) this.choke(r, t, 0.08);
    this.waiting = [];
    this.history = this.history.filter((b) => b.time <= t); // bars placed ahead but never heard
  }
  tick() {
    const ahead = document.hidden ? LOOKAHEAD_HIDDEN : LOOKAHEAD;
    while (this.nextBarTime < this.ctx.currentTime + ahead) this.placeBar();
  }
  placeBar() {
    const s = this.next, t = this.nextBarTime;
    const rec = { run: this.run, time: t, len: 240 / s.bpm, chord: s.chord, key: s.key, bpm: s.bpm, pads: { ...s.pads },
      vol: { ...this.vol }, fMin: this.filter, fMax: this.filter, fEnd: this.filter };
    for (const row of ROW_IDS) {
      const pad = rec.pads[row];
      // pitched rows stop their old sound at the bar line; drums let cymbals ring over it unless the row stops
      if (row !== 'drums' || !pad) this.choke(row, t, pad ? CHOKE : 0.15);
      if (!pad) continue;
      const key = clipKey(this.spec(row, pad, rec)), c = this.cache.get(key);
      if (c?.state === 'ready') this.playClip(row, c.buffer, t);
      else { this.waiting.push({ row, key, rec }); if (!c) this.prefetch(); }
    }
    this.history.push(rec);
    if (this.history.length > 400) this.history.splice(0, 100);
    this.nextBarTime = t + rec.len;
    this.onBar(rec);
  }
  // A clip that arrives after its bar began still plays, from the point the bar has reached.
  playLate(key) {
    const now = this.ctx.currentTime;
    this.waiting = this.waiting.filter((w) => {
      if (w.rec.time + w.rec.len - 0.1 < now) return false; // too late: its bar is over
      if (w.key !== key || !this.playing) return true;
      this.playClip(w.row, this.cache.get(key).buffer, w.rec.time);
      return false;
    });
  }
  playClip(row, buffer, barTime) {
    const c = this.ctx, src = new AudioBufferSourceNode(c, { buffer }), g = new GainNode(c);
    src.connect(g).connect(this.lanes[row]);
    const at = barTime - PRE, now = c.currentTime;
    if (at >= now) src.start(at); else src.start(now, now - at);
    const item = { src, g, at };
    this.sources[row].push(item);
    src.onended = () => { const list = this.sources[row], i = list.indexOf(item); if (i >= 0) list.splice(i, 1); };
  }
  // Fade out everything this row started before time t.
  choke(row, t, fade) {
    for (const s of this.sources[row]) {
      if (s.at >= t - PRE - 0.001 || s.choked) continue;
      s.choked = true;
      const from = Math.max(t - 0.005, this.ctx.currentTime);
      s.g.gain.setValueAtTime(1, from);
      s.g.gain.linearRampToValueAtTime(0, from + fade);
      s.src.stop(from + fade + 0.01);
    }
  }

  /* ---- what you hear now (for the screen) */
  // The speakers lag the audio clock by the output latency, so the screen follows the lagged time.
  now() { return this.ctx.currentTime - (this.ctx.outputLatency || this.ctx.baseLatency || 0); }
  audible() {
    if (!this.playing) return null;
    const now = this.now();
    for (let i = this.history.length - 1; i >= 0; i--) if (this.history[i].time <= now) return this.history[i];
    return null;
  }
}

// A room's echo, made in code: stereo noise that dies away over `seconds`, duller as it fades (as walls soak up highs).
function roomEcho(c, seconds) {
  const n = Math.round(seconds * c.sampleRate), b = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: c.sampleRate });
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch), pre = Math.round(0.015 * c.sampleRate);
    let lp = 0;
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / c.sampleRate, k = 0.5 + 0.45 * Math.exp(-t / 0.25);
      lp += k * ((Math.random() * 2 - 1) - lp);
      d[i] = lp * Math.exp((-6.9 * t) / seconds);
    }
  }
  return b;
}
