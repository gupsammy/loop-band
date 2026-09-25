// The pad board: rows of pads, chords, transport, DJ filter, keyboard, and the frame loop that lights it all in time.
import { ROWS } from './pads.js';
import { CHORDS, NOTE_NAMES, chordName } from './theory.js';
import { roll } from './guide.js';

const $ = (id) => document.getElementById(id);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

export function initBoard(engine, guide) {
  /* ---- build the rows */
  const padEls = {}, stopEls = {};
  $('rows').innerHTML = ROWS.map((row) => `
    <div class="row" style="--c:${row.color}">
      <div class="row-head" data-row-head="${row.id}" data-tip="${row.about.replace(/"/g, '&quot;')}">
        <b>${row.name}</b><span>${row.role}</span>
        <input class="vol" type="range" min="0" max="1" step="0.01" value="${engine.vol[row.id]}" data-vol="${row.id}"
          aria-label="${row.name} volume" data-tip="${row.name} volume. Part of the [[mix]]: turning one part down often helps more than turning another up." />
      </div>
      ${row.pads.map((p, i) => `
        <button class="pad" data-row="${row.id}" data-pad="${p.id}" data-tip="${p.tip.replace(/"/g, '&quot;')}" aria-label="${row.name}: ${p.name}">
          <span class="pad-top"><span class="pad-name">${p.name}</span><kbd>${row.keys[i]}</kbd></span>
          ${roll(row.id, p.id)}<span class="head"></span><span class="badge">next bar</span>
        </button>`).join('')}
      <button class="pad stop" data-stop="${row.id}" aria-label="Stop ${row.name}" data-tip="Stop the ${row.name.toLowerCase()} at the next bar line.">stop</button>
    </div>`).join('');
  for (const row of ROWS) {
    padEls[row.id] = {};
    for (const p of row.pads) {
      const el = document.querySelector(`[data-row="${row.id}"][data-pad="${p.id}"]`);
      padEls[row.id][p.id] = { el, head: el.querySelector('.head'), rects: [...el.querySelectorAll('rect')], state: '' };
    }
    stopEls[row.id] = document.querySelector(`[data-stop="${row.id}"]`);
  }
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
  for (const row of ROWS) {
    for (const p of row.pads) onPress(padEls[row.id][p.id].el, () => tapPad(row.id, p.id));
    onPress(stopEls[row.id], () => engine.setPad(row.id, null));
  }
  $('chords').addEventListener('pointerdown', (e) => { const el = e.target.closest('[data-chord]'); if (el) tapChord(+el.dataset.chord); });
  $('chords').addEventListener('click', (e) => { const el = e.target.closest('[data-chord]'); if (el && e.detail === 0) tapChord(+el.dataset.chord); });
  document.querySelectorAll('[data-row-head]').forEach((el) => el.addEventListener('click', (e) => { if (!e.target.closest('input')) guide.showRow(el.dataset.rowHead); }));
  document.querySelectorAll('[data-vol]').forEach((el) => el.addEventListener('input', () => engine.setVolume(el.dataset.vol, +el.value)));
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
  const keyMap = {};
  for (const row of ROWS) [...row.keys].forEach((k, i) => { keyMap[k.toLowerCase()] = [row.id, row.pads[i].id]; });
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
    for (const row of ROWS) {
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
