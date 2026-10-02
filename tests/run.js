'use strict';
/*
 * Tests automatiques d'ACCORD (sans navigateur, sans dépendance) : node tests/run.js
 * Ils vérifient la théorie (accords, grilles collées, tonalité, capo), le moteur d'analyse sur des guitares de
 * synthèse réalistes (attaques, latence, rythmiques, frappes, pulsation, accords, diagnostic, changements,
 * corde par corde, accordeurs, temps de réaction, voix), la guitare de synthèse de l'app, les exercices,
 * les cartes (FSRS), l'état (prête à jouer, sauvegarde) et le programme de 16 semaines sur un élève simulé.
 */
const { loadAccord } = require('./load.js');
const S = require('./synth.js');
const AC = loadAccord();
const T = AC.theory, D = AC.dsp, G = AC.gsynth, M = AC.model, R = AC.srs, C = AC.catalog, St = AC.state, P = AC.planner;
const FS = 22050;                      // fréquence d'analyse de l'app

let fails = 0, count = 0;
function test(name, fn) {
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

/* ================================================================== analyse : prises rythmées */
/**
 * Prise rythmée telle que le micro l'enregistre : décompte et clics entendus après la latence aller-retour `lat`,
 * joueur calé sur ce qu'il entend. o : {lat, sd, bias, seed, frets(e), skip(e,i), extra:[temps], late(e,i),
 * voice:[[temps0, temps1, midi]], snr, amp, clickAmp}
 */
function rhythmTake(sc, o) {
  o = o || {};
  const beat = 60 / sc.tempo, lat = o.lat != null ? o.lat : 0.11, t0 = 0.5, start = t0 + sc.countIn * beat;
  const clicks = [];
  for (let i = 0; i < sc.countIn; i++) clicks.push(t0 + i * beat);
  for (let b = 0; b < sc.bars; b++) if (sc.clickBars[b]) for (let i = 0; i < sc.sig; i++) clicks.push(start + (b * sc.sig + i) * beat);
  const y = new Float32Array(Math.ceil((start + sc.bars * sc.sig * beat + 1.6) * S.FS));
  clicks.forEach((c, i) => S.addClick(y, c + lat, o.clickAmp || 0.08, 50 + i));
  if (sc.pick) {
    // arpèges : chaque note pincée seule, tenue jusqu'à la note suivante sur la même corde
    sc.events.forEach((e, i) => {
      if (o.skip && o.skip(e, i)) return;
      const v = T.voicing(e.v), toks = e.tok.length > 1 && e.tok !== '.' ? [e.tok[0], e.tok[1]] : [e.tok];
      toks.forEach((tk, k) => { const s = T.pickString(tk, v); if (s == null) return; S.addString(y, { t: start + lat + e.beat * beat + (o.sd || 0.008) * S.gauss(S.rng(i * 7 + k + 1)), midi: T.OPEN[s] + Math.max(0, v.frets[s]), amp: 0.13, seed: 200 + i * 3 + k }); });
    });
  } else {
    const evs = [];
    sc.events.forEach((e, i) => {
      if (o.skip && o.skip(e, i)) return;
      evs.push({ beat: sc.countIn + e.beat, k: e.k, frets: o.frets ? o.frets(e, i) : T.voicing(e.v).frets, late: o.late ? o.late(e, i) : 0, acc: e.acc });
    });
    (o.extra || []).forEach(b => evs.push({ beat: sc.countIn + b, k: 'D', frets: T.voicing(sc.seq[0]).frets }));
    evs.sort((a, b) => a.beat - b.beat);
    S.playGrid(y, evs, sc.tempo, t0 + lat, { sd: o.sd != null ? o.sd : 0.010, bias: o.bias || 0, seed: o.seed || 1, amp: o.amp || 0.16 });
  }
  if (o.voice) S.addVoice(y, o.voice.map(n => ({ t0: start + lat + n[0] * beat, t1: start + lat + n[1] * beat, midi: n[2] })), o.voiceAmp || 0.12, 4);
  const pcm = S.room(y, { snr: o.snr != null ? o.snr : 32, seed: o.seed || 1, reverb: 0.1 });
  return { pcm, spec: C.rhythmSpec(sc, start, clicks, 0.1), sc, lat };
}
const ctx0 = St.ctx(St.newState(), null);
function judgeRhythm(exId, params, take) {
  const res = D.analyzeRhythm(take.pcm, S.FS, take.spec);
  return { res, j: C.EX[exId].judge(res, params, ctx0, { score: take.sc }) };
}
const scoreOf = (exId, params) => C.EX[exId].steps(params, ctx0).find(s => s.t === 'play').score;

test('attaques : rappel ≥ 98 %, précision ≥ 96 %, erreur médiane ≤ 3 ms (36 prises, 12 rythmiques, 60–130 BPM)', () => {
  let tp = 0, fn = 0, fp = 0; const errs = [];
  const pats = ['r1', 'r2', 'r3', 'r4', 'r6', 'r7', 'r8', 'r9', 'r11', 'r12', 'r13', 'r14'];
  for (let seed = 1; seed <= 36; seed++) {
    const r = S.rng(seed * 977 + 1), pid = pats[seed % pats.length], pat = T.strum(pid);
    const tempo = Math.round(62 + r() * 66 / (pat.sub === 4 ? 1.6 : 1)), beat = 60 / tempo, lat = 0.08 + 0.12 * r();
    const ch = ['G', 'C', 'D', 'Em', 'Am', 'A', 'E', 'F', 'Cadd9', 'G-pop'][seed % 10];
    const y = new Float32Array(Math.ceil((0.4 + (4 + 2 * pat.sig) * beat + 1.4) * S.FS));
    for (let i = 0; i < 4 + 2 * pat.sig; i++) S.addClick(y, 0.4 + i * beat + lat, 0.05 + 0.05 * r(), seed * 50 + i);
    const evs = []; for (let b = 0; b < 2; b++) for (const e of T.strumEvents(pat)) evs.push({ beat: 4 + b * pat.sig + e.beat, k: e.k, frets: T.voicing(ch).frets });
    const times = S.playGrid(y, evs, tempo, 0.4 + lat, { sd: 0.012, seed, amp: 0.12 + 0.12 * r() });
    const x = D.prepare(S.room(y, { snr: 30 + 15 * r(), seed, reverb: 0.08 + 0.1 * r() }), S.FS).x;
    const ons = D.onsets(x, {}).list.map(o => o.t), used = new Set();
    times.forEach(t => {
      let bj = -1, bd = 1; ons.forEach((on, j) => { if (!used.has(j) && Math.abs(on - t) < 0.06 && Math.abs(on - t) < Math.abs(bd)) { bd = on - t; bj = j; } });
      if (bj >= 0) { used.add(bj); tp++; errs.push(1000 * bd); } else fn++;
    });
    ons.forEach((on, j) => { if (!used.has(j) && on > times[0] - 0.1 && on < times[times.length - 1] + 0.3) fp++; });
  }
  const rec = tp / (tp + fn), prec = tp / (tp + fp), med = D.median(errs.map(Math.abs)), bias = D.median(errs);
  ok(rec >= 0.98 && prec >= 0.96 && med <= 3 && Math.abs(bias) <= 2, 'rappel ' + rec.toFixed(3) + ', précision ' + prec.toFixed(3) + ', |erreur| médiane ' + med.toFixed(1) + ' ms, biais ' + bias.toFixed(1) + ' ms');
});

test('instants exacts sur une longue prise : pas de dérive entre le début et la fin (25 s)', () => {
  // un joueur parfait pendant 24 mesures à 60 BPM : l'erreur mesurée ne doit pas grandir avec le temps
  const sc = C.rhythmScore({ seq: ['Em'], tempo: 60, bars: 6, sub: 1 });
  const tk = rhythmTake(sc, { sd: 0.0001, seed: 3 });
  const res = D.analyzeRhythm(tk.pcm, S.FS, tk.spec);
  const hits = res.events.filter(e => e.hit), first = D.median(hits.slice(0, 6).map(e => e.err)), last = D.median(hits.slice(-6).map(e => e.err));
  ok(hits.length >= 23 && Math.abs(last - first) <= 3, 'début ' + first.toFixed(1) + ' ms, fin ' + last.toFixed(1) + ' ms (' + hits.length + ' coups)');
});

test('latence aller-retour mesurée sur les clics enregistrés à ±3 ms (60–300 ms)', () => {
  for (const lat of [0.06, 0.11, 0.18, 0.3]) {
    const sc = C.rhythmScore({ seq: ['G'], tempo: 90, bars: 2, sub: 1 });
    const tk = rhythmTake(sc, { lat, seed: Math.round(lat * 100) });
    const res = D.analyzeRhythm(tk.pcm, S.FS, tk.spec);
    ok(res.latencySrc === 'mesurée' && near(res.latency, lat, 0.003), 'latence ' + lat + ' : mesurée ' + res.latency.toFixed(4) + ' (' + res.latencySrc + ')');
  }
});

test('rythmiques bien jouées : réussies, sans coup en trop ni coup manqué (5 motifs, 2 joueurs)', () => {
  for (const [p, tempo, seq] of [['r1', 76, ['Em']], ['r3', 92, ['G']], ['r4', 96, ['C', 'G']], ['r6', 72, ['Am']], ['r2', 110, ['D']]]) {
    for (const seed of [1, 2]) {
      const params = { p, tempo, seq, tol: 45 }, tk = rhythmTake(scoreOf('rythme', params), { seed, sd: 0.012 });
      const { res, j } = judgeRhythm('rythme', params, tk);
      ok(j.y === 1 && res.extras.length <= 1 && res.hitRate >= 0.95, p + ' ' + tempo + ' seed ' + seed + ' : y ' + j.y + ', coups ' + res.hitRate.toFixed(2) + ', en trop ' + res.extras.length + ', écart ' + res.mae.toFixed(1) + ' ms — ' + j.fb.map(f => f.text).join(' / '));
    }
  }
});

test('rythmique : coups en trop sur les silences et coups manqués repérés et expliqués', () => {
  // Pop syncopée D.DU.UDU jouée avec un coup sur chaque « silence » (temps 1,5 et 3 → cases 2 et 5)
  const params = { p: 'r4', tempo: 90, seq: ['G'], tol: 55 }, sc = scoreOf('rythme', params);
  const extra = []; for (let b = 0; b < sc.bars; b++) extra.push(b * 4 + 0.5, b * 4 + 2);
  const r1 = judgeRhythm('rythme', params, rhythmTake(sc, { extra, seed: 4 }));
  ok(r1.res.extras.length >= 6 && r1.j.y < 1 && r1.j.fb.some(f => /en trop/.test(f.text)), 'en trop : ' + r1.res.extras.length + ' — ' + r1.j.fb.map(f => f.text).join(' / '));
  // un coup sur quatre oublié
  const r2 = judgeRhythm('rythme', params, rhythmTake(sc, { skip: (e, i) => i % 4 === 2, seed: 5 }));
  ok(r2.res.hitRate <= 0.8 && r2.j.y < 1 && r2.j.fb.some(f => /manqu/.test(f.text)), 'manqués : ' + r2.res.hitRate.toFixed(2) + ' — ' + r2.j.fb.map(f => f.text).join(' / '));
});

test('joueur en retard de 70 ms : signalé, pas réussi ; en avance de 40 ms : signalé', () => {
  const params = { p: 'r3', tempo: 88, seq: ['C'], tol: 45 }, sc = scoreOf('rythme', params);
  const late = judgeRhythm('rythme', params, rhythmTake(sc, { bias: 0.07, seed: 6 }));
  ok(late.res.mean > 55 && late.j.y < 1 && late.j.fb.some(f => /retard|tard/i.test(f.text)), 'retard : ' + late.res.mean.toFixed(0) + ' ms — ' + late.j.fb.map(f => f.text).join(' / '));
  const early = judgeRhythm('rythme', params, rhythmTake(sc, { bias: -0.04, seed: 7 }));
  ok(early.res.mean < -28 && early.j.fb.some(f => /avance/i.test(f.text)), 'avance : ' + early.res.mean.toFixed(0) + ' ms — ' + early.j.fb.map(f => f.text).join(' / '));
});

test('frappes étouffées (« chuck ») : reconnues ≥ 80 %, coups normaux pris pour des frappes ≤ 15 %', () => {
  let xs = 0, xOk = 0, ds = 0, dFalse = 0;
  for (const [p, tempo] of [['r7', 84], ['r8', 92], ['r9', 96], ['r12', 70]]) for (const seed of [1, 2, 3]) {
    const params = { p, tempo, seq: ['Em'], tol: 55 }, { res } = judgeRhythm('rythme', params, rhythmTake(scoreOf('rythme', params), { seed: seed * 3 }));
    res.events.filter(e => e.hit).forEach(e => { if (e.k === 'X') { xs++; if (e.chuck >= 0.5) xOk++; } else { ds++; if (e.chuck >= 0.5) dFalse++; } });
  }
  ok(xOk / xs >= 0.8 && dFalse / ds <= 0.15, 'frappes reconnues ' + xOk + '/' + xs + ', coups pris pour des frappes ' + dFalse + '/' + ds);
});

test('pulsation : tempo tenu dans le silence → réussi ; accélération de 5 % mesurée et expliquée', () => {
  const params = { tempo: 80, sub: 1, silent: 2, tol: 45 }, sc = scoreOf('pulse', params);
  const good = judgeRhythm('pulse', params, rhythmTake(sc, { seed: 8, sd: 0.012 }));
  ok(good.j.y === 1 && good.res.drift && Math.abs(good.res.drift.tempoRatio - 1) < 0.02, 'tenu : y ' + good.j.y + ', tempo ×' + (good.res.drift && good.res.drift.tempoRatio.toFixed(3)) + ' — ' + good.j.fb.map(f => f.text).join(' / '));
  // dans les mesures sans clic, chaque coup arrive 5 % plus tôt que le précédent
  const beat = 60 / 80, silentFrom = 2 * 4;
  const late = e => { const b = e.beat - silentFrom; return e.beat >= silentFrom && e.beat < silentFrom + 8 ? -0.05 * b * beat : 0; };
  const fast = judgeRhythm('pulse', params, rhythmTake(sc, { seed: 9, late }));
  const pct = (fast.res.drift.tempoRatio - 1) * 100;
  ok(pct > 3.5 && pct < 6.5 && fast.j.y < 1 && fast.j.fb.some(f => /accélères/.test(f.text)), 'accélération mesurée ' + pct.toFixed(1) + ' % — ' + fast.j.fb.map(f => f.text).join(' / '));
  ok(good.j.observe && near(good.j.observe.level, M.scale(good.res.sd, M.SCALES.timingSd), 1e-9), 'la régularité mesurée nourrit le niveau de pulsation');
  ok(!fast.j.observe || fast.res.hitRate >= 0.8, 'pas d’observation de niveau sur une prise incomplète');
});

test('arpèges et Travis : notes à l’heure reconnues, réussis', () => {
  for (const [p, v, tempo] of [['f1', 'C', 70], ['f3', 'G', 76], ['f4', 'C', 64]]) {
    const params = { p, v, tempo }, tk = rhythmTake(scoreOf('picking', params), { seed: 11, sd: 0.008 });
    const { res, j } = judgeRhythm('picking', params, tk);
    ok(j.y === 1, p + ' ' + v + ' : y ' + j.y + ', notes ' + res.hitRate.toFixed(2) + ', en trop ' + res.extras.length + ', écart ' + (res.mae || 0).toFixed(1) + ' ms');
  }
});

test('changements en rythme : bons accords au bon moment reconnus ; changement en retard repéré', () => {
  const params = { seq: ['C', 'G'], bpc: 4, tempo: 80, strum: 'r1' }, sc = scoreOf('bascule', params);
  const good = judgeRhythm('bascule', params, rhythmTake(sc, { seed: 12 }));
  ok(good.j.y === 1 && good.res.chords.every(c => c.ok), 'propre : y ' + good.j.y + ' — ' + good.j.fb.map(f => f.text).join(' / '));
  // le joueur reste sur l'accord précédent pendant toutes les mesures de Sol (il n'arrive pas à changer)
  const stuck = judgeRhythm('bascule', params, rhythmTake(sc, { seed: 13, frets: e => T.voicing(e.v === 'G' ? 'C' : e.v).frets }));
  ok(stuck.j.y < 1 && stuck.res.chords.filter(c => c.v === 'G').every(c => c.ok === false), 'accord pas changé : ' + JSON.stringify(stuck.res.chords.map(c => c.v + ':' + c.ok)));
});

test('chanter en jouant : la voix ne crée ni coup en trop ni coup manqué, la prise réussie est jugée réussie', () => {
  const params = { p: 'r1', tempo: 72, seq: ['Em'], voice: 'chanter' }, ex = C.EX.chanter;
  const stp = ex.steps(params, ctx0).find(s => s.t === 'play');
  const notes = []; for (let b = 4; b < stp.score.bars * 4; b += 2) notes.push([b + 0.1, b + 1.8, 52 + (b % 5)]);
  const tk = rhythmTake(stp.score, { seed: 14, voice: notes, voiceAmp: 0.18 });
  const res = D.analyzeRhythm(tk.pcm, S.FS, tk.spec);
  const tr = D.trackVoice(tk.pcm, S.FS, {}), share = D.voiceShare(tr, tk.spec.events[0].t + 4 * 60 / 72, tk.spec.events[tk.spec.events.length - 1].t);
  res.voiceShare = share;
  const j = ex.judge(res, params, ctx0, { score: tk.sc });
  ok(res.hitRate >= 0.95 && res.extras.length <= 1, 'voix + guitare : coups ' + res.hitRate.toFixed(2) + ', en trop ' + res.extras.length);
  ok(isFinite(share) && j.y === 1, 'y ' + j.y + ' — ' + j.fb.map(f => f.text).join(' / '));
});

/* ================================================================== analyse : accords */
function renderChord(frets, seed, o) {
  const y = new Float32Array(Math.ceil(1.4 * S.FS));
  S.addStrum(y, Object.assign({ t: 0.3, frets, dir: 'D', amp: 0.15 + 0.05 * S.rng(seed)(), seed: seed * 13 + 1 }, o || {}));
  return D.prepare(S.room(y, { snr: 32, seed }), S.FS).x;
}
function obsOf(x) { const t = (D.onsets(x, {}).list[0] || { t: 0.3 }).t; return D.observe(x, (t + 0.04) * FS, (t + 0.9) * FS); }

test('accords reconnus parmi des accords proches ≥ 98 % (Do/Do7M, Ré/Ré sus4, Sol pop/Do add9…)', () => {
  const SETS = [['C', 'G'], ['G', 'D'], ['Am', 'C'], ['Em', 'G'], ['D', 'A'], ['E', 'A'], ['Am', 'F'], ['Am', 'Dm'], ['C', 'Cmaj7'], ['G-pop', 'Cadd9'], ['Em7-pop', 'G-pop'], ['D', 'Dsus4'], ['Cadd9', 'Dsus4'], ['G', 'C', 'D', 'Em', 'Am', 'F-mini', 'A', 'E']];
  let good = 0, n = 0; const bad = [];
  for (const set of SETS) { const vs = set.map(id => T.voicing(id)); for (let seed = 1; seed <= 4; seed++) for (const v of vs) { const r = D.identify(obsOf(renderChord(v.frets, seed)), vs); n++; if (r.best === v.id) good++; else bad.push(v.id + '→' + r.best); } }
  ok(good / n >= 0.98, good + '/' + n + ' : ' + bad.join(', '));
});

test('diagnostic : corde à vide au lieu d’une case, case voisine, corde à éviter qui sonne ; aucune fausse alarme', () => {
  const cases = [['C', { wrong: { 4: -1 } }, 'open', 4], ['C', { wrong: { 2: -2 } }, 'open', 2], ['E', { wrong: { 2: -2 } }, 'open', 2], ['C', { wrong: { 1: 1 } }, 'fret+1', 1], ['A', { wrong: { 3: 1 } }, 'fret+1', 3], ['D', { strings: [1, 2, 3, 4, 5] }, 'mute', 1]];
  for (const [id, o, kind, s] of cases) {
    const v = T.voicing(id); let hit = 0;
    for (let seed = 1; seed <= 4; seed++) {
      const frets = o.strings ? v.frets.map((f, k) => (f < 0 && o.strings.includes(k) ? 0 : f)) : v.frets;
      const dg = D.chordDiagnosis(obsOf(renderChord(frets, seed, { wrong: o.wrong })), v);
      if (dg.foreign.some(f => f.kind === kind && f.s === s)) hit++;
    }
    ok(hit >= 3, id + ' ' + kind + ' corde ' + s + ' : repéré ' + hit + '/4');
  }
  let fa = 0, tot = 0; const which = [];
  for (const id of ['C', 'G', 'D', 'A', 'E', 'Am', 'Em', 'Dm', 'E7', 'A7', 'D7', 'G7', 'Am7', 'Cmaj7', 'Fmaj7', 'F-mini', 'Asus2', 'Dsus2', 'Dsus4', 'Cadd9', 'G-pop', 'Em7-pop', 'B7', 'Bm', 'F']) {
    const v = T.voicing(id);
    for (let seed = 1; seed <= 4; seed++) { const dg = D.chordDiagnosis(obsOf(renderChord(v.frets, seed)), v); tot++; if (dg.foreign.length) { fa++; which.push(id); } }
  }
  ok(fa <= 1, 'fausses alarmes sur des accords propres : ' + fa + '/' + tot + ' ' + which.join(','));
});

test('changements en une minute : compte exact sur des prises propres (6 paires, 30–70 changements/min)', () => {
  for (const [a, b, cpm] of [['C', 'G', 30], ['Am', 'C', 50], ['G-pop', 'Cadd9', 70], ['D', 'A', 55], ['Em', 'G', 40], ['E', 'Am', 45]]) {
    const va = T.voicing(a), vb = T.voicing(b), dur = 20, gap = 60 / cpm, r = S.rng(cpm);
    const y = new Float32Array(Math.ceil((dur + 1.5) * S.FS)); let t = 0.6, k = 0;
    while (t < dur) { const nt = t + gap * (0.85 + 0.3 * r()); S.addStrum(y, { t, frets: (k % 2 ? vb : va).frets, dir: 'D', amp: 0.14 + 0.06 * r(), seed: 100 + k, ends: new Array(6).fill(nt) }); t = nt; k++; }
    const res = D.analyzeChanges(S.room(y, { snr: 32, seed: 2 }), S.FS, { a, b, t0: 0.3, t1: dur + 0.5 });
    ok(res.changes === k - 1 && res.unclear === 0, a + '/' + b + ' : ' + res.changes + ' changements mesurés pour ' + (k - 1));
  }
});

test('changements : un accord mal formé (doigt une case trop haut) ne compte pas', () => {
  const va = T.voicing('C'), vb = T.voicing('G'), y = new Float32Array(Math.ceil(17 * S.FS));
  let t = 0.6; const bad = [3, 6, 11];
  for (let k = 0; k < 14; k++) {
    // Do avec l'annulaire une case trop haut (Do♯ sur la corde de La) ; Sol avec Sol♯ sur le Mi aigu
    const wrong = bad.includes(k) ? (k % 2 ? { 5: 1 } : { 1: 1 }) : null;
    S.addStrum(y, { t, frets: (k % 2 ? vb : va).frets, wrong, dir: 'D', amp: 0.16, seed: 300 + k, ends: new Array(6).fill(t + 1.1) }); t += 1.1;
  }
  const res = D.analyzeChanges(S.room(y, { snr: 32, seed: 5 }), S.FS, { a: 'C', b: 'G', t0: 0.3, t1: 16.5 });
  ok(res.flawed === 3 && res.changes <= 13 - 3, 'mal formés ' + res.flawed + ', changements comptés ' + res.changes);
  const j = C.EX.minute.judge(res, { a: 'C', b: 'G', sec: 30, target: 40 }, ctx0);
  ok(j.fb.some(f => /pas propre/.test(f.text)), j.fb.map(f => f.text).join(' / '));
});

test('corde par corde : accords propres reconnus, corde étouffée, fausse note et corde sautée repérées', () => {
  function plucks(id, seed, err) {
    err = err || {};
    const v = T.voicing(id), r = S.rng(seed * 7 + 3), strings = T.sounding(v), gap = 0.55 + 0.35 * r();
    const y = new Float32Array(Math.ceil((0.5 + strings.length * gap + 1.2) * S.FS)); let t = 0.5;
    strings.forEach(s => {
      if (err.skip === s) { t += gap; return; }
      S.addString(y, { t, midi: T.OPEN[s] + v.frets[s] + ((err.wrong && err.wrong[s]) || 0), amp: 0.12 + 0.08 * r(), muted: err.muted === s, seed: seed * 31 + s });
      t += gap * (0.85 + 0.3 * r());
    });
    return D.analyzePlucks(S.room(y, { snr: 34, seed }), S.FS, { v: id });
  }
  let clean = 0, n = 0;
  for (const id of ['C', 'G', 'D', 'A', 'E', 'Am', 'Em', 'Dm', 'F-mini', 'Cadd9', 'G-pop', 'B7', 'F', 'Bm']) for (const seed of [1, 2]) { n++; if (plucks(id, seed).clean) clean++; }
  ok(clean === n, 'accords propres reconnus ' + clean + '/' + n);
  for (const [id, err, want] of [['C', { muted: 2 }, 'muted@2'], ['G', { muted: 3 }, 'muted@3'], ['D', { muted: 5 }, 'muted@5'], ['C', { wrong: { 4: -1 } }, 'wrong@4'], ['E', { wrong: { 3: 1 } }, 'wrong@3'], ['C', { skip: 2 }, 'missing@2']]) {
    const res = plucks(id, 4, err), got = res.strings.filter(s => s.status !== 'ok').map(s => s.status + '@' + s.s);
    ok(got.length === 1 && got[0] === want, id + ' ' + JSON.stringify(err) + ' : ' + (got.join(',') || 'propre'));
  }
  const res = plucks('C', 5, { muted: 4 }), j = C.EX.propre.judge(res, { v: 'C' }, ctx0);
  ok(j.y === 0.5 && j.fb.some(f => /Si \(2\) est étouffée/.test(f.text)), j.fb.map(f => f.text).join(' / '));
});

test('accordeur : bonne corde, ±2 cents dès 0,6 s après l’attaque (médiane < 1) ; les 6 cordes d’un seul coup à ±2 cents', () => {
  const errs = [];
  for (let seed = 1; seed <= 3; seed++) for (let s = 0; s < 6; s++) for (const det of [-30, -8, 0, 5, 20]) {
    const y = new Float32Array(Math.ceil(3 * S.FS)); S.addString(y, { t: 0.2, midi: T.OPEN[s], cents: det, amp: 0.15, seed: seed * 17 + s });
    const x = S.room(y, { snr: 35, seed });
    for (const tt of [0.3, 0.8, 1.2, 2.0]) {
      const a = Math.round(tt * S.FS), r = D.tune(x.subarray(a, a + 4096), S.FS);
      ok(r.string === s, 'corde ' + s + ' prise pour ' + r.string);
      if (tt >= 0.8) errs.push(r.cents - det); else ok(Math.abs(r.cents - det) <= 6, 'juste après l’attaque : ' + (r.cents - det).toFixed(1) + ' c');
    }
  }
  ok(D.median(errs.map(Math.abs)) <= 1 && Math.max(...errs.map(Math.abs)) <= 2.5, 'mono : médiane ' + D.median(errs.map(Math.abs)).toFixed(2) + ' c, max ' + Math.max(...errs.map(Math.abs)).toFixed(2));
  const perr = [];
  for (let seed = 1; seed <= 6; seed++) {
    const r = S.rng(seed * 7919 + 13); r(); const dets = [0, 1, 2, 3, 4, 5].map(() => Math.round((r() - 0.5) * 50));
    const y = new Float32Array(Math.ceil(3 * S.FS)); S.addStrum(y, { t: 0.3, frets: [0, 0, 0, 0, 0, 0], dir: 'D', amp: 0.15, seed, cents: Object.fromEntries(dets.map((d, i) => [i, d])) });
    const res = D.polyTune(S.room(y, { snr: 35, seed }), S.FS);
    res.forEach((o, i) => { ok(o.cents != null, 'corde ' + i + ' non mesurée'); perr.push(o.cents - dets[i]); });
  }
  ok(Math.max(...perr.map(Math.abs)) <= 2, 'six cordes : erreur max ' + Math.max(...perr.map(Math.abs)).toFixed(2) + ' c');
});

test('accords de mémoire : bon accord et temps de réaction à ±15 ms, accord faux repéré', () => {
  const vocab = ['C', 'G', 'D', 'Am', 'Em', 'E', 'A'].map(id => T.voicing(id));
  const cues = [], y = new Float32Array(Math.ceil(16 * S.FS)), lat = 0.13, ids = ['G', 'Am', 'D', 'C', 'Em', 'A'], rts = [];
  let t = 1.0;
  ids.forEach((id, i) => { const rt = 0.9 + 0.08 * i, played = i === 3 ? 'Am' : id; S.addStrum(y, { t: t + lat + rt, frets: T.voicing(played).frets, dir: 'D', amp: 0.16, seed: 40 + i }); S.addClick(y, t + lat, 0.1, 70 + i); cues.push({ t, v: id, limit: 2 }); rts.push(rt); t += 2.4; });
  const res = D.analyzeCues(S.room(y, { snr: 33, seed: 4 }), S.FS, { cues, clicks: cues.map(c => c.t), latency: 0.1, vocab });
  res.cues.forEach((c, i) => {
    ok(c.hit && near(c.rt, rts[i], 0.015), c.v + ' : temps ' + c.rt + ' s pour ' + rts[i].toFixed(2));
    ok(c.ok === (i !== 3), c.v + ' : ' + (c.ok ? 'reconnu' : 'pas reconnu (' + c.heard + ')'));
  });
});

test('mélodie fredonnée sur la grille : notes retrouvées, notes de l’accord sur les temps forts', () => {
  const melody = [[0.5, 1.0, 64], [1.0, 1.5, 67], [1.5, 2.4, 72], [2.5, 3.0, 71], [3.0, 3.5, 67], [3.5, 4.4, 62], [4.5, 5.0, 69], [5.0, 5.5, 72], [5.5, 6.4, 76], [6.5, 7.0, 77], [7.0, 7.5, 72], [7.5, 8.4, 69]];
  const y = new Float32Array(Math.ceil(9.5 * S.FS));
  S.addVoice(y, melody.map(([t0, t1, m]) => ({ t0, t1, midi: m - 12 })), 0.2, 3);
  ['C', 'G', 'Am', 'F-mini'].forEach((id, i) => { for (let b = 0; b < 2; b++) S.addStrum(y, { t: 0.5 + i * 2 + b, frets: T.voicing(id).frets, dir: 'D', amp: 0.03, seed: 10 + i * 2 + b }); });
  const notes = D.segmentNotes(D.trackVoice(S.room(y, { snr: 35, seed: 2 }), S.FS));
  ok(notes.length === 12 && notes.every((n, i) => Math.round(n.midi) === melody[i][2] - 12), 'notes : ' + notes.map(n => T.noteName(n.midi)).join(' '));
  const st = D.melodyVsChords(notes, ['C', 'G', 'Am', 'F'].map((sym, i) => ({ t0: 0.5 + i * 2, t1: 2.5 + i * 2, sym })), [0, 1, 2, 3, 4, 5, 6, 7].map(i => 0.5 + i));
  ok(st.strongRatio === 1, 'temps forts sur des notes de l’accord : ' + st.strongRatio);
});

/* ================================================================== guitare de synthèse de l'app */
test('guitare de l’app : chaque note juste à ±1 cent (mesurée par l’accordeur de l’app)', () => {
  let worst = 0;
  for (const m of [40, 45, 47, 50, 52, 55, 57, 59, 62, 64, 67, 69, 72, 76]) for (const c of [0, 13]) {
    const y = G.note(m + c / 100, { sr: 32000, vel: 0.8 });
    for (const t of [0.3, 0.9]) { const a = Math.round(t * 32000), r = D.tune(y.subarray(a, a + 4096), 32000); worst = Math.max(worst, Math.abs(100 * (r.midi - m) - c)); }
  }
  ok(worst <= 1, 'erreur max ' + worst.toFixed(2) + ' c');
});

test('clic aigu : moins de 3 % de son énergie dans la bande d’analyse de la guitare (< 6 kHz)', () => {
  for (const sr of [44100, 48000]) {
    const c = G.click('aigu', true, sr), N = 4096, re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < Math.min(N, c.length); i++) re[i] = c[i];
    D.fft(re, im);
    let lo = 0, hi = 0; for (let k = 1; k < N / 2; k++) { const f = k * sr / N, p = re[k] * re[k] + im[k] * im[k]; if (f < 6000) lo += p; else hi += p; }
    ok(lo / (lo + hi) < 0.03, sr + ' Hz : ' + (100 * lo / (lo + hi)).toFixed(2) + ' %');
  }
});

