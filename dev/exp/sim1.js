// Simulation d'un élève sur 20 semaines : plans, choix des paramètres, mises à jour.
const path = __dirname + '/../src/';
global.AC = {};
for (const m of ['theory','dsp','model','srs','catalog','state','planner']) require(path + m + '.js');
const { theory: T, model: M, catalog: C, state: St, planner: P, srs: R } = AC;
let seed = 7; const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
const day0 = Date.parse('2026-10-05T18:00:00'), s = St.newState(day0); s.onboarded = true;
St.applyStart(s, 'debut');
s.songs.push(St.makeSong('[Couplet]\nG Em C D\nG Em C D\n[Refrain]\nC D G Em\nC D G', { title: 'Test', tempo: 92, strum: 'r4' })); s.workSong = s.songs[0].id;
const stats = {}; const truth = {}; M.COMPS.forEach(c => { truth[c.id] = 1 + 2 * rnd(); });
let succ = 0, graded = 0; const bilans = []; const exCount = {}; const typeCount = {};
for (let day = 0; day < 140; day++) {
  if (rnd() > 5 / 7) continue;
  M.COMPS.forEach(c => { truth[c.id] = Math.min(9, truth[c.id] + 0.025); });   // progression réelle lente
  const ts = day0 + day * 864e5, date = St.today(ts);
  const plan = P.plan(s, { date, checkin: { form: 3, tips: day < 14 && rnd() < 0.3 ? 'sensibles' : 'ok', pain: 'non' }, rand: rnd });
  typeCount[plan.type] = (typeCount[plan.type] || 0) + 1;
  const sess = St.startSession(s, plan, ts);
  for (const item of plan.items) {
    if (item.sec && !item.takes) continue;
    const ids = item.mix || [item.ex];
    const n = item.fixed ? item.fixed.length : item.ladder ? item.ladder.length : item.takes;
    for (let k = 0; k < n; k++) {
      const ex = C.EX[ids[k % ids.length]];
      const ctx = St.ctx(s, plan); ctx.takeIndex = k; ctx.freshChords = s.vocab.filter(id => { const c = s.chords[id]; return c && !c.declared && St.dayDiff(c.intro, date) <= 21 && !(c.clean >= 0.66 && c.n >= 2); });
      let params, d;
      if (item.fixed) { params = item.fixed[k]; d = ex.difficulty(params, ctx); }
      else if (item.ladder) { params = item.ladder[k]; d = ex.difficulty(params, ctx); }
      else { const it = s.items[ex.id]; const p = !it || it.n < 2 ? Math.max(plan.targetP, 0.86) : plan.targetP; const ch = C.choose(ex, M.dFor(s.skills[ex.comp].th, p), ctx, rnd); if (!ch) { console.log('aucun candidat', ex.id); continue; } params = ch.params; d = ch.d; }
      if (!isFinite(d)) { console.log('d non fini', ex.id, JSON.stringify(params)); continue; }
      const steps = ex.steps(params, ctx); ex.label(params, ctx);
      if (!steps.length) console.log('pas d’étapes', ex.id);
      exCount[ex.id] = (exCount[ex.id] || 0) + 1;
      const pt = M.pSuccess(truth[ex.comp], d), u = rnd(), y = u < pt ? 1 : u < pt + (1 - pt) / 2 ? 0.5 : 0;
      const judged = ex.kind === 'play' || (ex.kind === 'quiz' && ex.id !== 'cartes' && ex.id !== 'discri') ? { y, success: y === 1, metrics: {} } : { y: null, success: null };
      if (ex.id === 'minute' && judged.y != null) judged.pair = { a: params.a, b: params.b, cpm: C.cpmAt(T.transitionCost(params.a, params.b), truth.changements) * (0.85 + 0.3 * rnd()) };
      if ((ex.id === 'propre' || ex.id === 'barre') && judged.y != null) judged.chord = { id: params.v, clean: y === 1 };
      if (ex.id === 'rythme' && y === 1) judged.pattern = { id: params.p, tempo: params.tempo };
      if (ex.id === 'chanter' && y === 1) judged.chant = { p: params.p, tempo: params.tempo };
      if (judged.y != null) { graded++; if (judged.success) succ++; const st = stats[ex.id] = stats[ex.id] || { n: 0, ok: 0, gap: 0 }; st.n++; if (judged.success) st.ok++; if (!item.fixed && !item.ladder) st.gap += d - M.dFor(s.skills[ex.comp].th, plan.targetP); }
      if (ex.kind === 'compose') { St.recordTake(s, { ex: ex.id, params, d, judged: { y: null, success: null }, self: y, ts }, ts); continue; }
      St.recordTake(s, { ex: ex.id, params, d, judged, ts }, ts);
      sess.takes.push({ ex: ex.id, params, d, judged });
      if (ex.id === 'cartes') { const ids2 = R.dueList(s.cards, St.cardsAvailable(s), date, { max: 12 }); ids2.forEach(id => { const cd = R.card(id); St.reviewCard(s, id, rnd() < M.pSuccess(truth.harmonie, cd.b), 4, ts); }); }
    }
  }
  St.finishSession(s, sess, ts + 1200000, false);
  if (plan.type === 'B') { const rec = P.concludeBilan(s, sess, plan.bilan, ts); bilans.push(rec.week); if (plan.bilan === 'entree') s.program.start = date; }
}
console.log('par exercice', Object.entries(stats).map(([k,v])=>k+' '+(v.ok/v.n).toFixed(2)+' (n'+v.n+', écart d '+(v.gap/v.n).toFixed(2)+')').join(' | '));
console.log('types', JSON.stringify(typeCount));
console.log('bilans', bilans.join(','), '| réussite', (succ / graded).toFixed(2), '| vocab', s.vocab.length, s.vocab.join(' '));
console.log('niveaux', M.COMPS.map(c => c.id + ' ' + s.skills[c.id].th.toFixed(1) + '/' + truth[c.id].toFixed(1)).join(' · '));
console.log('exercices', JSON.stringify(exCount));
console.log('cartes', Object.keys(s.cards).length, 'paires', Object.keys(s.pairs).length, 'rythmiques', JSON.stringify(s.patterns));
const rd = St.readiness(s, s.songs[0]); console.log('prête', JSON.stringify(rd && { score: rd.score, parts: rd.parts, b: rd.bottleneck }));
