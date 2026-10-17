'use strict';
/*
 * Tests automatiques d'ACCORD (sans navigateur, sans dépendance) : node tests/run.js
 * Ils vérifient la théorie (accords, grilles collées, tonalité, capo), l'analyse des tapes sur des tapeurs
 * simulés (délai du téléphone, régularité, coups manqués ou en trop, dérive quand le clic se tait, doubles
 * croches), l'accordeur guidé sur une guitare de synthèse réaliste passée par un micro de téléphone, la guitare
 * de l'app, les exercices et leurs jugements (poids des mesures), les cartes (FSRS), l'état (prête à jouer,
 * sauvegarde, passage de la version 1 à la version 2) et le programme de 16 semaines sur un élève simulé.
 */
const { loadAccord } = require('./load.js');
const S = require('./synth.js');
const AC = loadAccord();
const T = AC.theory, D = AC.dsp, K = AC.taps, G = AC.gsynth, M = AC.model, R = AC.srs, C = AC.catalog, St = AC.state, P = AC.planner;

let fails = 0, count = 0;
const only = (process.argv[2] || '').toLowerCase();      // node tests/run.js tapes : seulement les tests dont le nom contient « tapes »
function test(name, fn) {
  if (only && !name.toLowerCase().includes(only)) return;
  const t0 = Date.now();
  try { fn(); count++; console.log('✓ ' + name + ' (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)'); }
  catch (e) { fails++; count++; console.log('✗ ' + name + '\n    ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join('\n    ') : e)); }
}
function ok(cond, msg) { if (!cond) throw new Error(msg || 'échec'); }
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const DAY = 864e5;

/* ================================================================== théorie */
test('accords : noms français et anglais, basses, bémols, qualités', () => {
  const cases = { Do: 'C', 'Ré m': 'Dm', Sol7: 'G7', Lam: 'Am', 'Fa#m': 'F#m', Sib: 'Bb', Cadd9: 'Cadd9', Dsus4: 'Dsus4', 'D/F#': 'D/F#', Faug: 'Faug', Fadd9: 'Fadd9', Mi7: 'E7', Bbmaj7: 'Bbmaj7', 'Am7b5': 'Am7b5', 'C#m': 'C#m', 'Rém7': 'Dm7', 'Solmaj7': 'Gmaj7' };
  for (const [inp, want] of Object.entries(cases)) { const c = T.parseChord(inp); ok(c && T.chordSym(c) === want, inp + ' → ' + (c ? T.chordSym(c) : 'null') + ' (attendu ' + want + ')'); }
  for (const bad of ['la', 'sol', 'Hello', 'Xm']) ok(!T.parseChord(bad), bad + ' ne doit pas être lu comme un accord');
});

test('grilles collées : ChordPro, accords au-dessus des paroles, mesures, titre, capo', () => {
  const ps = T.parseSong('Titre : Test\nCapo 2\n[Intro]\n| G | D | Em | C |\n[Couplet]\n[G]Hello [D]world\nEm      C\nla la la\n[Refrain]\n| C % | G / D |');
  ok(ps.title === 'Test' && ps.capo === 2, 'titre/capo : ' + ps.title + ' / ' + ps.capo);
  ok(ps.sections.map(s => s.name).join(',') === 'Intro,Couplet,Refrain', 'sections : ' + ps.sections.map(s => s.name));
  ok(ps.seq.slice(0, 8).join(' ') === 'G D Em C G D Em C', 'suite : ' + ps.seq.join(' '));
  ok(ps.uniq.join(' ') === 'G D Em C', 'accords : ' + ps.uniq.join(' '));
  const plain = T.parseSong('Am F C G\nAm F C G\nJe chante la la la\nF G Am');
  ok(plain.seq.join(' ') === 'Am F C G Am F C G F G Am' && plain.warnings.length === 0, 'grille simple : ' + plain.seq.join(' '));
  const lyricsOnly = T.parseSong('Il était une fois\nla vie en rose');
  ok(!lyricsOnly.seq.length && lyricsOnly.warnings.length, 'des paroles seules ne donnent pas d’accords');
});

test('tonalité et capo : Sol majeur, La mineur ; Mi♭ joué capo 3 en Do Sol Lam Fa', () => {
  const k1 = T.detectKey(['G', 'D', 'Em', 'C']), k2 = T.detectKey(['Am', 'F', 'C', 'G']);
  ok(k1.tonic === 7 && !k1.minor, 'G D Em C : ' + JSON.stringify(k1));
  ok(k2.tonic === 9 && k2.minor, 'Am F C G : ' + JSON.stringify(k2));
  const o = T.capoOptions(['Eb', 'Bb', 'Cm', 'Ab'])[0];
  ok(o.capo === 3 && o.shapes.join(' ') === 'C G Am F', 'Mi♭ : capo ' + o.capo + ' ' + o.shapes.join(' '));
  const o2 = T.capoOptions(['F#m', 'D', 'A', 'E'])[0];
  ok(o2.capo === 2 && o2.shapes.join(' ') === 'Em C G D', 'Fa♯m : capo ' + o2.capo + ' ' + o2.shapes.join(' '));
  ok(T.capoOptions(['G', 'C', 'D']).every(x => x.capo <= 7), 'pas de capo au-delà de la case 7');
});

test('degrés : ♭VI et ♭VII en bémols, iv emprunté, V7, renversement', () => {
  const got = ['I', 'IV', 'V', 'vi', '♭VI', '♭VII', 'iv', 'V7', 'I/3'].map(dg => T.degreeChord(dg, 7));
  ok(got.join(' ') === 'G C D Em Eb F Cm D7 G/B', got.join(' '));
  ok(T.degreeChord('♭VII', 9) === 'G' && T.degreeChord('♭III', 9) === 'C', 'en La : ♭VII = Sol, ♭III = Do');
  for (const s of ['C', 'F#m', 'Bb7', 'Ebmaj7', 'D/F#', 'Gsus4']) for (const n of [1, 5, -3, 11]) ok(T.transposeSym(T.transposeSym(s, n), -n) === s, 'transposition aller-retour ' + s + ' ' + n);
});

test('formes d’accords : 6 cordes, doigtés cohérents, notes de l’accord (fondamentale et tierce présentes)', () => {
  let n = 0;
  for (const v of T.OPEN_DB) {
    ok(v.frets.length === 6 && v.fingers.length === 6, v.id + ' : 6 cordes');
    const snd = T.sounding(v);
    ok(snd.length >= 3, v.id + ' : au moins 3 cordes jouées');
    v.frets.forEach((f, s) => { if (f > 0) ok(v.fingers[s] >= 1 && v.fingers[s] <= 5, v.id + ' corde ' + s + ' : doigt manquant'); });
    const pcs = new Set(T.chordPcs(v.sym));
    const notes = T.voicingNotes(v).filter(x => x != null).map(x => T.mod12(x));
    ok(notes.every(pc => pcs.has(pc)), v.id + ' : note hors de l’accord ' + v.sym);
    const c = T.parseChord(v.sym);
    ok(notes.includes(T.mod12(c.root)), v.id + ' : fondamentale absente');
    const third = (T.QUAL[c.q] || T.QUAL['']).iv.find(i => i === 3 || i === 4);
    if (third != null && !/sus|5$/.test(c.q)) ok(notes.includes(T.mod12(c.root + third)), v.id + ' : tierce absente');
    ok(isFinite(v.d) && v.d > 0 && v.d < 8, v.id + ' : difficulté ' + v.d);
    n++;
  }
  ok(n >= 40, n + ' formes seulement');
});

test('enchaînements : changements avec doigt pivot moins coûteux, barrés plus durs que les ouverts', () => {
  ok(T.transitionCost('Am', 'C') < T.transitionCost('G', 'C'), 'Lam→Do (2 doigts restent) doit être plus facile que Sol→Do');
  ok(T.transitionCost('Em', 'G-pop') < T.transitionCost('Em', 'F'), 'Mim→Sol pop plus facile que Mim→Fa');
  ok(T.voicing('F').d > T.voicing('Em').d && T.voicing('Bm').d > T.voicing('Am').d, 'barrés plus difficiles');
});

/* ================================================================== tapes */
/** Coups attendus d'une partition jouée à partir de 1 s (comme l'app : décompte d'une mesure avant). */
function expectedOf(sc) { const beat = 60 / sc.tempo; return K.expected(sc, 1 + sc.countIn * beat); }
function analyzeTaps(sc, o) {
  const ex = expectedOf(sc), taps = S.tapper(ex.events, o);
  return K.analyze(taps, ex.events, { slot: ex.slot, beat: ex.beat, prior: o && o.prior });
}
const pulseScore = (tempo, sub, silent) => { const bars = 2 + silent + 1, clickBars = []; for (let b = 0; b < bars; b++) clickBars.push(b < 2 || b === bars - 1); return C.rhythmScore({ seq: ['Em'], tempo, bars, sub, clickBars }); };

test('tapes : délai du téléphone retrouvé (Bluetooth compris), régularité mesurée, rien de manqué ni en trop (48 tapeurs, 60–130 BPM)', () => {
  const offErr = [], sdRatio = [];
  let n = 0;
  // en croches, un délai plus long qu'une croche serait ambigu la toute première fois : l'app l'apprend d'abord en
  // noires (bilan, premières séances) et s'en sert ensuite comme point de départ
  const learned = {};
  for (const tempo of [60, 84, 104, 130]) for (const sub of [1, 2]) for (const [offset, sd] of [[-0.03, 0.008], [0.05, 0.015], [0.12, 0.025], [0.25, 0.012], [0.04, 0.04], [0.18, 0.02]]) {
    const sc = pulseScore(tempo, sub, 0), seed = ++n, ex = expectedOf(sc), taps = S.tapper(ex.events, { offset, sd, seed });
    const res = K.analyze(taps, ex.events, { slot: ex.slot, beat: ex.beat, prior: sub === 2 ? learned[offset] : undefined });
    if (sub === 1) learned[offset] = res.offset;
    // dispersion réelle de ces tapes-là (le tirage de 12 à 24 tapes s'écarte de l'écart-type nominal)
    const dev = taps.map((t, i) => 1000 * (t - ex.events[i].t)), m = dev.reduce((x, y) => x + y, 0) / dev.length;
    const trueSd = Math.sqrt(dev.reduce((x, y) => x + (y - m) * (y - m), 0) / (dev.length - 1));
    // un tapeur très irrégulier (±40 ms) peut faire une tape aberrante : elle compte alors comme manquée
    ok(sd < 0.03 ? res.hitRate === 1 && !res.extras.length : res.hitRate >= 0.9 && res.extras.length <= 1, tempo + ' BPM, délai ' + offset + ' s, ±' + 1000 * sd + ' ms : ' + res.hits + '/' + res.n + ', ' + res.extras.length + ' en trop');
    offErr.push(Math.abs(res.offset - offset) * 1000);
    sdRatio.push(res.sd / trueSd);
  }
  const med = a => K.median(a);
  ok(med(offErr) <= 5 && Math.max(...offErr) <= 20, 'délai : erreur médiane ' + med(offErr).toFixed(1) + ' ms, max ' + Math.max(...offErr).toFixed(1));
  // une tape aberrante écartée ne peut que réduire la dispersion mesurée
  ok(med(sdRatio) > 0.99 && Math.min(...sdRatio) > 0.8 && Math.max(...sdRatio) < 1.01, 'régularité mesurée / réelle : médiane ' + med(sdRatio).toFixed(3) + ' [' + Math.min(...sdRatio).toFixed(3) + ' – ' + Math.max(...sdRatio).toFixed(3) + ']');
});

test('tapes : coups oubliés et tapes en trop repérés, y compris sur les silences du motif ; retour qui les nomme', () => {
  for (const [p, tempo] of [['r3', 84], ['r4', 92], ['r9', 88], ['r6', 72]]) {
    const pat = T.strum(p), sc = C.rhythmScore({ strum: p, seq: ['Em'], bpc: 4, tempo, bars: 4 }), ex = expectedOf(sc), beat = 60 / tempo;
    const start = ex.events[0].t - ex.events[0].b * beat;
    // deux tapes sur des cases « silence » de la 2ᵉ mesure, et trois coups oubliés
    const rests = []; for (let i = 0; i < pat.slots.length; i++) if (pat.slots[i] === '.') rests.push(start + (pat.sig + i / pat.sub) * beat);
    const taps = S.tapper(ex.events, { offset: 0.07, sd: 0.012, seed: 3, skip: (e, i) => i === 2 || i === 7 || i === 11, extra: rests.slice(0, 2) });
    const res = K.analyze(taps, ex.events, { slot: ex.slot, beat: ex.beat });
    ok(res.hits === res.n - 3 && res.extras.length === 2, p + ' : ' + res.hits + '/' + res.n + ' trouvés, ' + res.extras.length + ' en trop');
    const j = C.EX.rythme.judge({ taps: res }, { p, tempo, seq: ['Em'], tol: 45 }, null);
    ok(j.y < 1 && j.fb.some(f => /3\/\d+ coups sans tape/.test(f.text)) && j.fb.some(f => /2 tapes en trop — dont 2 sur une case « silence »/.test(f.text)), p + ' : ' + j.fb.map(f => f.text).join(' / '));
  }
  // motif bien tapé : réussi, sans fausse alarme
  const sc = C.rhythmScore({ strum: 'r4', seq: ['Em'], bpc: 4, tempo: 90, bars: 4 }), good = analyzeTaps(sc, { offset: 0.09, sd: 0.012, seed: 9 });
  const j = C.EX.rythme.judge({ taps: good }, { p: 'r4', tempo: 90, seq: ['Em'], tol: 35, tapOnly: true }, null);
  ok(j.y === 1 && j.fb.some(f => /Tous les coups au bon endroit/.test(f.text)) && j.pattern && j.pattern.tempo === 90, 'bien tapé : ' + j.y + ' ' + j.fb.map(f => f.text).join(' / '));
});

test('tapes : dérive sans le clic mesurée (accélère de 4 % → 4 ± 1 %, ralentit de 3 %) ; tempo tenu → « tempo tenu »', () => {
  for (const tempo of [72, 96, 120]) {
    const sc = pulseScore(tempo, 1, 2);
    const steady = analyzeTaps(sc, { offset: 0.06, sd: 0.012, seed: tempo });
    ok(steady.drift && Math.abs(steady.drift.tempoPct) < 1.5 && steady.drift.pctSe < 1, tempo + ' BPM, tenu : ' + (steady.drift && steady.drift.tempoPct.toFixed(2) + ' ± ' + steady.drift.pctSe.toFixed(2)) + ' %');
    const js = C.EX.pulse.judge({ taps: steady }, { tempo, sub: 1, silent: 2, tol: 35 });
    ok(js.y === 1 && js.fb.some(f => /tempo tenu/.test(f.text)) && js.observe && js.observe.comp === 'pulsation', tempo + ' BPM tenu : ' + js.fb.map(f => f.text).join(' / '));
    const fast = analyzeTaps(sc, { offset: 0.06, sd: 0.012, seed: tempo + 1, drift: 0.04 / 1.04 });
    ok(fast.drift && near(fast.drift.tempoPct, 4, 1) && fast.drift.endErr < -40, tempo + ' BPM, accélère : ' + fast.drift.tempoPct.toFixed(2) + ' %, retour du clic ' + fast.drift.endErr.toFixed(0) + ' ms');
    const jf = C.EX.pulse.judge({ taps: fast }, { tempo, sub: 1, silent: 2, tol: 35 });
    ok(jf.y < 1 && jf.fb.some(f => /tu accélères de [34],\d %/.test(f.text)), tempo + ' BPM accélère : ' + jf.fb.map(f => f.text).join(' / '));
    const slow = analyzeTaps(sc, { offset: 0.06, sd: 0.012, seed: tempo + 2, drift: -0.03 / 0.97 });
    ok(slow.drift && near(slow.drift.tempoPct, -3, 1) && slow.drift.endErr > 30, tempo + ' BPM, ralentit : ' + slow.drift.tempoPct.toFixed(2) + ' %');
  }
});

test('tapes : doubles croches à 65–90 BPM sans erreur d’appariement ; « haut » pressés repérés', () => {
  for (const [p, tempo] of [['r11', 65], ['r12', 76], ['r13', 70], ['r14', 90]]) {
    const sc = C.rhythmScore({ strum: p, seq: ['Em'], bpc: 4, tempo, bars: 4 });
    const res = analyzeTaps(sc, { offset: 0.08, sd: 0.012, seed: tempo });
    ok(res.hitRate === 1 && !res.extras.length && res.mae < 15, p + ' à ' + tempo + ' : ' + res.hits + '/' + res.n + ', ' + res.extras.length + ' en trop, ±' + res.mae.toFixed(1) + ' ms');
  }
  const sc = C.rhythmScore({ strum: 'r2', seq: ['Em'], bpc: 4, tempo: 80, bars: 4 });
  const res = analyzeTaps(sc, { offset: 0.08, sd: 0.01, seed: 4, upBias: -0.05 });
  const j = C.EX.rythme.judge({ taps: res }, { p: 'r2', tempo: 80, seq: ['Em'], tol: 45, tapOnly: true }, null);
  ok(j.fb.some(f => /« haut » \(↑\) arrivent \d+ ms trop tôt/.test(f.text)), '« haut » pressés : ' + j.fb.map(f => f.text).join(' / '));
});

test('tapes : rien tapé → pas de verdict inventé ; délai déjà connu du téléphone utilisé comme point de départ', () => {
  const sc = pulseScore(80, 1, 1), ex = expectedOf(sc);
  const none = K.analyze([], ex.events, { slot: ex.slot, beat: ex.beat });
  const j = C.EX.pulse.judge({ taps: none }, { tempo: 80, sub: 1, silent: 1, tol: 45 });
  ok(j.y == null && /aucune tape/.test(j.fb[0].text), 'sans tape : ' + JSON.stringify(j));
  // croches rapides avec un délai de 210 ms : sans a priori, ambigu ; avec le délai mesuré la fois d'avant, retrouvé
  const sc2 = pulseScore(126, 2, 0), ex2 = expectedOf(sc2), taps = S.tapper(ex2.events, { offset: 0.21, sd: 0.01, seed: 2 });
  const withPrior = K.analyze(taps, ex2.events, { slot: ex2.slot, beat: ex2.beat, prior: 0.2 });
  ok(near(withPrior.offset, 0.21, 0.01) && withPrior.hitRate === 1, 'avec a priori : ' + withPrior.offset.toFixed(3) + ' s, ' + withPrior.hits + '/' + withPrior.n);
});

/* ================================================================== accordeur guidé */
/** Note jouée à vide, entendue par un micro de téléphone (graves coupés, réverbération, bruit). */
function pluck(s, cents, seed, o) {
  o = o || {};
  const y = new Float32Array(Math.ceil((o.dur || 3.2) * S.FS));
  S.addString(y, { t: 0.1, midi: T.OPEN[s], cents, amp: 0.15, seed, B: o.B });
  if (o.second) S.addString(y, { t: o.second.t, midi: T.OPEN[s], cents: o.second.cents, amp: 0.15, seed: seed + 99 });
  return S.room(y, { snr: o.snr != null ? o.snr : 30, seed, micHp: o.micHp || 200, reverb: 0.12 });
}
/** Comme l'app : une lecture toutes les 90 ms (trame de 8192), affichage stabilisé par tunerUpdate. */
function tunerRun(x, s, from, to) {
  const st = D.tunerState(), out = [];
  for (let t = from || 0.15; t < (to || (x.length / S.FS - 0.2)); t += 0.09) {
    const a = Math.round(t * S.FS); if (a + 8192 > x.length) break;
    out.push({ t, shown: D.tunerUpdate(st, D.tuneString(x.subarray(a, a + 8192), S.FS, T.OPEN[s]), t) });
  }
  return out;
}

test('accordeur guidé : 6 cordes désaccordées de −40 à +25 cents, cordes plus ou moins inharmoniques, micro de téléphone : affichage à ±3 cents, aucune erreur d’octave', () => {
  let n = 0, bad = 0, worst = 0, stableN = 0;
  for (let s = 0; s < 6; s++) for (const c of [-40, -12, 0, 7, 25]) for (const seed of [1, 2]) {
    // micro : 320 Hz → la fondamentale du Mi grave presque disparue ; inharmonicité forte (harmoniques trop hautes)
    const x = pluck(s, c, 10 * s + seed + (c + 40), { micHp: seed === 2 ? 320 : 200, B: seed === 2 ? 1.5e-4 : 6e-5 });
    for (const r of tunerRun(x, s)) {
      if (!r.shown || !r.shown.fresh || !r.shown.stable) continue;
      const e = Math.abs(r.shown.cents - c); n++; stableN++;
      if (e > 3) bad++;
      worst = Math.max(worst, e);
    }
  }
  ok(n > 600 && bad === 0 && worst < 3, n + ' lectures stables, ' + bad + ' à plus de 3 cents, pire ' + worst.toFixed(1) + ' c');
});

test('accordeur guidé : fin de note tenue (pas de dérive dans le bruit), nouvelle attaque prise en compte en moins de 0,5 s', () => {
  const x = pluck(1, -30, 5, { dur: 6, second: { t: 3.2, cents: 2 } });
  const run = tunerRun(x, 1);
  const late = run.filter(r => r.t > 2.0 && r.t < 3.1);
  ok(late.length && late.every(r => r.shown && !r.shown.fresh && near(r.shown.cents, -30, 3)), 'fin de la 1re note : ' + late.map(r => r.shown ? r.shown.cents.toFixed(1) + (r.shown.fresh ? '' : '·') : '—').join(' '));
  const after = run.find(r => r.t > 3.2 && r.shown && r.shown.fresh && r.shown.stable && near(r.shown.cents, 2, 3));
  ok(after && after.t - 3.2 < 0.5, 'nouvelle attaque (corde retendue) : ' + (after ? (after.t - 3.2).toFixed(2) + ' s' : 'jamais'));
});

test('guitare de l’app : chaque note juste à ±1 cent (mesurée par l’accordeur guidé)', () => {
  let worst = 0;
  for (const m of [40, 45, 50, 55, 59, 64]) for (const c of [0, 13, -9]) {
    const y = G.note(m + c / 100, { sr: 32000, vel: 0.8 });
    for (const t of [0.3, 0.9]) { const a = Math.round(t * 32000), r = D.tuneString(y.subarray(a, a + 8192), 32000, m); ok(r, 'note ' + m + ' non mesurée'); worst = Math.max(worst, Math.abs(r.cents - c)); }
  }
  ok(worst <= 1, 'erreur max ' + worst.toFixed(2) + ' c');
});

/* ================================================================== exercices */
function stateAt(level, week) {
  const s = St.newState(Date.parse('2026-01-05T18:00:00')); St.applyStart(s, level);
  s.songs.push(St.makeSong('[Couplet]\nG Em C D\n[Refrain]\nC D G Em', { title: 'Test', tempo: 92, strum: 'r4' })); s.workSong = s.songs[0].id;
  if (week) s.program.start = St.today(Date.now() - (week - 1) * 7 * DAY);
  return s;
}
test('chaque exercice : candidats, difficulté finie, étapes connues, libellé, jugement sans mesure (débutant et avancé)', () => {
  for (const [lvl, week] of [['debut', 1], ['avance', 12]]) {
    const s = stateAt(lvl, week), ctx = St.ctx(s, { block: P.block(week).n });
    for (const ex of C.EXERCISES) {
      if (['tune', 'guided'].includes(ex.kind)) { ok(ex.steps({ sec: 60 }, ctx).length, ex.id + ' : étapes'); continue; }
      const cands = ex.candidates(ctx, S.rng(3));
      if (!cands.length) { ok(['barre', 'barre-rythme', 'filage', 'chanson'].includes(ex.id) && lvl === 'debut', ex.id + ' (' + lvl + ') : aucun candidat'); continue; }
      for (const p of cands.slice(0, 40)) {
        const d = ex.difficulty(p, ctx);
        ok(isFinite(d), ex.id + ' : difficulté non finie ' + JSON.stringify(p));
        const steps = ex.steps(p, ctx);
        ok(steps.length && steps.every(st => C.STEP_TYPES.includes(st.t)), ex.id + ' : étapes ' + steps.map(st => st.t));
        ok(typeof ex.label(p, ctx) === 'string', ex.id + ' : libellé');
        for (const st of steps.filter(x => x.score)) ok(st.score.events.length > 0 && st.score.bars > 0, ex.id + ' : partition vide');
        for (const st of steps.filter(x => x.t === 'check')) ok(st.items.length >= 2 && st.items.every(k => C.CRIT[k]), ex.id + ' : critères');
        if (steps.some(x => x.t === 'along')) ok(ex.rec, ex.id + ' : prise jouée, enregistrable (rec)');
      }
      const j = ex.judge(null, cands[0], ctx);
      ok(j && j.y == null, ex.id + ' : sans mesure, pas de verdict inventé');
    }
  }
});

test('jugements : corde par corde, chrono, compte, critères, accord retrouvé — verdict, retour précis, records et poids', () => {
  const s = stateAt('chansons', 3), ctx = St.ctx(s, { block: 1 });
  // corde par corde : une corde étouffée → presque, avec le doigt à corriger
  const strings = [0, 1, 2, 3, 4, 5].filter(i => T.voicing('C').frets[i] >= 0).map(i => ({ s: i, status: i === 4 ? 'muted' : 'ok' }));
  const jp = C.EX.propre.judge({ strings: { strings } }, { v: 'C' }, ctx);
  ok(jp.y === 0.5 && jp.w === C.W.strings && jp.fb.some(f => /Si \(2\) est étouffée\. Doigt 1/.test(f.text)) && jp.chord.clean === false, 'corde par corde : ' + JSON.stringify(jp.fb));
  const jb = C.EX.propre.judge({ strings: { strings: strings.map(x => Object.assign({}, x, { status: x.s === 2 ? 'buzz' : 'ok' })) } }, { v: 'C' }, ctx);
  ok(jb.y === 0.5 && jb.fb.some(f => /Ré \(4\) frise\. Rapproche le doigt 2/.test(f.text)), 'frise : ' + JSON.stringify(jb.fb));
  // de mémoire, au chrono
  const jf = C.EX.forme.judge({ cues: [{ v: 'C', rt: 1.4, clean: true }, { v: 'G', rt: 2.9, clean: true }, { v: 'Am', rt: 1.1, clean: true }, { v: 'D', rt: 1.8, clean: false }] }, { chords: ['C', 'G', 'Am', 'D'], limit: 2.5 }, ctx);
  ok(jf.y === 0.5 && jf.w === C.W.timed && jf.forms.length === 3 && jf.fb.some(f => /G : propre, mais en 2,9 s/.test(f.text)) && jf.fb.some(f => /D : pas encore propre/.test(f.text)), 'chrono : ' + JSON.stringify(jf.fb));
  // une minute : le compte, l'objectif, le record
  St.pairUpdate(s, 'C', 'G', 30);
  const ctx2 = St.ctx(s, { block: 1 }), jm = C.EX.minute.judge({ count: { count: 19, sec: 30 } }, { a: 'C', b: 'G', sec: 30, target: 36 }, ctx2);
  ok(jm.y === 1 && near(jm.pair.cpm, 38, 0.01) && jm.w === C.W.count && jm.fb.some(f => /Nouveau record sur cette paire \(avant : 30\/min\)/.test(f.text)) && jm.observe, 'une minute : ' + JSON.stringify(jm.fb));
  // critères : 2 sur 3 → presque, conseil sur le critère manquant
  const chk = { items: ['heure', 'trou', 'propre'], chosen: ['heure', 'propre'], y: C.checkY(3, 2), listened: true };
  const jc = C.EX.bascule.judge({ check: chk }, { seq: ['C', 'G'], bpc: 4, tempo: 80, strum: 'r1' }, ctx);
  ok(jc.y === 0.5 && jc.w === C.W.self && jc.fb.some(f => f.text === C.CRIT.trou[1]) && jc.fb.some(f => /réécouté/.test(f.text)) && !jc.rhythmPair, 'critères : ' + JSON.stringify(jc.fb));
  ok(C.checkY(3, 3) === 1 && C.checkY(3, 1) === 0 && C.checkY(2, 1) === 0.5 && C.checkY(4, 3) === 0.5, 'barème des critères');
  // rythmique : motif tapé réussi + guitare « presque » → deux parties, chacune avec son poids
  const sc = C.rhythmScore({ strum: 'r3', seq: ['Em'], bpc: 4, tempo: 84, bars: 4 }), ex = K.expected(sc, 2);
  const tp = K.analyze(S.tapper(ex.events, { offset: 0.05, sd: 0.01, seed: 1 }), ex.events, { slot: ex.slot, beat: ex.beat });
  const jr = C.EX.rythme.judge({ taps: tp, check: { items: C.strumChecks('r3'), chosen: ['bras', 'clic'], y: 0.5 } }, { p: 'r3', tempo: 84, seq: ['Em'], tol: 45 }, ctx);
  ok(jr.parts.length === 2 && jr.parts[0].y === 1 && jr.parts[0].w === C.W.taps && jr.parts[1].y === 0.5 && jr.parts[1].w === C.W.guitar && jr.y === 1 && jr.pattern, 'rythmique : ' + JSON.stringify(jr.parts) + ' → ' + jr.y);
  ok(C.strumChecks('r2').join() === 'bras,clic' && C.strumChecks('r7').join() === 'bras,silences,frappe,clic', 'critères selon le motif');
  // accord retrouvé à l'oreille : réponses justes ou fausses
  const jl = C.EX.releve.judge({ choices: [{ ok: true, answer: 'G', got: 'G' }, { ok: false, answer: 'Em', got: 'C' }, { ok: true, answer: 'C', got: 'C' }] }, { key: 7, set: ['G', 'C', 'Em'] }, ctx);
  ok(jl.y === 0.5 && jl.w === C.W.quiz && jl.fb.some(f => /C’était Em \(vi\), pas C/.test(f.text)), 'accord retrouvé : ' + JSON.stringify(jl.fb));
});

test('poids : une auto-évaluation compte moitié moins qu’une mesure ; les deux parties d’une rythmique comptent', () => {
  const mk = () => { const s = St.newState(); St.applyStart(s, 'debut'); return s; };
  const a = mk(), b = mk(), th0 = a.skills.changements.th;
  St.recordTake(a, { ex: 'minute', params: {}, d: th0, judged: { y: 1, success: true, w: 1 } });
  St.recordTake(b, { ex: 'bascule', params: {}, d: th0, judged: { y: 1, success: true, w: C.W.self } });
  const ga = a.skills.changements.th - th0, gb = b.skills.changements.th - th0;
  ok(ga > 0 && near(gb / ga, 0.5, 0.05), 'gains : mesure ' + ga.toFixed(3) + ', auto-évaluation ' + gb.toFixed(3));
  const c = mk(), d = mk(), r0 = c.skills.rythmiques.th;
  St.recordTake(c, { ex: 'rythme', params: { p: 'r1', tempo: 80 }, d: r0, judged: { y: 1, success: true, parts: [{ y: 1, w: 1 }] } });
  St.recordTake(d, { ex: 'rythme', params: { p: 'r1', tempo: 80 }, d: r0, judged: { y: 1, success: true, parts: [{ y: 1, w: 1 }, { y: 1, w: 0.4 }] } });
  ok(d.skills.rythmiques.th > c.skills.rythmiques.th && d.items.rythme.n === 1, 'deux parties : ' + c.skills.rythmiques.th.toFixed(3) + ' → ' + d.skills.rythmiques.th.toFixed(3));
  // le délai du téléphone mesuré sur les tapes est retenu (moyenne glissante)
  St.recordTake(c, { ex: 'pulse', params: {}, d: 2, judged: { y: 1, success: true, tapOffset: 0.1 } });
  St.recordTake(c, { ex: 'pulse', params: {}, d: 2, judged: { y: 1, success: true, tapOffset: 0.2 } });
  ok(near(c.profile.tapOffset, 0.13, 1e-9), 'délai retenu : ' + c.profile.tapOffset);
});

test('difficulté choisie au plus près de la cible (point de défi : ~80 % de réussite)', () => {
  const s = stateAt('chansons', 6), ctx = St.ctx(s, { block: 2 });
  for (const id of ['propre', 'forme', 'minute', 'bascule', 'pulse', 'rythme', 'picking', 'discri', 'degres']) {
    const ex = C.EX[id], th = s.skills[ex.comp].th, target = M.dFor(th, M.TARGET_P);
    const ch = C.choose(ex, target, ctx, S.rng(5));
    ok(ch && Math.abs(ch.d - target) <= 0.8, id + ' : cible ' + target.toFixed(2) + ', choisi ' + (ch && ch.d.toFixed(2)));
  }
});

test('oreille fine (ZEST) : seuil estimé à ±45 % pour des auditeurs simulés (6, 15, 40 cents)', () => {
  for (const truth of [6, 15, 40]) {
    const ests = [];
    for (let seed = 1; seed <= 12; seed++) {
      const r = S.rng(seed * 31 + truth), z = C.zest.init(35, 2.2);
      for (let i = 0; i < 20; i++) { const c = C.zest.next(z), p = 0.5 + 0.47 * (1 - Math.exp(-Math.pow(c / (truth / 0.8714), 2.2))); C.zest.update(z, c, r() < p); }
      ests.push(C.zest.estimate(z).threshold);
    }
    const med = K.median(ests);
    ok(med / truth < 1.45 && truth / med < 1.45, 'seuil vrai ' + truth + ' c, estimé ' + med.toFixed(1) + ' c');
  }
});

/* ================================================================== cartes (FSRS) */
test('FSRS : intervalles croissants si réussi, rechute si raté, rappel à 90 % au jour prévu', () => {
  let c = null, day = '2026-01-01'; const ivs = [];
  for (let k = 0; k < 6; k++) { c = R.review(c, 3, day); const iv = St.dayDiff(day, c.due); ivs.push(iv); day = c.due; }
  ok(ivs.every((v, i) => i === 0 || v >= ivs[i - 1]) && ivs[5] >= 30, 'intervalles : ' + ivs.join(', '));
  const before = c.s, lapse = R.review(c, 1, day);
  ok(lapse.s < before && St.dayDiff(day, lapse.due) <= 2, 'après un oubli : stabilité ' + before.toFixed(1) + ' → ' + lapse.s.toFixed(1) + ', revue dans ' + St.dayDiff(day, lapse.due) + ' j');
  ok(near(R.retrievability(c.s, c.s), 0.9, 1e-9), 'R(S) = 90 %');
  ok(R.grade(true, 1.5) === 4 && R.grade(true, 5) === 3 && R.grade(true, 12) === 2 && R.grade(false, 3) === 1, 'notes 1–4 selon la réponse et le temps');
});

test('cartes : questions valides (bonne réponse parmi 4 options distinctes, explication), révision du jour limitée', () => {
  const av = R.available(16, C.VOCAB_ORDER.slice(0, 40));
  ok(av.length >= 150, av.length + ' cartes seulement');
  for (const id of av) {
    const cd = R.card(id);
    ok(cd && cd.q && cd.opts.length >= 2 && new Set(cd.opts).size === cd.opts.length && cd.ans >= 0 && cd.ans < cd.opts.length && cd.explain, id + ' : carte invalide ' + JSON.stringify(cd));
  }
  const due = R.dueList({}, av, '2026-03-01', { max: 12, maxNew: 5 });
  ok(due.length === 5, 'nouvelles cartes du jour : ' + due.length);
  ok(R.available(1, ['Em', 'Asus2']).length < R.available(8, ['Em', 'Asus2', 'G', 'C', 'D']).length, 'les familles se débloquent au fil des semaines');
});

/* ================================================================== état, chansons, sauvegarde */
test('« prête à jouer » : accord inconnu d’abord, puis le changement le plus lent ; le score monte avec les records', () => {
  const s = St.newState(); St.applyStart(s, 'zero');
  St.introduce(s, 'Em'); St.introduce(s, 'G'); St.introduce(s, 'C');
  const song = St.makeSong('G Em C D\nG Em C D', { tempo: 90, strum: 'r3', bpc: 4 }); s.songs.push(song);
  const r0 = St.readiness(s, song);
  ok(r0.bottleneck.kind === 'chord' && r0.bottleneck.id === 'D', 'goulot : ' + JSON.stringify(r0.bottleneck));
  St.introduce(s, 'D');
  const r1 = St.readiness(s, song);
  ok(r1.bottleneck.kind === 'pair' && /pas encore mesuré/.test(r1.bottleneck.text), 'goulot : ' + r1.bottleneck.text);
  St.pairUpdate(s, 'G', 'Em', 40); St.pairUpdate(s, 'Em', 'C', 40); St.pairUpdate(s, 'C', 'D', 18); St.pairUpdate(s, 'D', 'G', 40);
  const r2 = St.readiness(s, song);
  ok(r2.score > r1.score && r2.bottleneck.kind === 'pair' && [r2.bottleneck.a, r2.bottleneck.b].sort().join() === 'C,D', 'goulot : ' + r2.bottleneck.text);
  St.patternUpdate(s, 'patterns', 'r3', 95); St.patternUpdate(s, 'chant', 'r3', 92); St.pairUpdate(s, 'C', 'D', 40);
  const r3 = St.readiness(s, song);
  ok(r3.bottleneck && r3.bottleneck.kind === 'section', 'il reste à jouer la chanson en entier : ' + JSON.stringify(r3.bottleneck));
  St.recordTake(s, { ex: 'chanson', params: {}, d: 3, judged: { y: 1, success: true, song: { id: song.id, sec: 0, ratio: 1, mode: 'r3', ok: true } } });
  const r4 = St.readiness(s, song);
  ok(!r4.bottleneck && r4.score > 0.85 && r4.score < 0.95, 'accords pas encore vérifiés corde par corde : ' + r4.score);
  ['G', 'Em', 'C', 'D'].forEach(id => St.chordUpdate(s, id, { clean: true }));
  const r5 = St.readiness(s, song);
  ok(r5.score > 0.97 && !r5.bottleneck, 'tout en place : ' + r5.score + ' ' + JSON.stringify(r5.bottleneck));
});

test('chanson : accords écrits sous « Capo N » = formes ; capo conseillé, transposition, sections en mesures', () => {
  const syms = info => info.uniq.map(id => T.voicing(id).sym).join(' ');
  // grille de site de tablatures : « Capo 3 » puis les formes Do Sol Lam Fa → la chanson sonne en Mi♭
  const song = St.makeSong('Capo 3\n[Couplet]\n| C | G | Am | F |', { tempo: 100, strum: 'r4' });
  const info = St.songInfo(song);
  ok(info.ok && info.capo === 3 && syms(info) === 'C G Am F' && info.realChords.join(' ') === 'Eb Bb Cm Ab', 'capo ' + info.capo + ' : ' + syms(info) + ' (son réel ' + info.realChords.join(' ') + ')');
  // sans capo indiqué : la chanson en Mi♭ se joue au mieux capo 3
  const raw = St.songInfo(St.makeSong('| Eb | Bb | Cm | Ab |', {}));
  ok(raw.capo === 3 && syms(raw) === 'C G Am F', 'Mi♭ sans capo indiqué : capo ' + raw.capo + ' ' + syms(raw));
  song.capo = null; song.transpose = 2;                     // un ton plus haut : Fa Do Rém Si♭
  const info2 = St.songInfo(song);
  ok(info2.realChords.join(' ') === 'F C Dm Bb' && info2.capo === 5 && syms(info2) === 'C G Am F', 'transposé : ' + info2.realChords.join(' ') + ' capo ' + info2.capo + ' ' + syms(info2));
  ok(info.sections[0].bars.length === 4 && info.sections[0].bars.every(b => b.length === 1), 'mesures : ' + JSON.stringify(info.sections[0].bars));
  // la séance « Ma chanson » joue le modèle avec le capo, et tu joues la section avec le clic, capo compris
  const s = St.newState(); St.applyStart(s, 'chansons'); s.songs.push(song); s.workSong = song.id; song.capo = 3; song.transpose = 0;
  const ctx = St.ctx(s, null), p = C.EX.chanson.candidates(ctx)[0], st = C.EX.chanson.steps(p, ctx);
  ok(st.find(x => x.t === 'along').score.capo === 3 && st.find(x => x.t === 'listen').play.capo === 3 && /Capo en case 3/.test(st[0].sub) && st.find(x => x.t === 'along').save, 'capo dans la séance');
});

test('sauvegarde : export/import identique, migration d’un état ancien, version 1 → 2 (records du micro remis à zéro, niveaux gardés), données de l’app Corde lues', () => {
  const s = stateAt('chansons', 3);
  St.pairUpdate(s, 'C', 'G', 33);
  const back = St.importJSON(St.exportJSON(s));
  ok(JSON.stringify(back) === JSON.stringify(s), 'export/import');
  let threw = false; try { St.importJSON('{"foo":1}'); } catch (e) { threw = /ACCORD/.test(e.message); }
  ok(threw, 'un fichier étranger est refusé');
  const old = { created: 1, profile: { name: 'Ana' }, skills: {}, vocab: ['Em'] };
  const m = St.migrate(old);
  ok(m.profile.name === 'Ana' && m.profile.sessionMin === 20 && M.COMPS.every(c => m.skills[c.id]) && Array.isArray(m.sessions), 'migration');
  // version 1 : records venus du micro (pas fiables) remis à zéro ; vocabulaire, oreille, cartes et chansons gardés
  const v1 = { v: 1, created: 1, profile: { name: 'Léa', click: 'aigu', mic: true }, skills: { accords: { th: 4.2, sd: 0.6, n: 30, last: 0, hist: [] }, oreille: { th: 5, sd: 0.5, n: 12, last: 0, hist: [] } }, vocab: ['Em', 'G', 'C'], chords: { Em: { intro: '2026-01-01', n: 5, clean: 1, form: 1.2 }, G: { intro: '2026-01-02', n: 2, clean: 0.6, form: 2.1, declared: true } }, pairs: { 'Em|G': { n: 3, best: 41, ema: 38, hist: [] } }, patterns: { r3: { n: 2, best: 96 } }, chant: { r3: { n: 1, best: 80 } }, cards: { c1: { s: 3 } }, sessions: [{ id: 'x', date: '2026-01-02', takes: [] }], series: { timingSd: [['2026-01-02', 20]], cpm: [['2026-01-02', 41]], jnd: [['2026-01-02', 12]] }, songs: [{ id: 'a', title: 'T', text: 'G C', progress: { 0: 0.8 } }], ideas: [{ id: 'i1' }] };
  const m2 = St.migrate(JSON.parse(JSON.stringify(v1)));
  ok(m2.v === 2 && !Object.keys(m2.pairs).length && !Object.keys(m2.patterns).length && !Object.keys(m2.chant).length, 'records du micro remis à zéro');
  ok(m2.chords.Em.clean == null && m2.chords.Em.form == null && m2.chords.Em.intro === '2026-01-01' && m2.chords.G.declared, 'accords : intro gardée, mesures effacées');
  ok(m2.vocab.join() === 'Em,G,C' && m2.cards.c1 && m2.songs[0].text === 'G C' && !Object.keys(m2.songs[0].progress).length && m2.ideas.length === 1 && m2.sessions.length === 1, 'vocabulaire, cartes, chansons, idées, séances gardés');
  ok(m2.skills.accords.th === 4.2 && m2.skills.accords.sd >= 1.5 && m2.skills.oreille.sd === 0.5, 'niveaux gardés, incertains pour ce qui venait du micro');
  ok(!m2.series.timingSd && !m2.series.cpm && m2.series.jnd.length === 1 && m2.profile.click === 'bois' && m2.notice === 'v2', 'séries, clic, message');
  ok(St.migrate(JSON.parse(JSON.stringify(m2))).pairs && St.migrate(m2).notice === 'v2', 'migration idempotente');
  const store = { 'corde.done': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'corde.log': [{ day: 10, date: '2026-01-10', ok: 3, ko: 1 }], 'corde.records': { a: 1 } };
  const cd = St.readCorde(k => store[k] || null);
  ok(cd && cd.days === 10 && cd.suggest === 'chansons', 'Corde : ' + JSON.stringify(cd));
  ok(St.readCorde(() => null) === null, 'sans données Corde');
});

test('séance interrompue puis reprise : enregistrée une seule fois, minutes actives seulement', () => {
  const s = stateAt('debut', 1), ts = Date.now();
  const plan = P.plan(s, { date: St.today(ts), checkin: { form: 3, tips: 'ok', pain: 'non' }, rand: S.rng(2) });
  const sess = St.startSession(s, plan, ts);
  sess.takes.push({ ex: 'rythme', d: 2, judged: { y: 1, success: true, metrics: {} } });
  sess.activeMs = 6 * 60000;
  St.finishSession(s, sess, ts + 30 * 60000, true);
  ok(s.sessions.length === 1 && s.sessions[0].partial && s.sessions[0].minutes === 6, 'partielle : ' + JSON.stringify(s.sessions.map(x => [x.partial, x.minutes])));
  sess.takes.push({ ex: 'minute', d: 2, judged: { y: 0.5, success: false, metrics: {} } });
  sess.activeMs = 14 * 60000;
  St.finishSession(s, sess, ts + 60 * 60000, false);
  ok(s.sessions.length === 1 && !s.sessions[0].partial && s.sessions[0].takes.length === 2 && s.sessions[0].minutes === 14, 'reprise : ' + JSON.stringify(s.sessions.map(x => [x.partial, x.takes.length, x.minutes])));
});

/* ================================================================== programme */
test('plan du jour : un accord nouveau au plus, pas de barré si gêne, repos si douleur, jour J, bilan d’entrée', () => {
  const s = stateAt('debut', 1), d0 = St.today();
  const p0 = P.plan(s, { date: d0, checkin: { form: 3, tips: 'ok', pain: 'non' }, rand: S.rng(1) });
  ok(p0.type === 'B' && p0.bilan === 'entree', 'premier jour : ' + p0.type + ' ' + p0.bilan);
  const z = stateAt('zero', 1), pz = P.plan(z, { date: d0, checkin: { form: 3, tips: 'ok', pain: 'non' }, rand: S.rng(1) });
  ok(pz.type !== 'B' && pz.newChord && pz.items.some(it => it.newChord), 'jamais joué : pas de bilan, un premier accord (' + pz.type + ', ' + pz.newChord + ')');
  s.bilans.push({ date: d0, week: 0, cycle: 1, kind: 'entree', before: {}, after: {}, measured: [], overall: 2 });
  for (let k = 0; k < 6; k++) {
    const p = P.plan(s, { date: d0, checkin: { form: 3, tips: 'ok', pain: 'non' }, rand: S.rng(10 + k) });
    ok(p.items.filter(it => it.newChord).length <= 1, 'au plus un accord nouveau');
    ok(Math.abs(p.minutes - 20) <= 6, 'durée ' + p.minutes);
  }
  const g = P.plan(s, { date: d0, checkin: { form: 3, tips: 'ok', pain: 'gene' }, rand: S.rng(3) });
  ok(g.noBarre && !g.items.some(it => ['barre', 'barre-rythme'].includes(it.ex)) && g.minutes < 16, 'gêne : ' + g.items.map(it => it.ex).join(','));
  const bil = p0.items.map(it => it.ex);
  ok(['forme', 'minute', 'pulse', 'rythme', 'discri', 'degres'].every(id => bil.includes(id)) && !bil.includes('chanter') && p0.items.find(it => it.ex === 'rythme').ladder.every(l => l.tapOnly), 'bilan : mesures fiables seulement (' + bil.join(',') + ')');
  const pain = P.plan(s, { date: d0, checkin: { form: 3, tips: 'ok', pain: 'douleur' } });
  ok(pain.type === 'R' && pain.items.every(it => C.EX[it.ex].kind === 'quiz'), 'douleur : ' + pain.items.map(it => it.ex).join(','));
  s.deadline = { date: d0, label: 'Anniversaire', song: s.workSong };
  const jj = P.plan(s, { date: d0, checkin: { form: 3, tips: 'ok', pain: 'non' } });
  ok(jj.type === 'jourJ' && jj.minutes <= 10, 'jour J : ' + jj.type + ' ' + jj.minutes + ' min');
});

test('programme de 16 semaines sur un élève simulé : difficulté à ~70–80 % de réussite, niveaux suivis, bilans, chanson prête', () => {
  let seed = 7; const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
  const day0 = Date.parse('2026-01-05T18:00:00'), s = St.newState(day0); s.onboarded = true;
  St.applyStart(s, 'debut');
  s.songs.push(St.makeSong('[Couplet]\nG Em C D\nG Em C D\n[Refrain]\nC D G Em\nC D G', { title: 'Test', tempo: 92, strum: 'r4' })); s.workSong = s.songs[0].id;
  const truth = {}; M.COMPS.forEach(c => { truth[c.id] = 1 + 2 * rnd(); });
  let succ = 0, graded = 0; const bilans = [], exCount = {}, types = {}; let maxNew = 0, sessions = 0, readiness0 = null;
  for (let day = 0; day < 140; day++) {
    if (rnd() > 5 / 7) continue;
    M.COMPS.forEach(c => { truth[c.id] = Math.min(9, truth[c.id] + 0.025); });
    const ts = day0 + day * DAY, date = St.today(ts);
    const plan = P.plan(s, { date, checkin: { form: 3, tips: day < 14 && rnd() < 0.3 ? 'sensibles' : 'ok', pain: 'non' }, rand: rnd });
    types[plan.type] = (types[plan.type] || 0) + 1; sessions++;
    maxNew = Math.max(maxNew, plan.items.filter(it => it.newChord).length);
    const sess = St.startSession(s, plan, ts);
    for (const item of plan.items) {
      if (item.sec && !item.takes) continue;
      const ids = item.mix || [item.ex], n = item.fixed ? item.fixed.length : item.ladder ? item.ladder.length : item.takes;
      for (let k = 0; k < n; k++) {
        const ex = C.EX[ids[k % ids.length]];
        const ctx = St.ctx(s, plan, { takeIndex: k });
        let params, d;
        if (item.fixed) { params = item.fixed[k]; d = ex.difficulty(params, ctx); }
        else if (item.ladder) { params = item.ladder[k]; d = ex.difficulty(params, ctx); }
        else { const it = s.items[ex.id], p = !it || it.n < 2 ? Math.max(plan.targetP, 0.86) : plan.targetP; const ch = C.choose(ex, M.dFor(s.skills[ex.comp].th, p), ctx, rnd); ok(ch, 'aucun candidat pour ' + ex.id + ' (jour ' + day + ')'); params = ch.params; d = ch.d; }
        ok(isFinite(d) && ex.steps(params, ctx).length, ex.id + ' : paramètres invalides ' + JSON.stringify(params));
        exCount[ex.id] = (exCount[ex.id] || 0) + 1;
        // l'élève simulé réussit selon son vrai niveau ; ses auto-évaluations sont parfois trop indulgentes
        const pt = M.pSuccess(truth[ex.comp], d), draw = () => { const u = rnd(); return u < pt ? 1 : u < pt + (1 - pt) / 2 ? 0.5 : 0; };
        const optimist = v => (rnd() < 0.25 ? Math.min(1, v + 0.5) : v);
        let y = draw();
        if (ex.measure === 'self' || ex.measure === 'strings') y = optimist(y);
        const judged = ex.kind === 'play' || (ex.kind === 'quiz' && ex.id !== 'cartes' && ex.id !== 'discri') ? { y, success: y === 1, w: C.W[ex.measure] || 1, metrics: {} } : { y: null, success: null };
        if (ex.id === 'rythme') { judged.parts = [{ y, w: C.W.taps }].concat(params.tapOnly ? [] : [{ y: optimist(draw()), w: C.W.guitar }]); judged.y = C.combine(judged.parts); judged.success = judged.y === 1; }
        if (ex.id === 'minute' && judged.y != null) judged.pair = { a: params.a, b: params.b, cpm: C.cpmAt(T.transitionCost(params.a, params.b), truth.changements) * (0.85 + 0.3 * rnd()) };
        if ((ex.id === 'propre' || ex.id === 'barre') && judged.y != null) judged.chord = { id: params.v, clean: y === 1 };
        if (ex.id === 'rythme' && judged.y === 1) judged.pattern = { id: params.p, tempo: params.tempo };
        if (ex.id === 'chanter' && y === 1) judged.chant = { p: params.p, tempo: params.tempo };
        if (ex.id === 'chanson' && judged.y != null) judged.song = { id: params.song, sec: params.sec, ratio: params.ratio, mode: params.mode, ok: y === 1 };
        if (judged.y != null) { graded++; if (judged.success) succ++; }
        if (ex.kind === 'compose') { St.recordTake(s, { ex: ex.id, params, d, judged: { y: null, success: null }, self: y, ts }, ts); continue; }
        St.recordTake(s, { ex: ex.id, params, d, judged, ts }, ts);
        sess.takes.push({ ex: ex.id, params, d, judged });
        if (ex.id === 'cartes') R.dueList(s.cards, St.cardsAvailable(s), date, { max: 12 }).forEach(id => St.reviewCard(s, id, rnd() < M.pSuccess(truth.harmonie, R.card(id).b), 4, ts));
      }
    }
    St.finishSession(s, sess, ts + 20 * 60000, false);
    if (plan.type === 'B') { const rec = P.concludeBilan(s, sess, plan.bilan, ts); bilans.push(rec.week); if (plan.bilan === 'entree') s.program.start = date; }
    if (readiness0 == null && day >= 21) readiness0 = St.readiness(s, s.songs[0]).score;
  }
  const rate = succ / graded;
  const err = D.mean(M.COMPS.filter(c => s.skills[c.id].n > 10).map(c => Math.abs(s.skills[c.id].th - truth[c.id])));
  const main = ['propre', 'forme', 'minute', 'bascule', 'pulse', 'rythme', 'picking', 'discri', 'qualite', 'degres', 'releve', 'cartes', 'chanter', 'chanson', 'compo'];
  const unused = main.filter(id => !exCount[id]);
  const rd = St.readiness(s, s.songs[0]);
  console.log('    ' + sessions + ' séances, réussite ' + (100 * rate).toFixed(0) + ' %, erreur d’estimation ' + err.toFixed(2) + ', bilans ' + bilans.join(','), ', vocabulaire ' + s.vocab.length + ', types ' + JSON.stringify(types) + ', prête ' + readiness0.toFixed(2) + ' → ' + rd.score.toFixed(2));
  ok(rate >= 0.62 && rate <= 0.85, 'réussite ' + rate.toFixed(2));
  ok(err <= 1.0, 'les niveaux estimés suivent les vrais (erreur moyenne ' + err.toFixed(2) + ')');
  ok(bilans.join(',') === '0,4,8,12,16', 'bilans aux semaines ' + bilans.join(','));
  ok(!unused.length, 'exercices jamais proposés : ' + unused.join(', '));
  ok(maxNew <= 1 && s.vocab.length >= 15, 'accords nouveaux par séance ≤ 1 (' + maxNew + '), vocabulaire ' + s.vocab.length);
  ok(rd.score > readiness0 + 0.2, 'la chanson se rapproche : ' + readiness0.toFixed(2) + ' → ' + rd.score.toFixed(2));
});

console.log('\n' + (count - fails) + '/' + count + ' tests réussis');
process.exit(fails ? 1 : 0);
