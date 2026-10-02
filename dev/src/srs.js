/* ==== srs.js ==== */
/* ACCORD — connaissances en répétition espacée.
   Ordonnanceur FSRS (Free Spaced Repetition Scheduler, Ye et al. 2022) : chaque carte a une stabilité S (jours)
   et une difficulté D ; la probabilité de s'en souvenir après t jours est R = (1 + 19/81 · t/S)^−0,5, et la
   prochaine révision tombe quand R descend à 90 %. Se tester (récupérer la réponse) fait mieux retenir que
   relire (Roediger & Karpicke 2006), et espacer fait mieux retenir que masser (Cepeda et al. 2006).
   Cartes : noms des cordes, accords (diagramme ↔ nom), capodastre, accords d'une tonalité, degrés, notes du
   manche, notes des accords, progressions. Le contenu est recalculé à partir de l'identifiant. */
(function (root) {
  'use strict';
  const AC = root.AC || (root.AC = {});
  const T = AC.theory || (typeof require !== 'undefined' ? require('./theory.js') : null);
  const R = {};

  /* ---------------------------------------------------------------- FSRS (paramètres par défaut, version 4.5) */
  const W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
  const DECAY = -0.5, FACTOR = 19 / 81, TARGET = 0.9;
  R.W = W;
  R.retrievability = (t, S) => Math.pow(1 + FACTOR * t / S, DECAY);
  R.interval = (S, r) => Math.max(1, Math.round(S / FACTOR * (Math.pow(r || TARGET, 1 / DECAY) - 1)));
  const clampD = d => Math.min(10, Math.max(1, d));
  const D0 = g => clampD(W[4] - (g - 3) * W[5]);
  const pad = n => (n < 10 ? '0' : '') + n;
  const dayOf = ts => { const d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const addDays = (day, n) => { const d = new Date(day + 'T12:00:00'); d.setDate(d.getDate() + n); return dayOf(d.getTime()); };
  const daysBetween = (a, b) => Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / 864e5);
  R.addDays = addDays;
  /**
   * Révision d'une carte. g : 1 raté, 2 difficile, 3 bon, 4 facile. day : 'AAAA-MM-JJ'.
   * Une carte ratée revient dès le lendemain (et une fois en fin de séance, côté interface).
   */
  R.review = function (card, g, day) {
    const c = Object.assign({ reps: 0, lapses: 0 }, card || {});
    if (!c.s) {
      c.s = W[g - 1]; c.d = D0(g);
    } else {
      const t = Math.max(0, daysBetween(c.last, day));
      const r = R.retrievability(t, c.s);
      const d = c.d;
      if (g === 1) { c.s = Math.min(c.s, W[11] * Math.pow(d, -W[12]) * (Math.pow(c.s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r))); c.lapses++; }
      else c.s = c.s * (Math.exp(W[8]) * (11 - d) * Math.pow(c.s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * (g === 2 ? W[15] : 1) * (g === 4 ? W[16] : 1) + 1);
      c.d = clampD(W[7] * D0(3) + (1 - W[7]) * (d - W[6] * (g - 3)));
    }
    c.s = +Math.max(0.1, c.s).toFixed(3); c.d = +c.d.toFixed(3);
    c.reps++; c.last = day;
    c.due = addDays(day, g === 1 ? 1 : R.interval(c.s));
    return c;
  };
  /** Note FSRS d'une réponse : juste et rapide → facile ; juste mais lent → difficile ; faux → raté. */
  R.grade = (correct, sec) => (!correct ? 1 : sec > 9 ? 2 : sec < 2.5 ? 4 : 3);

  /* ---------------------------------------------------------------- générateur pseudo-aléatoire */
  function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  const hash = str => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  function shuffle(arr, r) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  /** Options : la bonne réponse + des leurres distincts, mélangés (ordre différent à chaque révision). */
  function options(correct, pool, n, r) {
    const ds = shuffle(pool.filter(x => x !== correct), r);
    const uniq = []; for (const x of ds) if (!uniq.includes(x) && uniq.length < (n || 4) - 1) uniq.push(x);
    const opts = shuffle([correct].concat(uniq), r);
    return { opts, ans: opts.indexOf(correct) };
  }
  const NOTE_FR = pc => T.pcName(pc, false, true);
  const KEY_FR = (pc, minor) => T.keyName(pc, minor);
  const STRING_NOTE = ['Mi', 'La', 'Ré', 'Sol', 'Si', 'Mi'];

  /* ---------------------------------------------------------------- familles de cartes */
  // Chaque famille : déblocage (semaine du programme), difficulté b (échelle des niveaux), générateur.
  R.FAMILIES = {
    corde: { name: 'Cordes à vide', from: 1 },
    diag: { name: 'Reconnaître un accord', from: 1 },
    capoS: { name: 'Capodastre : ça sonne en…', from: 3 },
    diat: { name: 'Accords d’une tonalité', from: 4 },
    fonction: { name: 'Fonctions des accords', from: 5 },
    note6: { name: 'Notes sur la corde de Mi grave', from: 6 },
    note5: { name: 'Notes sur la corde de La', from: 6 },
    capoF: { name: 'Capodastre : où le placer', from: 6 },
    degre: { name: 'Degrés', from: 7 },
    formule: { name: 'Notes des accords', from: 9 },
    prog: { name: 'Progressions dans une tonalité', from: 10 },
    intervalle: { name: 'Intervalles', from: 10 },
  };
  const KEYS_EASY = [7, 0, 2], KEYS_ALL = [7, 0, 2, 9, 4, 5];
  const DEG_B = { 1: 1.8, 4: 2.6, 5: 2.6, 6: 3.0, 2: 3.4, 3: 3.8 };
  const KEY_B = { 0: 0, 7: 0, 2: 0.2, 9: 0.4, 4: 0.4, 5: 0.5 };
  const ROMAN = { 1: 'I', 2: 'ii', 3: 'iii', 4: 'IV', 5: 'V', 6: 'vi' };

  /** Identifiants des cartes disponibles à une semaine donnée (vocab : formes connues). */
  R.available = function (week, vocab) {
    const ids = [];
    const on = f => week >= R.FAMILIES[f].from;
    for (let s = 0; s < 6; s++) ids.push('corde:' + s);
    (vocab || []).forEach(v => ids.push('diag:' + v));
    if (on('capoS')) for (const sh of ['G', 'C', 'D', 'E', 'A']) for (let c = 1; c <= 5; c++) ids.push('capoS:' + sh + ':' + c);
    if (on('diat')) for (const k of week >= 7 ? KEYS_ALL : KEYS_EASY) for (const d of week >= 7 ? [1, 2, 3, 4, 5, 6] : [1, 4, 5, 6]) ids.push('diat:' + k + ':' + d);
    if (on('fonction')) for (const d of [1, 4, 5]) ids.push('fonction:' + d);
    if (on('note6')) for (let f = 1; f <= 12; f++) { const pc = T.mod12(4 + f); if (week >= 9 || [0, 2, 4, 5, 7, 9, 11].includes(pc)) ids.push('note6:' + f); }
    if (on('note5')) for (let f = 1; f <= 12; f++) { const pc = T.mod12(9 + f); if (week >= 9 || [0, 2, 4, 5, 7, 9, 11].includes(pc)) ids.push('note5:' + f); }
    if (on('capoF')) for (const [snd, sh] of [[10, 7], [8, 7], [3, 2], [1, 0], [11, 9], [6, 2], [4, 0], [9, 7]]) ids.push('capoF:' + snd + ':' + sh);
    if (on('degre')) for (const k of KEYS_ALL) for (const d of [2, 3, 4, 5, 6]) ids.push('degre:' + k + ':' + d);
    if (on('formule')) for (const r0 of [0, 2, 4, 5, 7, 9, 11]) for (const q of ['', 'm']) ids.push('formule:' + r0 + ':' + (q || 'M'));
    if (on('prog')) for (const p of ['axis', '50s', 'sens', 'pop4']) for (const k of [7, 0, 2, 9]) ids.push('prog:' + p + ':' + k);
    if (on('intervalle')) for (const n of [2, 3, 4, 5, 7, 9, 12]) ids.push('intervalle:' + n);
    return ids;
  };

  /** Contenu d'une carte : {id, fam, q, opts, ans, b, diagram?, explain}. seed : varie l'ordre des options. */
  R.card = function (id, seed) {
    const [fam, a1, a2] = id.split(':');
    const r = rng(hash(id) ^ (seed || 0));
    let q = '', correct = '', pool = [], b = 2, explain = '', diagram = null, extra = {};
    if (fam === 'corde') {
      const s = +a1;
      q = 'Corde ' + (6 - s) + ' à vide (' + (s === 0 ? 'la plus grave' : s === 5 ? 'la plus aiguë' : 'en partant de la plus grave : ' + (s + 1) + 'e') + ') : quelle note ?';
      correct = STRING_NOTE[s]; pool = ['Mi', 'La', 'Ré', 'Sol', 'Si', 'Do', 'Fa'];
      b = 0.4 + 0.12 * s; explain = 'De la plus grave à la plus aiguë : Mi – La – Ré – Sol – Si – Mi (« Mi La Ré Sol Si Mi »).';
    } else if (fam === 'diag') {
      const v = T.voicing(a1 + (a2 ? ':' + a2 : ''));
      if (!v) return null;
      diagram = v.id;
      q = 'Quel est cet accord ?';
      const nm = x => T.pretty(x) + ' (' + T.chordFr(x) + ')';
      correct = nm(v.sym);
      const near = T.OPEN_DB.filter(o => o.sym !== v.sym && o.tags.includes('open')).map(o => nm(o.sym));
      pool = near;
      b = 0.6 + 0.35 * v.d; explain = T.chordLong(v.sym) + (v.variant ? ' — ' + v.variant : '') + '.';
    } else if (fam === 'capoS') {
      const sh = T.parseChord(a1), c = +a2;
      q = 'Tu joues en formes de ' + T.chordFr(a1) + ' avec le capo en case ' + c + ' : la chanson sonne en… ?';
      const pc = T.mod12(sh.root + c);
      correct = KEY_FR(pc, false); pool = [-2, -1, 1, 2, c === 2 ? 3 : -3].map(dl => KEY_FR(pc + dl, false));
      b = 2.6 + 0.1 * c; explain = 'Chaque case de capo monte d’un demi-ton : ' + T.chordFr(a1) + ' + ' + c + ' demi-ton' + (c > 1 ? 's' : '') + ' = ' + correct + '.';
    } else if (fam === 'capoF') {
      const snd = +a1, sh = +a2, c = T.mod12(snd - sh);
      q = 'Pour jouer en ' + KEY_FR(snd, false) + ' avec des formes de ' + NOTE_FR(sh) + ', le capo va en case… ?';
      correct = String(c); pool = [c - 2, c - 1, c + 1, c + 2, 12 - c].filter(x => x >= 0 && x <= 11 && x !== c).map(String);
      b = 3.4; explain = 'De ' + NOTE_FR(sh) + ' à ' + NOTE_FR(snd) + ' : ' + c + ' demi-ton' + (c > 1 ? 's' : '') + ' → capo ' + c + '.';
    } else if (fam === 'diat') {
      const k = +a1, d = +a2, dia = T.diatonic(k, false);
      q = 'En ' + KEY_FR(k, false) + ', quel accord est le ' + ROMAN[d] + ' ?';
      const nm = s => T.pretty(s) + ' (' + T.chordFr(s) + ')';
      correct = nm(dia[d - 1].sym);
      pool = dia.filter((_, i) => i !== d - 1 && i !== 6).map(x => nm(x.sym)).concat([nm(T.transposeSym(dia[d - 1].sym, 1)), nm(T.chordSym({ root: dia[d - 1].pc, q: dia[d - 1].q === 'm' ? '' : 'm' }))]);
      b = DEG_B[d] + (KEY_B[k] || 0.5); explain = KEY_FR(k, false) + ' : ' + dia.slice(0, 6).map(x => x.rn + ' = ' + T.pretty(x.sym)).join(' · ') + '.';
    } else if (fam === 'degre') {
      const k = +a1, d = +a2, dia = T.diatonic(k, false);
      q = 'Dans une chanson en ' + KEY_FR(k, false) + ', l’accord ' + T.pretty(dia[d - 1].sym) + ' (' + T.chordFr(dia[d - 1].sym) + ') est le… ?';
      correct = ROMAN[d]; pool = ['I', 'ii', 'iii', 'IV', 'V', 'vi', '♭VII'];
      b = DEG_B[d] + (KEY_B[k] || 0.5) + 0.4; explain = 'Compte depuis ' + NOTE_FR(k) + ' (I) : ' + dia.slice(0, 6).map(x => x.rn + ' ' + T.pretty(x.sym)).join(', ') + '.';
    } else if (fam === 'fonction') {
      const d = +a1;
      const F = { 1: ['repos, la maison', 'tonique'], 4: ['s’éloigner, ouvrir', 'sous-dominante'], 5: ['tension qui appelle le retour', 'dominante'] };
      q = 'Quel rôle joue l’accord de ' + ROMAN[d] + ' dans une chanson ?';
      correct = F[d][0]; pool = ['repos, la maison', 's’éloigner, ouvrir', 'tension qui appelle le retour', 'aucun, il est décoratif'];
      b = 2.8; explain = ROMAN[d] + ' = ' + F[d][1] + ' : ' + F[d][0] + '. I–IV–V–I : maison, promenade, tension, retour.';
    } else if (fam === 'note6' || fam === 'note5') {
      const f = +a1, open = fam === 'note6' ? 4 : 9, pc = T.mod12(open + f);
      q = 'Case ' + f + ' sur la corde de ' + (fam === 'note6' ? 'Mi grave' : 'La') + ' : quelle note ?';
      correct = NOTE_FR(pc); pool = [-2, -1, 1, 2, 5].map(dl => NOTE_FR(pc + dl));
      b = ([0, 2, 4, 5, 7, 9, 11].includes(pc) ? 2.4 : 3.2) + 0.12 * f + (fam === 'note5' ? 0.2 : 0);
      explain = 'Repères : cases 3, 5, 7, 12. Sur la corde de ' + (fam === 'note6' ? 'Mi' : 'La') + ' : ' + [3, 5, 7, 12].map(x => 'case ' + x + ' = ' + NOTE_FR(open + x)).join(', ') + '. C’est la fondamentale des barrés ' + (fam === 'note6' ? '(forme de Mi).' : '(forme de La).');
      extra.fret = f;
    } else if (fam === 'formule') {
      const r0 = +a1, qd = a2 === 'm' ? 'm' : '';
      const pcs = T.chordPcs(T.chordSym({ root: r0, q: qd }));
      const nm = arr => arr.map(NOTE_FR).join(' – ');
      q = 'Les trois notes de ' + T.chordLong(T.chordSym({ root: r0, q: qd })) + ' ?';
      correct = nm(pcs);
      pool = [nm(T.chordPcs(T.chordSym({ root: r0, q: qd ? '' : 'm' }))), nm(T.chordPcs(T.chordSym({ root: r0 + 2, q: qd }))), nm(T.chordPcs(T.chordSym({ root: r0 + 5, q: qd }))), nm(T.chordPcs(T.chordSym({ root: r0 - 1, q: qd })))];
      b = 3.6 + (qd ? 0.4 : 0) + ([1, 3, 6, 8, 10].includes(T.mod12(r0)) ? 0.5 : 0);
      explain = 'Fondamentale, tierce ' + (qd ? 'mineure (3 demi-tons)' : 'majeure (4 demi-tons)') + ', quinte (7 demi-tons).';
    } else if (fam === 'prog') {
      const p = T.PROGRESSIONS.find(x => x.id === a1), k = +a2;
      if (!p) return null;
      const seq = degs => degs.map(dg => T.pretty(T.degreeChord(dg, k))).join(' – ');
      q = p.name + ' en ' + KEY_FR(k, false) + ' : quels accords ?';
      correct = seq(p.deg);
      const alt = T.PROGRESSIONS.filter(x => x.id !== a1 && x.deg.length === 4).map(x => seq(x.deg));
      pool = alt.concat([p.deg.map(dg => T.pretty(T.degreeChord(dg, k + 2))).join(' – ')]);
      b = 4.2; explain = 'Exemples : ' + p.ex + '.';
    } else if (fam === 'intervalle') {
      const n = +a1, NAMES = { 2: 'seconde majeure', 3: 'tierce mineure', 4: 'tierce majeure', 5: 'quarte', 7: 'quinte', 9: 'sixte majeure', 12: 'octave' };
      q = 'Une ' + NAMES[n] + ' = combien de demi-tons ?';
      correct = String(n); pool = ['2', '3', '4', '5', '7', '9', '12'];
      b = 3.8 + (n === 9 ? 0.6 : 0); explain = 'Seconde 2 · tierces 3 et 4 · quarte 5 · quinte 7 · sixte 9 · octave 12.';
    } else return null;
    const o = options(correct, pool, 4, r);
    return Object.assign({ id, fam, q, opts: o.opts, ans: o.ans, b: +b.toFixed(2), diagram, explain }, extra);
  };

  /**
   * Cartes à réviser aujourd'hui : d'abord celles qui sont dues (les plus en retard en premier), puis des
   * nouvelles (au plus `maxNew` par jour, ordre du programme), jusqu'à `max` cartes.
   */
  R.dueList = function (cards, available, day, o) {
    o = o || {};
    const max = o.max || 12, maxNew = o.maxNew != null ? o.maxNew : 5;
    const due = available.filter(id => cards[id] && cards[id].due <= day).sort((a, b) => (cards[a].due < cards[b].due ? -1 : cards[a].due > cards[b].due ? 1 : 0));
    const introducedToday = available.filter(id => cards[id] && cards[id].first === day).length;
    const fresh = available.filter(id => !cards[id]).slice(0, Math.max(0, maxNew - introducedToday));
    return due.concat(fresh).slice(0, max);
  };
  /** Nombre de cartes dues (pour l'accueil). */
  R.dueCount = (cards, available, day) => available.filter(id => cards[id] && cards[id].due <= day).length;
  R.dayOf = dayOf;

  AC.srs = R;
  if (typeof module !== 'undefined' && module.exports) module.exports = R;
})(typeof globalThis !== 'undefined' ? globalThis : this);