test('accords joués par l’app reconnus par l’analyse de l’app', () => {
  const V = ['C', 'G', 'D', 'Am', 'Em', 'E', 'A', 'Cadd9', 'G-pop', 'Dsus4'].map(id => T.voicing(id));
  for (const v of V) {
    const evs = T.voicingNotes(v).map((n, s) => (n == null ? null : { t: 0.2 + s * 0.006, midi: n, vel: 0.8, string: s })).filter(Boolean);
    const x = D.prepare(G.render(evs, 1.6, 32000), 32000).x;
    const r = D.identify(D.observe(x, 0.3 * FS, 1.2 * FS), V.filter(w => w.id === v.id || w.sym !== v.sym));
    ok(r.best === v.id, v.id + ' reconnu comme ' + r.best);
  }
});

/* ================================================================== exercices */
function stateAt(level, week) {
  const s = St.newState(Date.parse('2026-01-05T18:00:00')); St.applyStart(s, level);
  s.songs.push(St.makeSong('[Couplet]\nG Em C D\n[Refrain]\nC D G Em', { title: 'Test', tempo: 92, strum: 'r4' })); s.workSong = s.songs[0].id;
  if (week) s.program.start = St.today(Date.now() - (week - 1) * 7 * DAY);
  return s;
}
test('chaque exercice : candidats, difficulté finie, étapes, libellé, jugement sans mesure (débutant et avancé)', () => {
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
        ok(steps.length && steps.every(st => ['show', 'listen', 'wait', 'play', 'quiz', 'song', 'compose'].includes(st.t)), ex.id + ' : étapes');
        ok(typeof ex.label(p, ctx) === 'string', ex.id + ' : libellé');
        const play = steps.find(st => st.t === 'play');
        if (play && play.score) ok(play.score.events.length > 0 && play.score.bars > 0, ex.id + ' : partition vide');
      }
      const j = ex.judge(null, cands[0], ctx, {});
      ok(j && j.y == null, ex.id + ' : sans mesure, pas de verdict inventé');
    }
  }
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
    const med = D.median(ests);
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
  ok(r4.score > 0.9 && !r4.bottleneck, 'tout en place : ' + r4.score + ' ' + JSON.stringify(r4.bottleneck));
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
  // la séance « Ma chanson » joue le modèle et écoute au micro avec le capo
  const s = St.newState(); St.applyStart(s, 'chansons'); s.songs.push(song); s.workSong = song.id; song.capo = 3; song.transpose = 0;
  const ctx = St.ctx(s, null), p = C.EX.chanson.candidates(ctx)[0], st = C.EX.chanson.steps(p, ctx);
  ok(st.find(x => x.t === 'play').score.capo === 3 && st.find(x => x.t === 'listen').play.capo === 3 && /Capo en case 3/.test(st[0].sub), 'capo dans la séance');
});

