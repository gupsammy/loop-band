// The guide panel (What's this? · Tricks · Words), tooltips, and the toast for finished tricks.
import { WORDS, TRICKS, FX_INFO, parseMarks } from './learn.js';
import { LANES, rowOf, rowOfPad, padById, padNotes, styleById } from './pads.js';
import { CHORDS, NOTE_NAMES, chordName, chordRootPc, rootFrom, scaleStep, noteName } from './theory.js';
import { DRUM_NAMES } from './synth/drums.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// Text with [[word]] marks → HTML. In the panel the words are buttons (hover or tap for the meaning); in tooltips,
// which vanish when the pointer moves, they are only underlined.
export function marked(text, live = true) {
  return parseMarks(text).map((p) => (typeof p === 'string' ? esc(p)
    : live ? `<button class="term" data-word="${esc(p.word)}">${esc(p.text)}</button>` : `<span class="tw">${esc(p.text)}</span>`)).join('');
}

/* ---- the little note pictures on pads: time runs left to right over the bar's 8 eighths */
const DRUM_LANE = { open: 0, hat: 0, snare: 1, clap: 1, kick: 2 };
export function roll(rowId, padId, big = false) {
  const pad = padById(rowId, padId), W = 80, H = big ? 40 : 24, rects = [];
  if (rowId === 'drums') {
    for (const [e, d, v] of pad.hits) {
      const lane = DRUM_LANE[d], len = d === 'open' ? 0.9 : d === 'hat' ? 0.45 : 0.7;
      rects.push({ e, len, y: (lane * H) / 3 + 1, h: H / 3 - 2, v });
    }
  } else {
    const steps = pad.notes.flatMap((n) => n[2]), lo = Math.min(...steps), hi = Math.max(...steps), levels = hi - lo + 1;
    const h = Math.max(2, Math.min(6, H / levels - 1));
    for (const [e, len, st, v] of pad.notes) for (const s of st) {
      rects.push({ e, len: Math.min(len, 8 - e), y: levels === 1 ? (H - h) / 2 : ((hi - s) / (levels - 1)) * (H - h), h, v });
    }
  }
  const body = rects.map((r) => `<rect data-e="${r.e}" data-l="${r.len}" x="${r.e * 10 + 0.5}" y="${r.y.toFixed(1)}" width="${Math.max(1.5, r.len * 10 - 1.5)}" height="${r.h.toFixed(1)}" rx="1" style="opacity:${big ? 0.35 + 0.65 * r.v : ''}"/>`).join('');
  const labels = big && rowId === 'drums' ? ['hi-hat', 'snare', 'kick'].map((t, i) => `<text x="-2" y="${(i * H) / 3 + H / 6 + 2}" text-anchor="end">${t}</text>`).join('') : '';
  return `<svg class="${big ? 'big-roll' : 'roll'}" viewBox="${big && rowId === 'drums' ? '-24' : '0'} 0 ${big && rowId === 'drums' ? 104 : 80} ${H}" preserveAspectRatio="none" aria-hidden="true">${labels}${body}</svg>`;
}

