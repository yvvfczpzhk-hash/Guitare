/* ==== state.js ==== */
/* ACCORD — état de l'élève (pur, sans navigateur : testable).
   Profil, niveaux par compétence, vocabulaire d'accords et leurs mesures (propreté, temps de formation),
   paires de changements (records par minute, en rythme), rythmiques et arpèges (tempo réussi), cartes de
   connaissances, chansons (grille, capo, tempo, « prête à jouer »), idées de composition, séances, bilans. */
(function (root) {
  'use strict';
  const AC = root.AC || (root.AC = {});
  const req = n => (typeof require !== 'undefined' ? require(n) : null);
  const T = AC.theory || req('./theory.js');
  const M = AC.model || req('./model.js');
  const R = AC.srs || req('./srs.js');
  const St = {};
  St.VERSION = 1;

  const pad = n => (n < 10 ? '0' : '') + n;
  const today = ts => { const d = new Date(ts == null ? Date.now() : ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  St.today = today;
  St.dayDiff = (a, b) => Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / 864e5);

  /** Niveaux de départ selon ce que la personne déclare (le bilan d'entrée, au micro, corrige ensuite). */
  St.START_LEVELS = {
    zero: { label: 'Je n’ai jamais joué', th: { accords: 0.5, changements: 0.3, barres: 0.2, pulsation: 1.5, rythmiques: 0.5, picking: 0.3, oreille: 2, harmonie: 0.8, chant: 0.5, chansons: 0.3, composition: 0.5 }, vocab: [] },
    debut: { label: 'Je connais quelques accords', th: { accords: 2, changements: 1.5, barres: 0.6, pulsation: 2.5, rythmiques: 1.5, picking: 1, oreille: 2.5, harmonie: 1.5, chant: 1.2, chansons: 1.2, composition: 1 }, vocab: ['Em', 'Am', 'E', 'A', 'D', 'G', 'C'] },
    chansons: { label: 'Je joue des chansons simples', th: { accords: 3.6, changements: 3.2, barres: 1.5, pulsation: 3.5, rythmiques: 3, picking: 2, oreille: 3.2, harmonie: 2.4, chant: 2.5, chansons: 2.8, composition: 1.8 }, vocab: ['Em', 'Asus2', 'E', 'Am', 'A', 'D', 'G', 'C', 'Em7', 'Dsus2', 'Am7', 'E7', 'A7', 'Dm', 'D7', 'G7', 'Cmaj7', 'Fmaj7'] },
    avance: { label: 'Je joue barrés et rythmiques variées', th: { accords: 5.5, changements: 5.2, barres: 4.5, pulsation: 5, rythmiques: 5, picking: 4, oreille: 4.2, harmonie: 3.8, chant: 4, chansons: 4.5, composition: 3 }, vocab: null },
  };

  St.defaultProfile = () => ({
    name: '', start: 'debut', goals: { accompagner: true, composer: true, picking: false },
    guitar: 'folk', lefty: false, notation: 'us',
    tuning: 440, sessionMin: 20, daysPerWeek: 5,
    mic: true, predict: true, volume: 1, click: 'aigu',
    latency: null,                               // aller-retour sortie + entrée mesuré (s)
    plan: { when: '', where: '' },               // intention de mise en œuvre (Gollwitzer & Sheeran 2006)
  });

  St.newState = function (ts) {
    const s = {
      v: St.VERSION, created: ts || Date.now(), onboarded: false,
      profile: St.defaultProfile(),
      program: { start: today(ts), cycle: 1, pausedDays: 0 },
      skills: {}, items: {},
      vocab: [],                                 // accords introduits (ids de formes), dans l'ordre
      chords: {}, pairs: {}, patterns: {}, picks: {}, chant: {},
      cards: {}, series: {}, calib: { n: 0, hits: 0, recent: [] },
      sessions: [], bilans: [], deadline: null,
      health: { painDays: [], soreDays: [] },
      songs: [], workSong: null, ideas: [],
    };
    M.COMPS.forEach(c => { s.skills[c.id] = M.newSkill(2, 2); });
    return s;
  };
  St.migrate = function (s) {
    if (!s || typeof s !== 'object') return St.newState();
    const base = St.newState(s.created);
    for (const k of Object.keys(base)) if (s[k] == null) s[k] = base[k];
    s.profile = Object.assign(St.defaultProfile(), s.profile || {});
    M.COMPS.forEach(c => { if (!s.skills[c.id]) s.skills[c.id] = M.newSkill(2, 2); });
    s.v = St.VERSION;
    return s;
  };
  /** Point de départ déclaré : niveaux a priori (incertains) et accords déjà connus. */
  St.applyStart = function (s, key) {
    const st = St.START_LEVELS[key] || St.START_LEVELS.debut;
    s.profile.start = key;
    for (const c of M.COMPS) s.skills[c.id] = M.newSkill(st.th[c.id], key === 'zero' ? 1.2 : 1.8);
    const AC2 = AC.catalog;
    const vocab = st.vocab == null ? (AC2 ? AC2.VOCAB_ORDER.slice(0, 32) : []) : st.vocab;
    s.vocab = vocab.slice();
    vocab.forEach(id => { if (!s.chords[id]) s.chords[id] = { intro: today(), n: 0, clean: null, form: null, declared: true }; });
  };

  /* ---------------------------------------------------------------- vocabulaire */
  St.introduce = function (s, id, ts) {
    if (!s.vocab.includes(id)) s.vocab.push(id);
    if (!s.chords[id]) s.chords[id] = { intro: today(ts), n: 0, clean: null, form: null };
  };
  /** Accord maîtrisé : propre dans au moins 2 des 3 dernières vérifications, et formé en moins de 2,5 s. */
  St.mastered = (s, id) => { const c = s.chords[id]; return !!c && c.clean != null && c.clean >= 0.66 && (c.form == null || c.form <= 2.5) && c.n >= 2; };
  St.chordUpdate = function (s, id, o, ts) {
    const c = s.chords[id] || (s.chords[id] = { intro: today(ts), n: 0, clean: null, form: null });
    if (o.clean != null) { c.clean = c.clean == null ? (o.clean ? 1 : 0) : +(0.6 * c.clean + 0.4 * (o.clean ? 1 : 0)).toFixed(3); c.n++; c.last = ts || Date.now(); }
    if (isFinite(o.rt)) { c.form = c.form == null ? +o.rt.toFixed(2) : +(0.7 * c.form + 0.3 * o.rt).toFixed(2); c.formBest = Math.min(c.formBest || 99, +o.rt.toFixed(2)); }
    if (o.strings) c.strings = o.strings;
  };

  /* ---------------------------------------------------------------- paires, rythmiques */
  St.pairStat = (s, a, b) => s.pairs[T.pairKey(a, b)] || null;
  St.pairUpdate = function (s, a, b, cpm, ts) {
    const k = T.pairKey(a, b), p = s.pairs[k] || (s.pairs[k] = { n: 0, best: 0, ema: null, hist: [] });
    p.n++; p.best = Math.max(p.best, Math.round(cpm)); p.ema = p.ema == null ? cpm : 0.6 * p.ema + 0.4 * cpm; p.ema = +p.ema.toFixed(1); p.last = ts || Date.now();
    const d = today(ts), h = p.hist, l = h[h.length - 1];
    if (l && l[0] === d) l[1] = Math.max(l[1], Math.round(cpm)); else h.push([d, Math.round(cpm)]);
    if (h.length > 120) h.splice(0, h.length - 120);
  };
  St.pairRhythm = function (s, a, b, tempo, bpc, ts) {
    const k = T.pairKey(a, b), p = s.pairs[k] || (s.pairs[k] = { n: 0, best: 0, ema: null, hist: [] });
    const rate = tempo / bpc;
    if (!p.rhythm || rate > p.rhythm.rate) p.rhythm = { tempo, bpc, rate, day: today(ts) };
  };
  St.patternUpdate = function (s, table, id, tempo, mae, ts) {
    const p = s[table][id] || (s[table][id] = { n: 0, best: 0, mae: null });
    p.n++; if (tempo > p.best) p.best = tempo; p.last = ts || Date.now();
    if (isFinite(mae)) p.mae = p.mae == null ? mae : +(0.7 * p.mae + 0.3 * mae).toFixed(1);
  };

  /* ---------------------------------------------------------------- séries */
  St.addSeries = function (s, key, value, ts, mode) {
    if (!isFinite(value)) return;
    const arr = s.series[key] = s.series[key] || [];
    const d = today(ts), last = arr[arr.length - 1];
    if (last && last[0] === d) last[1] = mode === 'min' ? Math.min(last[1], +value.toFixed(2)) : mode === 'max' ? Math.max(last[1], +value.toFixed(2)) : +value.toFixed(2);
    else arr.push([d, +value.toFixed(2)]);
    if (arr.length > 500) arr.splice(0, arr.length - 500);
  };

  /* ---------------------------------------------------------------- chansons */
  /**
   * Fiche de chanson à partir du texte collé : grille lue, capo le plus confortable, formes à jouer.
   * o : {title, artist, tempo, strum, bpc, capo (forcé), transpose}
   */
  St.makeSong = function (text, o) {
    o = o || {};
    const parsed = T.parseSong(text);
    const song = {
      id: 's' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
      title: o.title || parsed.title || 'Ma chanson', artist: o.artist || parsed.artist || '',
      text: String(text || ''), tempo: o.tempo || parsed.tempo || 90, strum: o.strum || 'r4', bpc: o.bpc || 4,
      transpose: o.transpose || 0, capo: o.capo != null ? o.capo : parsed.capo, created: Date.now(), prefs: {},
      lyrics: '',
    };
    const firstLyric = parsed.sections.flatMap(sx => sx.lines).find(l => l.lyrics);
    if (firstLyric) song.lyrics = firstLyric.lyrics.slice(0, 90);
    return song;
  };
  /**
   * Analyse d'une chanson pour l'entraînement : symboles réels (transposés), capo retenu, formes jouées,
   * sections en mesures, paires de changements, tonalité.
   */
  St.songInfo = function (song) {
    const parsed = T.parseSong(song.text);
    // les accords écrits sous « Capo N » sont des formes : le son réel est N demi-tons plus haut
    const tr = (song.transpose || 0) + (parsed.capo || 0);
    const real = sym => (tr ? T.transposeSym(sym, tr) : sym);
    const seqReal = parsed.seq.map(real);
    if (!seqReal.length) return { ok: false, warnings: parsed.warnings, parsed };
    const opts = T.capoOptions(seqReal);
    let capo = song.capo != null ? song.capo : opts.length ? opts[0].capo : 0;
    const shapeOf = sym => T.transposeSym(sym, -capo);
    const voicingOf = sym => { const sh = shapeOf(sym); const pl = T.playable(sh, song.prefs); return pl ? pl.v.id : null; };
    const sections = parsed.sections.map(sx => {
      const bars = [];
      for (const l of sx.lines) {
        if (l.bars && l.bars.length) l.bars.forEach(b => { const ids = b.filter(c => c !== '/' && c !== '%').map(c => voicingOf(real(c))).filter(Boolean); if (ids.length) bars.push(ids); else if (b[0] === '%' && bars.length) bars.push(bars[bars.length - 1].slice()); });
        else l.chords.forEach(c => { const id = voicingOf(real(c)); if (id) bars.push([id]); });
      }
      return { name: sx.name, bars, lines: sx.lines.map(l => ({ chords: l.chords.map(real), lyrics: l.lyrics, bars: l.bars ? l.bars.map(b => b.map(c => (c === '/' || c === '%' ? c : real(c)))) : null })) };
    }).filter(sx => sx.bars.length || sx.lines.length);
    const seqV = seqReal.map(voicingOf).filter(Boolean);
    const trans = T.transitionsOf(seqV);
    const key = T.detectKey(seqReal);
    const simplified = Array.from(new Set(seqReal.map(shapeOf))).map(sh => ({ sh, p: T.playable(sh, song.prefs) })).filter(x => x.p && x.p.simplified).map(x => ({ shape: x.sh, as: x.p.as }));
    const uniq = Array.from(new Set(seqV));
    const maxCost = trans.length ? Math.max(...trans.map(t => T.transitionCost(t.a, t.b))) : 0;
    const pat = T.strum(song.strum) || T.strum('r3');
    const diff = Math.max(...uniq.map(id => T.voicing(id).d), T.strumCost(pat) + 0.5, 0.35 * maxCost + 1.5);
    return { ok: true, parsed, capo, capoOptions: opts.slice(0, 4), sections, seq: seqV, uniq, transitions: trans, key, simplified, diff: +diff.toFixed(2), realChords: Array.from(new Set(seqReal)) };
  };
  /**
   * « Prête à jouer » : pour chaque changement, ton record de changements/min face à celui qu'exige la chanson
   * (tempo ÷ temps par accord, avec 30 % de marge) ; propreté des accords ; rythmique au tempo ; chant.
   * @returns {score (0–1), parts:{chords, changes, strum, chant}, bottleneck, details}
   */
  St.readiness = function (s, song, info) {
    info = info || St.songInfo(song);
    if (!info.ok) return null;
    const need = T.requiredCpm(song.tempo, song.bpc) * 1.3;
    const ch = info.transitions.map(t => {
      const p = St.pairStat(s, t.a, t.b);
      const best = p ? p.best : 0;
      return { a: t.a, b: t.b, n: t.n, best, need: Math.round(need), ratio: Math.min(1, best / need), rhythm: p && p.rhythm ? p.rhythm : null };
    }).sort((x, y) => x.ratio - y.ratio);
    const weakest = ch.slice(0, 2);
    const changes = ch.length ? weakest.reduce((a, b) => a + b.ratio, 0) / weakest.length * 0.6 + ch.reduce((a, b) => a + b.ratio, 0) / ch.length * 0.4 : 1;
    const chords = info.uniq.map(id => { const c = s.chords[id]; return { id, known: !!c, clean: c && c.clean != null ? c.clean : 0 }; });
    const chordsScore = chords.length ? chords.reduce((a, c) => a + (c.known ? Math.max(0.3, c.clean) : 0), 0) / chords.length : 0;
    const ps = s.patterns[song.strum];
    const strum = ps ? Math.min(1, ps.best / song.tempo) : 0;
    const cs = s.chant[song.strum];
    const chant = cs ? Math.min(1, cs.best / song.tempo) : 0;
    // sections jouées en entier dans « Ma chanson » : part du tempo réel tenue (rythmique simplifiée : ×0,7)
    const prog = song.progress || {};
    const secs = info.sections.map((sx, i) => Math.min(1, prog[i] || 0));
    const sections = secs.length ? secs.reduce((a, b) => a + b, 0) / secs.length : 0;
    const score = 0.35 * changes + 0.15 * chordsScore + 0.2 * strum + 0.15 * chant + 0.15 * sections;
    const parts = { changes, chords: chordsScore, strum, chant, sections };
    // goulot : la partie la plus en retard, avec un conseil concret
    let bottleneck = null;
    const unknown = chords.filter(c => !c.known);
    if (unknown.length) bottleneck = { kind: 'chord', id: unknown[0].id, text: 'Accord à apprendre : ' + T.pretty(T.voicing(unknown[0].id).sym) };
    else if (ch.length && ch[0].ratio < 0.9) bottleneck = { kind: 'pair', a: ch[0].a, b: ch[0].b, text: 'Changement ' + T.pretty(T.voicing(ch[0].a).sym) + ' → ' + T.pretty(T.voicing(ch[0].b).sym) + ' : ' + (ch[0].best ? ch[0].best + '/min, il en faut ' + ch[0].need : 'pas encore mesuré (il en faudra ' + ch[0].need + '/min)') };
    else if (strum < 0.9) bottleneck = { kind: 'strum', id: song.strum, text: 'Rythmique « ' + (T.strum(song.strum) || {}).name + ' » à ' + song.tempo + ' BPM (record : ' + (ps ? ps.best : 0) + ')' };
    else if (chant < 0.9) bottleneck = { kind: 'chant', id: song.strum, text: 'Chanter en jouant la rythmique à ' + song.tempo + ' BPM' };
    else if (sections < 0.9) { const i = secs.indexOf(Math.min(...secs)); bottleneck = { kind: 'section', sec: i, text: '« ' + info.sections[i].name + ' » en entier à tempo (record : ' + Math.round(100 * secs[i]) + ' %)' }; }
    return { score: +score.toFixed(3), parts, bottleneck, changes: ch, chords, sections: secs };
  };
  St.workSong = s => (s.songs || []).find(x => x.id === s.workSong) || null;

  /* ---------------------------------------------------------------- contexte des exercices */
  St.ctx = function (s, plan, extra) {
    const song = St.workSong(s);
    let songCtx = null, songPairs = [], songSeq = null;
    if (song) {
      const info = St.songInfo(song);
      if (info.ok) {
        songCtx = { id: song.id, title: song.title, tempo: song.tempo, strum: song.strum, bpc: song.bpc, sections: info.sections, diff: info.diff, capo: info.capo };
        const rd = St.readiness(s, song, info);
        songPairs = (rd ? rd.changes : []).filter(c => s.vocab.includes(c.a) && s.vocab.includes(c.b)).map(c => [c.a, c.b]);
        songSeq = info.seq.filter((x, i, arr) => i === 0 || x !== arr[i - 1]).slice(0, 4);
      }
    }
    const easy = ['Em', 'Asus2', 'Am', 'E', 'D'].find(id => s.vocab.includes(id)) || 'Em';
    return Object.assign({
      profile: s.profile, vocab: s.vocab.slice(), newChord: plan && plan.newChord || null,
      week: St.programWeek(s), block: plan ? plan.block : 1,
      level: comp => (s.skills[comp] ? s.skills[comp].th : 2),
      pairStat: (a, b) => St.pairStat(s, a, b),
      patternStat: id => s.patterns[id] || null,
      chordStat: id => s.chords[id] || null,
      song: songCtx, songPairs, songSeq, songLyrics: song ? song.lyrics : '',
      easyChord: easy, a4: s.profile.tuning || 440,
      // accords des 3 dernières semaines pas encore propres (moins de 2 vérifications réussies sur 3)
      freshChords: s.vocab.filter(id => { const c = s.chords[id]; return c && !c.declared && St.dayDiff(c.intro, today()) <= 21 && !(c.clean >= 0.66 && c.n >= 2); }),
    }, extra || {});
  };

  /* ---------------------------------------------------------------- une prise */
  /**
   * Enregistre une prise jugée : niveaux (principal + secondaires), statistiques de l'exercice, observation
   * directe, records d'accords, de paires et de rythmiques, séries, auto-évaluation.
   * take : {ex, params, d, judged:{y, success, metrics, observe, chord, pair, pattern…}, self, predicted}
   */
  St.recordTake = function (s, take, ts) {
    ts = ts || Date.now();
    const C = AC.catalog;
    const ex = C.EX[take.ex];
    const j = take.judged || {};
    let y = j.y, w = 1;
    if (y == null && take.self != null) { y = take.self; w = 0.5; }
    if (ex && ex.comp && s.skills[ex.comp]) s.skills[ex.comp].lastMain = ts;
    if (ex && ex.comp && y != null && isFinite(take.d)) {
      const p = M.update(s.skills[ex.comp], take.d, y, w, ts);
      for (const [c, cw] of Object.entries(ex.also || {})) if (s.skills[c]) M.nudge(s.skills[c], y - p, cw * w, ts);
    }
    if (j.observe && s.skills[j.observe.comp]) M.observe(s.skills[j.observe.comp], j.observe.level, j.observe.noise, ts);
    const it = s.items[take.ex] = s.items[take.ex] || { n: 0, ok: 0, last: 0, first: ts };
    it.n++; if (j.success) it.ok++; it.last = ts; it.lastD = take.d;
    if (j.chord) St.chordUpdate(s, j.chord.id, { clean: j.chord.clean, strings: j.chord.strings }, ts);
    if (j.forms) j.forms.forEach(f => St.chordUpdate(s, f.id, { rt: f.rt }, ts));
    if (j.pair) St.pairUpdate(s, j.pair.a, j.pair.b, j.pair.cpm, ts);
    if (j.rhythmPair) St.pairRhythm(s, j.rhythmPair.a, j.rhythmPair.b, j.rhythmPair.tempo, j.rhythmPair.bpc, ts);
    if (j.pattern) St.patternUpdate(s, 'patterns', j.pattern.id, j.pattern.tempo, j.metrics && j.metrics.mae, ts);
    if (j.pick) St.patternUpdate(s, 'picks', j.pick.id, j.pick.tempo, j.metrics && j.metrics.mae, ts);
    if (j.chant) St.patternUpdate(s, 'chant', j.chant.p, j.chant.tempo, j.metrics && j.metrics.mae, ts);
    if (j.song && j.song.ok) {
      const sg = (s.songs || []).find(x => x.id === j.song.id);
      if (sg) { sg.progress = sg.progress || {}; const eff = +(j.song.ratio * (j.song.mode === sg.strum ? 1 : 0.7)).toFixed(2); sg.progress[j.song.sec] = Math.max(sg.progress[j.song.sec] || 0, eff); }
    }
    const m = j.metrics || {};
    if (take.ex === 'pulse' && isFinite(m.sd)) St.addSeries(s, 'timingSd', m.sd, ts, 'min');
    if (take.ex === 'minute' && isFinite(m.cpm)) St.addSeries(s, 'cpm', m.cpm, ts, 'max');
    if (isFinite(m.jnd)) St.addSeries(s, 'jnd', m.jnd, ts, 'min');
    if (take.predicted && take.predicted !== '?' && j.y != null) {
      const truth = St.truthOf(take, j);
      if (truth) take.calib = St.addCalibration(s, take.predicted, truth);
    }
  };
  /** Vérité mesurée comparable à l'auto-évaluation (« avant de voir ») : propre / pas propre ; à l'heure / en avance / en retard. */
  St.truthOf = function (take, j) {
    const m = j.metrics || {};
    if (take.predictKind === 'clean') return j.success ? 'propre' : 'pas propre';
    if (take.predictKind === 'timing' && isFinite(m.mae)) return j.success ? 'en place' : 'pas en place';
    return j.success != null ? (j.success ? 'en place' : 'pas en place') : null;
  };
  St.addCalibration = function (s, pred, truth) {
    const hit = pred === truth ? 1 : 0;
    s.calib.n++; s.calib.hits += hit;
    s.calib.recent.push(hit); if (s.calib.recent.length > 30) s.calib.recent.shift();
    return { truth, hit };
  };
  St.calibRate = s => (s.calib.recent.length >= 5 ? s.calib.recent.reduce((a, b) => a + b, 0) / s.calib.recent.length : null);
  /** Photo de ce qu'une prise modifie (pour corriger une mesure après coup sans compter deux fois). */
  St.snapshot = (s, exId) => JSON.stringify({ skills: s.skills, item: s.items[exId] || null, calib: s.calib, series: s.series, chords: s.chords, pairs: s.pairs, patterns: s.patterns, picks: s.picks, chant: s.chant });
  St.restore = function (s, exId, snap) {
    const o = JSON.parse(snap);
    for (const k of ['skills', 'calib', 'series', 'chords', 'pairs', 'patterns', 'picks', 'chant']) s[k] = o[k];
    if (o.item) s.items[exId] = o.item; else delete s.items[exId];
  };

  /* ---------------------------------------------------------------- cartes */
  St.cardsAvailable = s => R.available(St.programWeek(s), s.vocab.filter(id => !String(id).includes(':')));
  St.reviewCard = function (s, id, correct, sec, ts) {
    const day = today(ts), prev = s.cards[id];
    const g = R.grade(correct, sec);
    const c = R.review(prev, g, day);
    if (!prev) c.first = day;
    s.cards[id] = c;
    const card = R.card(id);
    if (card && s.skills.harmonie) M.update(s.skills.harmonie, card.b, correct ? 1 : 0, 0.25, ts);
    return c;
  };

  /* ---------------------------------------------------------------- séances */
  St.startSession = function (s, plan, ts) {
    const sess = { id: 's' + (ts || Date.now()), date: today(ts), ts: ts || Date.now(), type: plan.type, week: plan.week, bilanWeek: plan.bilanWeek || null, planned: plan.minutes, checkin: plan.checkin || null, takes: [], done: false, load: 0 };
    if (plan.type === 'B') { sess.startSkills = {}; for (const [k, v] of Object.entries(s.skills)) sess.startSkills[k] = { th: v.th, sd: v.sd }; }
    if (plan.newChord) St.introduce(s, plan.newChord, ts);
    (plan.introduce || []).forEach(id => St.introduce(s, id, ts));
    return sess;
  };
  St.dropSession = (s, id) => { s.sessions = s.sessions.filter(x => x.id !== id); };
  St.finishSession = function (s, sess, ts, partial) {
    St.dropSession(s, sess.id);
    sess.done = !partial; sess.partial = !!partial; sess.end = ts || Date.now();
    sess.minutes = Math.min(180, Math.round((isFinite(sess.activeMs) ? sess.activeMs : sess.end - sess.ts) / 60000));
    const compact = Object.assign({}, sess, { startSkills: undefined, takes: sess.takes.map(t => ({ ex: t.ex, d: +(+t.d || 0).toFixed(2), y: t.judged ? t.judged.y : null, ok: t.judged ? t.judged.success : null, self: t.self, pred: t.predicted, m: t.judged ? t.judged.metrics : null, pain: t.pain || undefined, disputed: t.disputed != null ? t.disputed : undefined })) });
    const prev = s.sessions[s.sessions.length - 1];
    if (prev) { const gap = St.dayDiff(prev.date, sess.date); if (gap > 4) s.program.pausedDays += gap - 4; }
    s.sessions.push(compact);
    if (s.sessions.length > 600) s.sessions.splice(0, s.sessions.length - 600);
    return compact;
  };
  St.maybeNewCycle = function (s, dateStr) {
    const d = dateStr || today();
    const eff = St.dayDiff(s.program.start, d) - (s.program.pausedDays || 0);
    const final = s.bilans.some(b => b.week === 16 && b.cycle === s.program.cycle);
    if ((final && eff >= 15 * 7) || eff >= 18 * 7) { s.program.cycle = (s.program.cycle || 1) + 1; s.program.start = d; s.program.pausedDays = 0; return true; }
    return false;
  };
  St.programWeek = function (s, dateStr) {
    const eff = St.dayDiff(s.program.start, dateStr || today()) - (s.program.pausedDays || 0);
    return Math.min(16, Math.floor(Math.max(0, eff) / 7) + 1);
  };

  /* ---------------------------------------------------------------- sauvegarde */
  St.exportJSON = s => JSON.stringify({ app: 'ACCORD', v: St.VERSION, exportedAt: new Date().toISOString(), state: s });
  St.importJSON = function (txt) {
    const o = JSON.parse(txt);
    if (o && o.app === 'ACCORD' && o.state) return St.migrate(o.state);
    throw new Error('Fichier non reconnu (ce n’est pas une sauvegarde ACCORD).');
  };
  /**
   * Données de l'ancienne app « Corde » (même adresse, même téléphone) : jours de pratique, records de tempo,
   * auto-évaluations. Elles servent à choisir le point de départ ; le bilan d'entrée mesure ensuite.
   * get : (clé) → valeur JSON lue dans le stockage du navigateur.
   */
  St.readCorde = function (get) {
    try {
      const done = get('corde.done') || [], log = get('corde.log') || [], rec = get('corde.records') || {};
      if (!done.length && !log.length) return null;
      const ok = log.reduce((a, x) => a + (x.ok || 0), 0), ko = log.reduce((a, x) => a + (x.ko || 0), 0);
      const days = Array.from(new Set(done)).length, maxDay = done.length ? Math.max(...done) : 0;
      const last = log.length ? log[log.length - 1].date : null;
      const suggest = maxDay >= 40 ? 'avance' : maxDay >= 8 ? 'chansons' : 'debut';
      return { days, maxDay, ok, ko, last, records: Object.keys(rec).length, suggest };
    } catch (e) { return null; }
  };

  AC.state = St;
  if (typeof module !== 'undefined' && module.exports) module.exports = St;
})(typeof globalThis !== 'undefined' ? globalThis : this);