test('capo : un Do joué capo 2 est reconnu comme Do-forme avec capo, et un capo oublié est détecté', () => {
  // la grille attend Do et Sol (formes) capo 2 : le joueur a bien le capo → les accords sonnent Ré et La
  const sc = C.rhythmScore({ strum: 'r1', seq: ['C', 'G'], bpc: 4, tempo: 84, bars: 4, capo: 2 });
  const withCapo = rhythmTake(sc, { seed: 21, frets: e => T.withCapo(T.voicing(e.v), 2).frets });
  const r1 = D.analyzeRhythm(withCapo.pcm, S.FS, withCapo.spec);
  ok(r1.chords.every(c => c.ok) && r1.capoHeard == null, 'capo 2 attendu et joué : ' + JSON.stringify(r1.chords.map(c => c.v + ':' + c.ok)));
  // même grille sans capo attendu, mais le joueur a laissé son capo en case 2 : détecté et pris en compte
  const sc0 = C.rhythmScore({ strum: 'r1', seq: ['C', 'G'], bpc: 4, tempo: 84, bars: 4 });
  const forgot = rhythmTake(sc0, { seed: 22, frets: e => T.withCapo(T.voicing(e.v), 2).frets });
  const r2 = D.analyzeRhythm(forgot.pcm, S.FS, forgot.spec);
  ok(r2.capoHeard === 2 && r2.chords.every(c => c.ok), 'capo oublié : ' + r2.capoHeard + ' ' + JSON.stringify(r2.chords.map(c => c.v + ':' + c.ok)));
  ok(C.recordingIssues(r2).some(f => /capo en case 2/.test(f.text)), 'le capo entendu est signalé');
});

