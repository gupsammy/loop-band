// The pad board: rows of pads, chords, transport, DJ filter, keyboard, and the frame loop that lights it all in time.
import { LANES, STYLES, rowOf } from './pads.js';
import { CHORDS, NOTE_NAMES, chordName } from './theory.js';
import { roll } from './guide.js';
import { FX_OF } from './engine.js';
import { FX_INFO } from './learn.js';

const $ = (id) => document.getElementById(id);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export function initBoard(engine, guide) {
  /* ---- build the rows: rebuilt whenever the style changes */
  const q = (s) => s.replace(/"/g, '&quot;');
  let rows = [], padEls = {}, stopEls = {}, fxEls = [], keyMap = {};
  function buildRows() {
    rows = LANES.map((lane) => rowOf(engine.next.style, lane));
    $('rows').innerHTML = rows.map((row) => `
    <div class="row" style="--c:${row.color}">
      <div class="row-head" data-row-head="${row.id}" data-tip="${q(row.about)}">
        <b>${row.name}</b><span>${row.role}</span>
        <span class="fx">${FX_OF[row.id].map((f) => `<button class="fx-btn" data-fx="${f}" data-fx-row="${row.id}" aria-pressed="false"
          data-tip="${q(FX_INFO[f].tip)}">${FX_INFO[f].name}</button>`).join('')}</span>
        <input class="vol" type="range" min="0" max="1" step="0.01" value="${engine.vol[row.id]}" data-vol="${row.id}"
          aria-label="${row.name} volume" data-tip="${row.name} volume. Part of the [[mix]]: turning one part down often helps more than turning another up." />
      </div>
      ${row.pads.map((p, i) => `
        <button class="pad" data-row="${row.id}" data-pad="${p.id}" data-tip="${q(p.tip)}" aria-label="${row.name}: ${p.name}">
          <span class="pad-top"><span class="pad-name">${p.name}</span><kbd>${row.keys[i]}</kbd></span>
          ${roll(row.id, p.id)}<span class="head"></span><span class="badge">next bar</span>
        </button>`).join('')}
      <button class="pad stop" data-stop="${row.id}" aria-label="Stop ${row.name}" data-tip="Stop the ${row.name.toLowerCase()} at the next bar line.">stop</button>
    </div>`).join('');
    padEls = {}; stopEls = {}; keyMap = {};
    for (const row of rows) {
      padEls[row.id] = {};
      row.pads.forEach((p, i) => {
        const el = document.querySelector(`[data-row="${row.id}"][data-pad="${p.id}"]`);
        padEls[row.id][p.id] = { el, head: el.querySelector('.head'), rects: [...el.querySelectorAll('rect')], state: '' };
        keyMap[row.keys[i].toLowerCase()] = [row.id, p.id];
      });
      stopEls[row.id] = document.querySelector(`[data-stop="${row.id}"]`);
    }
    fxEls = [...document.querySelectorAll('[data-fx]')];
    document.body.dataset.style = engine.next.style;
  }
  buildRows();
  $('style').innerHTML = STYLES.map((st) => `<button data-style="${st.id}" aria-pressed="false" data-tip="${q(st.about)}">${st.name}</button>`).join('');
  const chordEls = CHORDS.map(() => null);
  function drawChords() {
    const key = engine.next.key;
    $('chords').innerHTML = CHORDS.map((c, i) => `<button class="chord" data-chord="${i}" data-tip="${c.feel.replace(/"/g, '&quot;')}" aria-label="Chord ${chordName(key, i)}">
      <b>${chordName(key, i)}</b><i>${c.roman}</i><kbd>${i + 1}</kbd></button>`).join('');
    document.querySelectorAll('.chord').forEach((el, i) => { chordEls[i] = el; });
  }
  drawChords();
  $('key').innerHTML = NOTE_NAMES.map((n, i) => `<option value="${i}">${n} major</option>`).join('');

  /* ---- actions */
  // Tapping a pad: an idle pad plays from the next bar; tapping the playing pad stops its row; tapping a pad that is
  // waiting for the bar line takes the tap back. The first pad you tap starts the band.
  function tapPad(rowId, padId) {
    const next = engine.next.pads[rowId], heard = engine.audible()?.pads[rowId] ?? null;
    engine.setPad(rowId, next !== padId ? padId : heard === padId ? null : heard);
    if (!engine.playing) engine.start();
    guide.showPad(rowId, padId);
  }
  function tapChord(ci) { engine.setChord(ci); guide.showChord(ci); guide.refresh(); }
  function togglePlay() { if (engine.playing) engine.stop(); else engine.start(); }
  function setBpm(b) { engine.setBpm(clamp(b, 70, 200)); $('bpm').textContent = engine.next.bpm; }

  // Pads answer on pointer down (a pad should feel instant); keyboard presses on a focused button arrive as clicks.
  const onPress = (el, fn) => {
    el.addEventListener('pointerdown', (e) => { if (e.button === 0) fn(e); });
    el.addEventListener('click', (e) => { if (e.detail === 0) fn(e); });
  };
  onPress($('rows'), (e) => {
    const pad = e.target.closest('[data-pad]'), stop = e.target.closest('[data-stop]');
    if (pad) tapPad(pad.dataset.row, pad.dataset.pad);
    else if (stop && !stop.disabled) engine.setPad(stop.dataset.stop, null);
  });
  $('chords').addEventListener('pointerdown', (e) => { const el = e.target.closest('[data-chord]'); if (el) tapChord(+el.dataset.chord); });
  $('chords').addEventListener('click', (e) => { const el = e.target.closest('[data-chord]'); if (el && e.detail === 0) tapChord(+el.dataset.chord); });
  $('rows').addEventListener('click', (e) => {
    const fx = e.target.closest('[data-fx]'), head = e.target.closest('[data-row-head]');
    if (fx) {
      const row = fx.dataset.fxRow, name = fx.dataset.fx;
      engine.setFx(row, name, !engine.fx[row][name]);
      guide.showFx(row, name);
    } else if (head && !e.target.closest('input, button')) guide.showRow(head.dataset.rowHead);
  });
  $('rows').addEventListener('input', (e) => { const el = e.target.closest('[data-vol]'); if (el) engine.setVolume(el.dataset.vol, +el.value); });
  $('style').addEventListener('click', (e) => {
    const el = e.target.closest('[data-style]');
    if (!el || el.dataset.style === engine.next.style) return;
    engine.setStyle(el.dataset.style);
    buildRows();
    guide.showStyle();
  });
  $('play').addEventListener('click', togglePlay);
  $('bpm-down').addEventListener('click', () => setBpm(engine.next.bpm - 5));
  $('bpm-up').addEventListener('click', () => setBpm(engine.next.bpm + 5));
  $('key').addEventListener('change', (e) => { engine.setKey(+e.target.value); drawChords(); guide.refresh(); });
  const filter = $('filter');
  filter.addEventListener('input', () => {
    let v = +filter.value;
    if (Math.abs(v) < 0.05) v = 0; // a dead zone in the middle, so "off" is easy to find
    engine.setFilter(v);
  });
  filter.addEventListener('dblclick', () => { filter.value = 0; engine.setFilter(0); });

  /* ---- keyboard: rows on Q W E R / A S D F / Z X C V / U I O P, chords on 1–6, Space starts and stops */
  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.target.closest('select, input[type=number]')) return;
    const k = e.key.toLowerCase();
    if (k === ' ') { e.preventDefault(); togglePlay(); }
    else if (keyMap[k]) tapPad(...keyMap[k]);
    else if (/^[1-6]$/.test(k)) tapChord(+k - 1);
  });

  /* ---- every frame: light what you hear, blink what's coming, sweep the playheads */
  const beats = [...document.querySelectorAll('#beats i')];
  let lastBar = null;
  function frame() {
    const b = engine.audible(), pos = b ? clamp((engine.now() - b.time) / b.len, 0, 1) : 0, next = engine.next;
    if (b !== lastBar) { lastBar = b; guide.refresh(); } // a new bar reached the speakers
    for (const row of rows) {
      const heard = b ? b.pads[row.id] : null, coming = next.pads[row.id];
      for (const p of row.pads) {
        const P = padEls[row.id][p.id];
        const state = !engine.playing ? (coming === p.id ? 'armed' : '')
          : heard === p.id ? (coming === p.id ? 'on' : 'on leaving') : coming === p.id ? 'queued' : '';
        if (state !== P.state) { P.el.className = 'pad ' + state; P.state = state; if (!state.startsWith('on')) for (const r of P.rects) r.classList.remove('hit'); }
        if (heard === p.id) {
          P.head.style.left = `calc(${pos * 100}% - 1px)`;
          const e8 = pos * 8;
          for (const r of P.rects) { const e = +r.dataset.e; r.classList.toggle('hit', e8 >= e && e8 < e + Math.max(+r.dataset.l, 0.35)); }
        }
      }
      const stop = stopEls[row.id];
      stop.disabled = !heard && !coming;
      stop.classList.toggle('queued', engine.playing && !!heard && !coming);
    }
    const heardChord = b ? b.chord : next.chord;
    chordEls.forEach((el, i) => {
      el.classList.toggle('on', i === heardChord);
      el.classList.toggle('queued', engine.playing && i === next.chord && i !== heardChord);
    });
    for (const el of fxEls) {
      const on = String(engine.fx[el.dataset.fxRow][el.dataset.fx]);
      if (el.getAttribute('aria-pressed') !== on) el.setAttribute('aria-pressed', on);
    }
    for (const el of $('style').children) {
      const on = String(el.dataset.style === next.style);
      if (el.getAttribute('aria-pressed') !== on) el.setAttribute('aria-pressed', on);
    }
    const beat = b ? Math.floor(pos * 4) : -1;
    beats.forEach((el, i) => el.classList.toggle('on', i === beat));
    $('play').classList.toggle('on', engine.playing);
    $('play-label').textContent = engine.playing ? 'Stop' : 'Start';
    const { ready, total } = engine.progress();
    $('status').textContent = ready < total ? `building sounds ${ready}/${total}` : '';
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