export function initGuide(engine) {
  let showing = { kind: 'start' }, lastHtml = '';
  let done = new Set();
  try { done = new Set(JSON.parse(localStorage.getItem('loop-band.tricks') || '[]')); } catch { /* private mode: tricks reset per visit */ }

  /* ---- tabs */
  const tabs = [...document.querySelectorAll('[role=tab]')];
  function openTab(name) {
    for (const t of tabs) t.setAttribute('aria-selected', String(t.dataset.tab === name));
    for (const b of ['info', 'tricks', 'words']) $('tab-' + b).hidden = b !== name;
  }
  for (const t of tabs) t.addEventListener('click', () => openTab(t.dataset.tab));

  /* ---- What's this? */
  const heard = () => engine.audible() || engine.next;
  function infoHtml() {
    const { key } = engine.next, chord = heard().chord;
    if (showing.kind === 'pad') {
      const row = rowOfPad(showing.row, showing.pad), pad = padById(showing.row, showing.pad), b = engine.audible();
      const live = b && b.pads[row.id] === pad.id, next = engine.next.pads[row.id] === pad.id && !live && engine.playing;
      let notes;
      if (row.id === 'drums') {
        const count = {};
        for (const [, d] of pad.hits) count[d] = (count[d] || 0) + 1;
        notes = Object.entries(count).map(([d, n]) => `${n} × ${DRUM_NAMES[d]}`).join(' · ');
      } else {
        const seen = [];
        for (const n of padNotes(row.id, pad.id, key, chord)) for (const m of n.midis) if (!seen.includes(m)) seen.push(m);
        notes = `${seen.map(noteName).join(' · ')} <span class="chip">over ${chordName(key, chord)}</span>`;
      }
      return `<div style="--c:${row.color}">
        <h2>${row.name} · ${pad.name}${live ? '<span class="chip live">playing</span>' : next ? '<span class="chip">next bar</span>' : ''}</h2>
        ${roll(row.id, pad.id, true)}
        <div class="roll-scale"><span>beat 1</span><span>2</span><span>3</span><span>4</span><span></span></div>
        <p style="margin-top:10px">${marked(pad.tip)}</p>
        <h3>Why it works</h3><p>${marked(pad.why)}</p>
        <h3>${row.id === 'drums' ? 'Hits per bar' : 'Notes it plays now'}</h3><p class="notes">${notes}</p>
        <h3>The ${row.name.toLowerCase()}</h3><p>${marked(row.about)}</p></div>`;
    }
    if (showing.kind === 'chord') {
      const ci = showing.ci, c = CHORDS[ci], root = rootFrom(chordRootPc(key, ci), 60);
      const tri = [0, 2, 4].map((s) => scaleStep(root, s, key)), third = tri[1] - tri[0];
      return `<h2>${chordName(key, ci)} <span class="chip">${c.roman}</span></h2>
        <p>${marked(c.feel)}</p>
        <h3>Notes</h3><p class="notes">${tri.map((m) => NOTE_NAMES[m % 12]).join(' · ')}</p>
        <p>${marked(`The [[root]] is ${NOTE_NAMES[tri[0] % 12]}. The [[third]] is ${third} [[semitone|semitones]] up, so it is ${third === 4 ? '[[major]]: bright' : '[[minor]]: darker'}.`)}</p>
        <h3>Its number</h3><p>${marked(`It is chord ${c.roman} in ${NOTE_NAMES[key]} major: built on note ${c.degree + 1} of the [[scale]]. Change the key and its name changes, but its number and its feel stay the same. See [[roman numerals]].`)}</p>`;
    }
    if (showing.kind === 'fx') {
      const row = rowOf(engine.next.style, showing.row), f = FX_INFO[showing.fx], on = engine.fx[showing.row][showing.fx];
      return `<div style="--c:${row.color}"><h2>${f.name} · ${row.name} <span class="chip${on ? ' live' : ''}">${on ? 'on' : 'off'}</span></h2>
        <p>${marked(f.tip)}</p><h3>Why use it</h3><p>${marked(f.why)}</p>
        <h3>Hear it</h3><p>Switch it on and off while the band plays. Effects act at once, not on the next bar.</p></div>`;
    }
    if (showing.kind === 'row') {
      const row = rowOf(engine.next.style, showing.row);
      return `<div style="--c:${row.color}"><h2>${row.name} <span class="chip">${row.role}</span></h2><p>${marked(row.about)}</p>
        <h3>Its pads</h3>${row.pads.map((p) => `<p><b>${p.name}.</b> ${marked(p.tip)}</p>`).join('')}</div>`;
    }
    if (showing.kind === 'style') {
      const st = styleById(engine.next.style), rows = LANES.map((lane) => rowOf(st.id, lane));
      const on = rows.flatMap((r) => Object.keys(st.fx[r.id] || {}).map((f) => `${FX_INFO[f].name} on the ${r.name.toLowerCase()}`));
      return `<h2>${st.name} <span class="chip">style</span></h2><p>${marked(st.about)}</p>
        <h3>What makes it sound this way</h3><p>${marked(st.why)}</p>
        <h3>The band</h3>${rows.map((r) => `<p style="--c:${r.color}" class="band-line"><b>${r.name}</b> · ${r.role}</p>`).join('')}
        <h3>Effects it switches on</h3><p>${on.length ? on.join(' · ') + '.' : 'None: a rock band sounds best dry and loud.'} You can still switch any of them yourself.</p>
        <p>Pads that were playing move to the pad in the same place, so the song keeps going.</p>`;
    }
    return `<h2>Start here</h2>
      <ol class="start">
        <li>Tap a <b>Drums</b> pad (or press <kbd>Q</kbd>). The band starts, and the beat comes in on the next ${marked('[[bar]]')} line.</li>
        <li>Add <b>Bass</b> (<kbd>A</kbd>), then <b>Guitar</b> (<kbd>Z</kbd>). Each joins on the next bar, so you can't be late.</li>
        <li>Tap chords <b>1 → 5 → 6 → 4</b>, one per bar. That's the most famous ${marked('[[progression]]')} in pop.</li>
        <li>Tap a lit pad again to stop that row. Try the <b>DJ filter</b> too.</li>
        <li>Switch <b>Style</b> to hear the same song as 1980s synthwave.</li>
      </ol>
      <p>Tap any pad or chord to see what it is here. Underlined words explain themselves when you hover or tap them.</p>
      <p><button class="link" data-open="tricks">Try the tricks →</button></p>`;
  }
  function refresh() {
    const html = infoHtml();
    if (html !== lastHtml) { $('tab-info').innerHTML = html; lastHtml = html; }
  }
  const show = (what) => { showing = what; openTab('info'); refresh(); };

  /* ---- Tricks */
  function renderTricks() {
    $('tab-tricks').innerHTML = `<p class="why">Short recipes to try while the band plays. Each one ticks itself when you do it.</p>` +
      TRICKS.map((t) => `<div class="trick${done.has(t.id) ? ' done' : ''}"><span class="tick"></span><div>
        <b>${t.name}</b><p>${marked(t.how)}</p><p class="why">${marked(t.why)}</p></div></div>`).join('');
    $('trick-count').textContent = `${done.size}/${TRICKS.length}`;
  }
  function checkTricks() {
    for (const t of TRICKS) {
      if (done.has(t.id) || !t.check(engine.history)) continue;
      done.add(t.id);
      try { localStorage.setItem('loop-band.tricks', JSON.stringify([...done])); } catch { /* not saved */ }
      toast(`✓ Trick done: ${t.name}`);
      renderTricks();
    }
  }
  let toastTimer = 0;
  function toast(text) {
    const el = $('toast');
    el.textContent = text; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  /* ---- Words */
  $('tab-words').innerHTML = `<p class="why">The words musicians use, in one line each.</p><dl class="words">` +
    Object.entries(WORDS).map(([w, d]) => `<dt>${esc(w[0].toUpperCase() + w.slice(1))}</dt><dd>${esc(d)}</dd>`).join('') + '</dl>';

  /* ---- tooltips: hover (mouse) on anything with data-tip; hover or tap on a glossary word */
  const tip = $('tooltip');
  let tipTimer = 0, tipFor = null;
  function place(el, html) {
    tip.innerHTML = html; tip.hidden = false; tipFor = el;
    const r = el.getBoundingClientRect(), t = tip.getBoundingClientRect(), pad = 8;
    let x = Math.min(Math.max(pad, r.left + r.width / 2 - t.width / 2), innerWidth - t.width - pad);
    let y = r.bottom + 8;
    if (y + t.height > innerHeight - pad) y = r.top - t.height - 8;
    tip.style.left = x + 'px'; tip.style.top = Math.max(pad, y) + 'px';
  }
  const hide = () => { clearTimeout(tipTimer); tip.hidden = true; tipFor = null; };
  const wordHtml = (w) => `<b>${esc(w[0].toUpperCase() + w.slice(1))}</b>: ${esc(WORDS[w] || '')}`;
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const term = e.target.closest('.term'), el = term || e.target.closest('[data-tip]');
    if (!el || el === tipFor) return;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => place(el, term ? wordHtml(term.dataset.word) : marked(el.dataset.tip, false)), term ? 120 : 450);
  });
  document.addEventListener('pointerout', (e) => {
    const el = e.target.closest('.term, [data-tip]');
    if (el && !el.contains(e.relatedTarget)) hide();
  });
  document.addEventListener('pointerdown', (e) => { if (!e.target.closest('.term')) hide(); });
  addEventListener('scroll', hide, { passive: true });
  document.addEventListener('click', (e) => {
    const term = e.target.closest('.term');
    if (term) { place(term, wordHtml(term.dataset.word)); return; }
    const open = e.target.closest('[data-open]');
    if (open) openTab(open.dataset.open);
  });

  renderTricks();
  refresh();
  return {
    showPad: (row, pad) => show({ kind: 'pad', row, pad }),
    showChord: (ci) => show({ kind: 'chord', ci }),
    showRow: (row) => show({ kind: 'row', row }),
    showFx: (row, fx) => show({ kind: 'fx', row, fx }),
    showStyle: () => show({ kind: 'style' }),
    refresh,
    onBar: checkTricks,
  };
}