test('sauvegarde : export/import identique, migration d’un état ancien, données de l’app Corde lues', () => {
  const s = stateAt('chansons', 3);
  St.pairUpdate(s, 'C', 'G', 33);
  const back = St.importJSON(St.exportJSON(s));
  ok(JSON.stringify(back) === JSON.stringify(s), 'export/import');
  let threw = false; try { St.importJSON('{"foo":1}'); } catch (e) { threw = /ACCORD/.test(e.message); }
  ok(threw, 'un fichier étranger est refusé');
  const old = { created: 1, profile: { name: 'Ana' }, skills: {}, vocab: ['Em'] };
  const m = St.migrate(old);
  ok(m.profile.name === 'Ana' && m.profile.sessionMin === 20 && M.COMPS.every(c => m.skills[c.id]) && Array.isArray(m.sessions), 'migration');
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
        const pt = M.pSuccess(truth[ex.comp], d), u = rnd(), y = u < pt ? 1 : u < pt + (1 - pt) / 2 ? 0.5 : 0;
        const judged = ex.kind === 'play' || (ex.kind === 'quiz' && ex.id !== 'cartes' && ex.id !== 'discri') ? { y, success: y === 1, metrics: {} } : { y: null, success: null };
        if (ex.id === 'minute' && judged.y != null) judged.pair = { a: params.a, b: params.b, cpm: C.cpmAt(T.transitionCost(params.a, params.b), truth.changements) * (0.85 + 0.3 * rnd()) };
        if ((ex.id === 'propre' || ex.id === 'barre') && judged.y != null) judged.chord = { id: params.v, clean: y === 1 };
        if (ex.id === 'rythme' && y === 1) judged.pattern = { id: params.p, tempo: params.tempo };
        if (ex.id === 'chanter' && y === 1) judged.chant = { p: params.p, tempo: params.tempo };
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
