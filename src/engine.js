// Audio: the clip cache and its workers, the mixer, and the bar scheduler.
//
// `next` is what the band will play from the next bar line: the pads, chord, key and tempo. Taps change `next`.
// Each time a bar is placed, `next` is copied into a bar record in `history`, and that record is what you hear.
import { clipKey, PRE } from './render.js';
import { LANES, styleById, rowOf, rowOfPad, padById, mapPads } from './pads.js';

export const ROW_IDS = LANES;
const LOOKAHEAD = 0.15, LOOKAHEAD_HIDDEN = 2.5; // a hidden tab runs timers once a second at best
const SEND = { drums: 0.1, bass: 0, guitar: 0.12, keys: 0.3 }; // how much of each row goes to the reverb
// The effect switches each row has (DESIGN.md, "Effects").
export const FX_OF = { drums: ['gate'], bass: ['pump', 'echo'], guitar: ['pump', 'echo'], keys: ['pump', 'echo'] };
const PUMP_DEPTH = 0.55, ECHO_SEND = 0.4, ECHO_FEEDBACK = 0.35, GATE_OPEN = 0.2;

export class Engine {
  constructor(onBar) {
    this.onBar = onBar;
    this.next = { style: 'rock', chord: 0, key: 0, bpm: 120, pads: Object.fromEntries(ROW_IDS.map((r) => [r, null])) };
    this.vol = Object.fromEntries(ROW_IDS.map((r) => [r, 0.8]));
    this.filter = 0;
    this.fx = Object.fromEntries(ROW_IDS.map((r) => [r, Object.fromEntries(FX_OF[r].map((f) => [f, false]))]));
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
    this.buildEffects();
    this.lanes = {}; this.dry = {}; this.wet = {}; this.echoSend = {};
    for (const r of ROW_IDS) {
      const g = new GainNode(c, { gain: this.vol[r] ** 2 }); // squared: the slider feels even across its travel
      // Pump: the row reaches the mix either directly (dry) or through the shared pump (wet); the switch cross-fades them.
      g.connect(this.dry[r] = new GainNode(c, { gain: 1 })).connect(this.lowpass);
      g.connect(this.wet[r] = new GainNode(c, { gain: 0 })).connect(this.pumpBus);
      if (SEND[r]) g.connect(new GainNode(c, { gain: SEND[r] })).connect(verb);
      if (FX_OF[r].includes('echo')) g.connect(this.echoSend[r] = new GainNode(c, { gain: 0 })).connect(this.echoIn);
      this.lanes[r] = g;
    }
  }
  buildEffects() {
    const c = this.ctx;
    // Sidechain pump: one volume control that placeBar() dips on every kick.
    this.pumpBus = new GainNode(c, { gain: 1 });
    this.pumpBus.connect(this.lowpass);
    // Ping-pong echo: A (left) feeds B (right) feeds A, each repeat darker and quieter than the last.
    this.echoIn = new GainNode(c, { gain: 1, channelCount: 1, channelCountMode: 'explicit' });
    this.delays = [new DelayNode(c, { maxDelayTime: 1, delayTime: 0.375 }), new DelayNode(c, { maxDelayTime: 1, delayTime: 0.375 })];
    const dark = this.delays.map(() => new BiquadFilterNode(c, { type: 'lowpass', frequency: 2600 }));
    const fb = this.delays.map(() => new GainNode(c, { gain: ECHO_FEEDBACK }));
    const lr = new ChannelMergerNode(c, { numberOfInputs: 2 });
    this.echoIn.connect(this.delays[0]);
    this.delays.forEach((d, i) => { d.connect(dark[i]).connect(fb[i]).connect(this.delays[1 - i]); dark[i].connect(lr, 0, i); });
    lr.connect(this.lowpass);
    // Gated reverb: the snare stem feeds a big room whose output only opens for a moment at each snare.
    this.snareVol = new GainNode(c, { gain: this.vol.drums ** 2 }); // the stem follows the drums' volume slider
    this.gateSend = new GainNode(c, { gain: 0 });
    this.snareVol.connect(this.gateSend);
    this.gate = new GainNode(c, { gain: 0 });
    this.gateSend.connect(new ConvolverNode(c, { buffer: roomEcho(c, 1.4) })).connect(this.gate).connect(this.lowpass);
  }
  setFx(row, name, on) {
    this.fx[row][name] = on;
    const t = this.ctx.currentTime, to = (param, v) => param.setTargetAtTime(v, t, 0.007);
    if (name === 'pump') { to(this.dry[row].gain, on ? 0 : 1); to(this.wet[row].gain, on ? 1 : 0); }
    if (name === 'echo') to(this.echoSend[row].gain, on ? ECHO_SEND : 0);
    if (name === 'gate') to(this.gateSend.gain, on ? 1.6 : 0);
  }
  setVolume(row, v) {
    this.vol[row] = v;
    this.lanes[row].gain.setTargetAtTime(v * v, this.ctx.currentTime, 0.02);
    if (row === 'drums') this.snareVol.gain.setTargetAtTime(v * v, this.ctx.currentTime, 0.02);
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
  // Queue every clip of the current style, key and tempo, most urgent first: the lit pads on the next chord, then
  // every pad on the next chord, then everything else.
  prefetch() {
    const s = this.next, lit = [], chord = [], rest = [];
    for (const lane of ROW_IDS) for (const pad of rowOf(s.style, lane).pads) for (let ci = 0; ci < 6; ci++) {
      const spec = this.spec(lane, pad.id, { ...s, chord: ci });
      (ci !== s.chord ? rest : s.pads[lane] === pad.id ? lit : chord).push(spec);
    }
    // a lit pad from another style (possible for a bar after a switch) still needs its clip
    for (const lane of ROW_IDS) if (s.pads[lane]) lit.push(this.spec(lane, s.pads[lane]));
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
  onClip(w, { key, L, R, snare, error }) {
    w.busy = null;
    const c = this.cache.get(key);
    if (c && error) { console.error('clip', key, error); this.cache.delete(key); }
    else if (c) {
      c.buffer = new AudioBuffer({ numberOfChannels: 2, length: L.length, sampleRate: this.ctx.sampleRate });
      c.buffer.copyToChannel(L, 0); c.buffer.copyToChannel(R, 1);
      if (snare) { c.snare = new AudioBuffer({ numberOfChannels: 1, length: snare.length, sampleRate: this.ctx.sampleRate }); c.snare.copyToChannel(snare, 0); }
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
  // A new style: playing lanes move to the pad in the same position, and the style's effect settings switch in.
  setStyle(id) {
    const st = styleById(id);
    this.next.style = id;
    this.next.pads = mapPads(this.next.pads, id);
    for (const lane of ROW_IDS) for (const f of FX_OF[lane]) this.setFx(lane, f, !!st.fx[lane]?.[f]);
    this.prefetch();
  }

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
    for (const [p, v] of [[this.pumpBus.gain, 1], [this.gate.gain, 0]]) { p.cancelScheduledValues(t); p.setTargetAtTime(v, t, 0.02); }
    this.waiting = [];
    this.history = this.history.filter((b) => b.time <= t); // bars placed ahead but never heard
  }
  tick() {
    const ahead = document.hidden ? LOOKAHEAD_HIDDEN : LOOKAHEAD;
    while (this.nextBarTime < this.ctx.currentTime + ahead) this.placeBar();
  }
  placeBar() {
    const s = this.next, t = this.nextBarTime;
    const rec = { run: this.run, style: s.style, time: t, len: 240 / s.bpm, chord: s.chord, key: s.key, bpm: s.bpm, pads: { ...s.pads },
      vol: { ...this.vol }, fx: structuredClone(this.fx), fMin: this.filter, fMax: this.filter, fEnd: this.filter };
    this.scheduleEffects(rec);
    for (const row of ROW_IDS) {
      const pad = rec.pads[row];
      // pitched rows fade their old sound at the bar line (each at its row's pace); drums let cymbals ring over it
      // unless the row stops
      if (row !== 'drums' || !pad) this.choke(row, t, pad ? null : 0.15);
      if (!pad) continue;
      const key = clipKey(this.spec(row, pad, rec)), c = this.cache.get(key);
      if (c?.state === 'ready') this.playClip(row, c, t);
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
      this.playClip(w.row, this.cache.get(key), w.rec.time);
      return false;
    });
  }
  playClip(row, clip, barTime) {
    const fade = rowOfPad(row, clip.spec.pad).fade;
    this.playBuffer(row, clip.buffer, barTime, this.lanes[row], fade);
    if (clip.snare) this.playBuffer(row, clip.snare, barTime, this.snareVol, fade); // the snare alone, into the gated reverb
  }
  playBuffer(row, buffer, barTime, dest, fade) {
    const c = this.ctx, src = new AudioBufferSourceNode(c, { buffer }), g = new GainNode(c);
    src.connect(g).connect(dest);
    const at = barTime - PRE, now = c.currentTime;
    if (at >= now) src.start(at); else src.start(now, now - at);
    const item = { src, g, at, fade };
    this.sources[row].push(item);
    src.onended = () => { const list = this.sources[row], i = list.indexOf(item); if (i >= 0) list.splice(i, 1); };
  }
  // The effects that follow the music, scheduled for one bar: pump dips on its kicks, the gate opening on its snares,
  // and the echo's length for its tempo. They are always scheduled; the switches decide whether you hear them.
  scheduleEffects(rec) {
    const e8 = rec.len / 8, t = rec.time;
    for (const d of this.delays) d.delayTime.setValueAtTime(3 * e8 / 2, t); // a dotted eighth: three 16ths
    const pad = rec.pads.drums && padById('drums', rec.pads.drums);
    if (!pad) return;
    for (const [e, drum] of pad.hits) {
      const at = t + e * e8;
      if (drum === 'kick') {
        this.pumpBus.gain.setTargetAtTime(1 - PUMP_DEPTH, at, 0.004);
        this.pumpBus.gain.setTargetAtTime(1, at + 0.03, e8 / 2); // back up over about three 16ths
      } else if (drum === 'snare' || drum === 'clap') {
        this.gate.gain.setValueAtTime(1, at);
        this.gate.gain.setValueAtTime(1, at + GATE_OPEN);
        this.gate.gain.linearRampToValueAtTime(0, at + GATE_OPEN + 0.03);
      }
    }
  }
  // Fade out everything this row started before time t, over `fade` seconds (null: each clip's own row's pace).
  choke(row, t, fade) {
    for (const s of this.sources[row]) {
      if (s.at >= t - PRE - 0.001 || s.choked) continue;
      s.choked = true;
      const from = Math.max(t - 0.005, this.ctx.currentTime);
      s.g.gain.setValueAtTime(1, from);
      const f = fade ?? s.fade;
      s.g.gain.linearRampToValueAtTime(0, from + f);
      s.src.stop(from + f + 0.01);
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
