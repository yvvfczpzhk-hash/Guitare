/* ==== ui-core.js ==== */
/* ACCORD — outils d'interface : rendu, actions, icônes, diagrammes d'accords, motifs, graphiques. */
(function (root) {
  'use strict';
  const AC = root.AC;
  const T = AC.theory;
  const U = AC.ui = AC.ui || {};

  U.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.fr = (v, n) => (v == null || !isFinite(v) ? '—' : Number(v).toFixed(n == null ? 1 : n).replace('.', ','));
  U.pct = v => (v == null || !isFinite(v) ? '—' : Math.round(100 * v) + ' %');
  U.dateFr = d => { const x = new Date(d + (String(d).length === 10 ? 'T12:00:00' : '')); return x.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' }); };
  U.dateLong = d => { const x = new Date(d + 'T12:00:00'); return x.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); };

  /* ---------------------------------------------------------------- actions (délégation) */
  const handlers = {}, waiters = [];
  U.on = (name, fn) => { handlers[name] = fn; };
  U.aborted = null;
  U.wait = function (names) {
    if (U.aborted) return Promise.reject(U.aborted);
    return new Promise((resolve, reject) => { waiters.push({ names, resolve, reject }); });
  };
  U.cancel = function (names) {
    for (let i = waiters.length - 1; i >= 0; i--) if (waiters[i].names.some(n => names.includes(n))) { const w = waiters.splice(i, 1)[0]; w.resolve(null); }
  };
  U.resetAbort = () => { U.aborted = null; };
  U.fire = function (name, arg, el) {
    for (let i = waiters.length - 1; i >= 0; i--) {
      const w = waiters[i];
      if (w.names.includes(name)) { waiters.splice(i, 1); w.resolve({ act: name, arg, el }); return true; }
    }
    if (handlers[name]) { handlers[name](arg, el); return true; }
    return false;
  };
  U.abortWaits = function (err) { U.aborted = err; while (waiters.length) waiters.pop().reject(err); };
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    e.preventDefault();
    U.fire(el.dataset.act, el.dataset.arg, el);
  });
  document.addEventListener('change', e => {
    const el = e.target.closest('[data-change]');
    if (el) U.fire(el.dataset.change, el.type === 'checkbox' ? el.checked : el.value, el);
  });
  document.addEventListener('input', e => {
    const el = e.target.closest('[data-input]');
    if (el) U.fire(el.dataset.input, el.value, el);
  });

  let toastT = null;
  U.toast = function (msg, ms) {
    let t = document.querySelector('.toast');
    if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(toastT); toastT = setTimeout(() => { t.style.display = 'none'; }, ms || 2600);
  };
  U.sleep = ms => new Promise(r => setTimeout(r, ms));
  U.frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  U.btn = (act, label, cls, arg) => `<button class="btn ${cls || ''}" data-act="${act}"${arg != null ? ` data-arg="${U.esc(arg)}"` : ''}>${label}</button>`;
  U.applyTheme = function () {
    const s = U.state && U.state();
    const th = s && s.profile.theme;
    if (th === 'light' || th === 'dark') document.documentElement.setAttribute('data-theme', th); else document.documentElement.removeAttribute('data-theme');
  };

  /* ---------------------------------------------------------------- icônes */
  const I = {
    today: '<path d="M4 7h16M7 3v4m10-4v4M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/><circle cx="12" cy="14" r="2.2"/>',
    progress: '<path d="M4 19V9m6 10V5m6 14v-7m4 7H3"/>',
    song: '<path d="M9 18a3 3 0 1 1-2-2.8V5l12-2v11.2a3 3 0 1 1-2-2.8V6.2L9 7.6V18Z"/>',
    studio: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="M13.5 6.5l4 4"/>',
    tools: '<path d="M12 3v7m0 0a3 3 0 1 0 0 6a3 3 0 0 0 0-6Zm0 6v5M6 7l2 2m10-2-2 2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M4.9 4.9 7 7m10 10 2.1 2.1M2 12h3m14 0h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    play: '<path d="M8 5v14l11-7z"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
    back: '<path d="M15 5l-7 7 7 7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
  };
  U.icon = (name, size) => `<svg viewBox="0 0 24 24" width="${size || 24}" height="${size || 24}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name] || ''}</svg>`;

  /* ---------------------------------------------------------------- diagrammes d'accords */
  /**
   * Diagramme d'accord (SVG). id : forme ; o : {size: 'big'|'small', title, status: [6 états], lefty, label}
   * status : 'ok' | 'muted' | 'wrong' | 'missing' par corde (résultat « corde par corde »).
   */
  U.diagram = function (id, o) {
    o = o || {};
    const v = typeof id === 'string' ? T.voicing(id) : id;
    if (!v) return '';
    const s = U.state ? U.state() : null;
    const lefty = o.lefty != null ? o.lefty : !!(s && s.profile.lefty);
    const big = o.size === 'big', small = o.size === 'small';
    const W = big ? 150 : small ? 78 : 110, H = big ? 178 : small ? 96 : 132;
    const padX = W * 0.16, top = H * 0.2, bottom = H * 0.06, nF = 5;
    const fr = v.frets.filter(f => f > 0), minF = fr.length ? Math.min(...fr) : 1, maxF = fr.length ? Math.max(...fr) : 1;
    const base = maxF <= 5 ? 1 : minF;
    const sx = i => { const k = lefty ? 5 - i : i; return padX + k * (W - 2 * padX) / 5; };
    const fy = f => top + (f - base + 0.5) * (H - top - bottom) / nF;
    const lineY = f => top + (f - base + 1) * (H - top - bottom) / nF;
    const r = (W - 2 * padX) / 5 * 0.36;
    let g = '';
    for (let i = 0; i < 6; i++) g += `<line x1="${sx(i)}" x2="${sx(i)}" y1="${top}" y2="${H - bottom}" stroke="var(--string)" stroke-width="${1 + (5 - i) * 0.18}" opacity=".85"/>`;
    for (let f = 0; f <= nF; f++) { const y = top + f * (H - top - bottom) / nF; g += `<line x1="${sx(lefty ? 5 : 0) - (lefty ? -1 : 1) * 0}" x2="${sx(lefty ? 0 : 5)}" y1="${y}" y2="${y}" stroke="var(--fret)" stroke-width="${f === 0 && base === 1 ? 4 : 1.2}"/>`; }
    if (base > 1) g += `<text x="${lefty ? W - padX * 0.45 : padX * 0.45}" y="${fy(base) + 4}" font-size="${small ? 9 : 11}" fill="var(--muted)" text-anchor="middle">${base}</text>`;
    // marqueurs au-dessus du sillet : o (à vide), × (étouffée), état mesuré
    for (let i = 0; i < 6; i++) {
      const y = top - r * 1.25, f = v.frets[i], st = o.status && o.status[i];
      const col = st === 'ok' ? 'var(--good)' : st === 'muted' || st === 'wrong' ? 'var(--bad)' : st === 'missing' ? 'var(--warn)' : 'var(--muted)';
      if (f < 0) g += `<text x="${sx(i)}" y="${y + 4}" font-size="${r * 1.6}" text-anchor="middle" fill="${col}">×</text>`;
      else if (f === 0) g += `<circle cx="${sx(i)}" cy="${y}" r="${r * 0.62}" fill="none" stroke="${col}" stroke-width="1.6"/>`;
      else if (st) g += `<circle cx="${sx(i)}" cy="${y}" r="${r * 0.38}" fill="${col}"/>`;
    }
    if (v.barre) {
      const a = sx(v.barre.from), b = sx(v.barre.to), x0 = Math.min(a, b), x1 = Math.max(a, b);
      g += `<rect x="${x0 - r}" y="${fy(v.barre.fret) - r}" width="${x1 - x0 + 2 * r}" height="${2 * r}" rx="${r}" fill="var(--accent)" opacity=".9"/>`;
    }
    for (let i = 0; i < 6; i++) {
      const f = v.frets[i]; if (f <= 0) continue;
      const onBarre = v.barre && f === v.barre.fret && i >= v.barre.from && i <= v.barre.to && v.fingers[i] === 1;
      const st = o.status && o.status[i], fill = st === 'muted' || st === 'wrong' ? 'var(--bad)' : 'var(--accent)';
      if (!onBarre) g += `<circle cx="${sx(i)}" cy="${fy(f)}" r="${r}" fill="${fill}"/>`;
      const fg = v.fingers[i];
      if (fg && (!onBarre || i === v.barre.from)) g += `<text x="${sx(i)}" y="${fy(f) + r * 0.42}" font-size="${r * 1.15}" font-weight="700" text-anchor="middle" fill="var(--accent-ink)">${fg === 5 ? 'P' : fg}</text>`;
    }
    void lineY;
    const nm = o.title != null ? o.title : T.pretty(v.sym);
    const label = o.label != null ? o.label : (v.variant || '');
    return `<div class="diag ${big ? 'big' : ''}" role="img" aria-label="Accord ${U.esc(T.chordLong(v.sym))}${v.variant ? ', ' + U.esc(v.variant) : ''}"><div class="nm">${U.esc(nm)}${o.fr !== false ? `<small>${U.esc(T.chordFr(v.sym))}</small>` : ''}</div><svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${g}</svg>${label && !small ? `<div class="tiny faint">${U.esc(label)}</div>` : ''}</div>`;
  };
  U.diagrams = (ids, o) => `<div class="diagrams">${ids.filter((x, i, a) => a.indexOf(x) === i).map(id => U.diagram(id, o)).join('')}</div>`;

  /* ---------------------------------------------------------------- motifs */
  const ARROW = { D: '↓', U: '↑', X: '✕', '.': '·' };
  /** Motif de grattage : cases (↓ ↑ ✕ ·) et comptage ; o : {now (case en cours), marks: {case: 'ok'|'miss'|'extra'}} */
  U.pattern = function (pid, o) {
    o = o || {};
    const p = T.strum(pid); if (!p) return '';
    const labels = T.countLabels(p);
    const cells = p.slots.split('').map((k, i) => `<div class="slot ${k !== '.' ? 'on' : ''} ${i % p.sub === 0 ? 'beat' : ''} ${o.now === i ? 'now' : ''} ${o.marks && o.marks[i] ? o.marks[i] : ''}"><b>${ARROW[k]}</b><span>${labels[i]}</span></div>`).join('');
    return `<div class="pattern" style="grid-template-columns:repeat(${p.slots.length},1fr)" aria-label="Rythmique ${U.esc(p.name)} : ${U.esc(p.slots)}">${cells}</div>`;
  };
  /** Motif d'arpège : doigts et cordes. */
  U.pickPattern = function (pid, vid, o) {
    o = o || {};
    const p = T.pick(pid), v = T.voicing(vid); if (!p) return '';
    const labels = T.countLabels(p);
    const strName = tok => { if (tok === '.') return ''; const s = v ? T.pickString(tok[0], v) : null; return s != null ? 'c.' + T.STRING_NUM[s] : ''; };
    const cells = p.toks.map((tok, i) => `<div class="slot ${tok !== '.' ? 'on' : ''} ${i % p.sub === 0 ? 'beat' : ''} ${o.now === i ? 'now' : ''}"><b style="font-size:15px">${tok === '.' ? '·' : U.esc(tok.split('').join('+'))}</b><span>${labels[i]}${tok !== '.' ? '<br>' + strName(tok) : ''}</span></div>`).join('');
    return `<div class="pattern" style="grid-template-columns:repeat(${p.toks.length},1fr)">${cells}</div>`;
  };

  /* ---------------------------------------------------------------- graphiques */
  /**
   * Coups d'une prise rythmée : écart au clic de chaque coup (ms) au fil du temps, bande de tolérance,
   * coups manqués (✕ rouge) et en trop (losange orange). Les mesures sans clic sont grisées.
   */
  U.rplot = function (res, tol, score) {
    if (!res || !res.events || !res.events.length) return '';
    const W = 320, H = 130, L = 30, R = 6, Tp = 10, B = 18;
    const ev = res.events, t0 = ev[0].t, t1 = ev[ev.length - 1].t + 0.2;
    const maxE = Math.max(tol * 2, 60, ...ev.filter(e => e.hit).map(e => Math.min(200, Math.abs(e.err))));
    const x = t => L + (t - t0) / Math.max(0.1, t1 - t0) * (W - L - R);
    const y = e => Tp + (1 - (Math.max(-maxE, Math.min(maxE, e)) + maxE) / (2 * maxE)) * (H - Tp - B);
    let g = `<rect x="${L}" y="${y(tol)}" width="${W - L - R}" height="${y(-tol) - y(tol)}" fill="var(--good)" opacity=".12"/>`;
    g += `<line x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line)"/>`;
    g += `<text x="2" y="${y(maxE * 0.8) + 4}" font-size="9" fill="var(--muted)">tard</text><text x="2" y="${y(-maxE * 0.8) + 4}" font-size="9" fill="var(--muted)">tôt</text>`;
    if (score) {
      const beat = 60 / score.tempo;
      for (let b = 0; b < score.bars; b++) {
        if (score.clickBars && !score.clickBars[b]) { const a = t0 + (b * score.sig) * beat - (ev[0].t - t0), z = a + score.sig * beat; g += `<rect x="${x(a)}" y="${Tp}" width="${Math.max(0, x(z) - x(a))}" height="${H - Tp - B}" fill="var(--faint)" opacity=".12"/>`; }
      }
    }
    for (const e of ev) {
      if (!e.hit) { g += `<text x="${x(e.t)}" y="${H - 5}" font-size="11" text-anchor="middle" fill="var(--bad)">✕</text>`; continue; }
      const c = Math.abs(e.err) <= tol ? 'var(--good)' : Math.abs(e.err) <= 2 * tol ? 'var(--warn)' : 'var(--bad)';
      g += `<circle cx="${x(e.t).toFixed(1)}" cy="${y(e.err).toFixed(1)}" r="${e.k === 'U' ? 2.8 : 3.6}" fill="${e.free ? 'none' : c}" stroke="${c}" stroke-width="1.5"/>`;
    }
    for (const xt of res.extras || []) g += `<path d="M${x(xt.t)} ${H - 14} l4 4 -4 4 -4 -4z" fill="var(--warn)"/>`;
    return `<svg class="rplot" viewBox="0 0 ${W} ${H}" role="img" aria-label="Écart au clic de chaque coup">${g}</svg>`;
  };
  /** Petite courbe d'évolution. pts : [[date, valeur]] */
  U.spark = function (pts, o) {
    o = o || {};
    if (!pts || pts.length < 2) return '<p class="small faint">Pas encore assez de mesures.</p>';
    const W = 320, H = 70, vs = pts.map(p => p[1]);
    let lo = Math.min(...vs), hi = Math.max(...vs); if (hi - lo < (o.minSpan || 1)) { const c = (hi + lo) / 2; lo = c - (o.minSpan || 1) / 2; hi = c + (o.minSpan || 1) / 2; }
    const x = i => 4 + i / (pts.length - 1) * (W - 8), y = v => 6 + (hi - v) / (hi - lo) * (H - 12);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p[1]).toFixed(1)).join(' ');
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${U.esc(o.label || 'évolution')}"><path d="${d}" fill="none" stroke="${o.color || 'var(--accent)'}" stroke-width="2.2" vector-effect="non-scaling-stroke"/><circle cx="${x(pts.length - 1)}" cy="${y(vs[vs.length - 1])}" r="3.5" fill="${o.color || 'var(--accent)'}"/></svg>`;
  };
  U.ring = function (frac, text) {
    const r = 64, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(1, frac)));
    return `<div class="ring"><svg viewBox="0 0 150 150"><circle cx="75" cy="75" r="${r}" fill="none" stroke="var(--surface2)" stroke-width="10"/><circle cx="75" cy="75" r="${r}" fill="none" stroke="var(--accent)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg><div class="num">${U.esc(text)}</div></div>`;
  };
  /** Anneau « prête à jouer » (0–1). */
  U.ready = function (frac) {
    const r = 26, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(1, frac || 0)));
    const col = frac >= 0.9 ? 'var(--good)' : frac >= 0.6 ? 'var(--accent)' : 'var(--warn)';
    return `<div class="ready" aria-label="Prête à ${Math.round(100 * (frac || 0))} %"><svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--surface2)" stroke-width="7"/><circle cx="32" cy="32" r="${r}" fill="none" stroke="${col}" stroke-width="7" stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/></svg><b>${Math.round(100 * (frac || 0))}</b></div>`;
  };
  U.fbList = fb => (fb || []).map(f => `<div class="fb ${f.kind}"><span class="dot"></span><span>${U.esc(f.text)}</span></div>`).join('');
})(typeof globalThis !== 'undefined' ? globalThis : this);
