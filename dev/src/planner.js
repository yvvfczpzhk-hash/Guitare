/* ==== planner.js ==== */
/* ACCORD — planification.
   Programme de 16 semaines en 4 blocs (Fondations, Groove, Couleurs, Scène & studio), semaines allégées et bilans
   aux semaines 4, 8, 12, 16. Chaque séance est générée le jour même à partir de : la semaine du programme, ta
   forme et l'état de tes doigts, ta charge récente, tes niveaux, ce qui n'a pas été travaillé depuis longtemps
   (espacement), ta chanson et ton échéance éventuelle. Au plus un accord nouveau par séance. */
(function (root) {
  'use strict';
  const AC = root.AC || (root.AC = {});
  const req = n => (typeof require !== 'undefined' ? require(n) : null);
  const T = AC.theory || req('./theory.js');
  const M = AC.model || req('./model.js');
  const C = AC.catalog || req('./catalog.js');
  const St = AC.state || req('./state.js');
  const R = AC.srs || req('./srs.js');
  const P = {};

  P.BLOCKS = [
    { n: 1, name: 'Fondations', from: 1, to: 4,
      goal: 'Des accords ouverts propres, des changements fluides, une pulsation régulière : tes premières chansons à 3–4 accords.',
      focus: { accords: 1.5, changements: 1.5, pulsation: 1.4, rythmiques: 1.1, oreille: 1.0, harmonie: 0.9, chant: 0.8, chansons: 1.0, picking: 0.6, barres: 0.3, composition: 0.6 },
      prefer: { propre: 1.4, minute: 1.4, pulse: 1.3, forme: 1.1, rythme: 1.1, qualite: 1.2, cartes: 1.1 } },
    { n: 2, name: 'Groove', from: 5, to: 8,
      goal: 'La main droite qui fait danser : rythmiques syncopées, frappes percussives — et chanter par-dessus.',
      focus: { rythmiques: 1.6, chant: 1.5, pulsation: 1.2, changements: 1.2, chansons: 1.2, accords: 1.0, oreille: 1.0, harmonie: 1.0, composition: 1.0, picking: 0.8, barres: 0.6 },
      prefer: { rythme: 1.5, chanter: 1.5, bascule: 1.3, degres: 1.3, pulse: 1.1 } },
    { n: 3, name: 'Couleurs', from: 9, to: 12,
      goal: 'Barrés, arpèges et accords colorés : le son pop-folk moderne — et tes premières grilles à toi.',
      focus: { barres: 1.5, picking: 1.5, accords: 1.2, harmonie: 1.3, composition: 1.3, oreille: 1.2, rythmiques: 1.0, changements: 1.0, chant: 1.0, chansons: 1.0, pulsation: 0.8 },
      prefer: { barre: 1.4, 'barre-rythme': 1.3, picking: 1.5, releve: 1.3, compo: 1.3, degres: 1.2 } },
    { n: 4, name: 'Scène & studio', from: 13, to: 16,
      goal: 'Tes chansons du début à la fin, en chantant, sans t’arrêter — et une chanson à toi.',
      focus: { chansons: 1.7, composition: 1.5, chant: 1.5, changements: 1.0, rythmiques: 1.0, pulsation: 1.0, picking: 1.0, barres: 0.9, accords: 0.9, oreille: 0.9, harmonie: 0.9 },
      prefer: { chanson: 1.6, filage: 1.5, compo: 1.5, chanter: 1.3 } },
  ];
  P.block = week => P.BLOCKS.find(b => week >= b.from && week <= b.to) || P.BLOCKS[3];
  P.isDeload = week => week % 4 === 0;

  const TYPES = {
    M: { name: 'Mains', slots: [['accords', 'barres'], ['changements'], 'pause', ['rythmiques', 'pulsation'], ['changements', 'barres', 'accords'], ['picking', 'rythmiques', 'chant']] },
    O: { name: 'Oreille & harmonie', slots: [['oreille'], 'cartes', ['rythmiques', 'pulsation', 'picking'], ['oreille', 'harmonie'], ['composition'], ['changements']] },
    C: { name: 'Chansons', slots: [['changements'], 'song', ['chant'], 'pause', 'song', ['composition', 'rythmiques']] },
  };
  P.TYPES = TYPES;
  P.TYPE_NAMES = { M: 'Mains', O: 'Oreille & harmonie', C: 'Chansons', B: 'Bilan', R: 'Récupération', jourJ: 'Jour J', veille: 'Veille', libre: 'Exercice libre' };

  /* durée estimée d'une prise (préparation, écoute, jeu, retour), en secondes */
  const SEC = { propre: 40, barre: 45, forme: 32, minute: 70, bascule: 48, 'barre-rythme': 48, pulse: 45, rythme: 40, picking: 40, discri: 110, qualite: 75, degres: 110, releve: 95, cartes: 150, chanter: 50, chanson: 70, filage: 240, compo: 360, accordage: 60, echauffe: 90, pause: 45, libre: 90 };
  P.takeSec = id => SEC[id] || 45;

  /** Forme du jour → réglages de séance. ck : {form 1–5, tips 'ok'|'sensibles'|'douloureux', pain 'non'|'gene'|'douleur'} */
  P.readiness = function (ck) {
    const out = { factor: 1, p: M.TARGET_P, type: null, notes: [], stop: false, noBarre: false };
    if (!ck) return out;
    if (ck.pain === 'douleur') {
      out.stop = true; out.type = 'R';
      out.notes.push('Douleur dans la main, le poignet ou l’avant-bras : pas de guitare aujourd’hui. Si elle dure plus de quelques jours ou revient à chaque séance, consulte (médecin, kiné habitué aux musiciens). En attendant : oreille et théorie seulement.');
      return out;
    }
    if (ck.pain === 'gene') { out.factor *= 0.6; out.noBarre = true; out.p = 0.88; out.notes.push('Gêne dans la main : séance courte, sans barrés, pression minimale et pauses. Arrête si ça devient une douleur.'); }
    if (ck.tips === 'douloureux') { out.type = 'O'; out.factor *= 0.75; out.noBarre = true; out.notes.push('Bouts des doigts douloureux : séance surtout oreille, rythme et théorie. Les cals se forment avec des séances courtes et fréquentes, pas longues.'); }
    else if (ck.tips === 'sensibles') { out.factor *= 0.9; out.noBarre = true; out.notes.push('Doigts sensibles : pas de barrés aujourd’hui, appuie juste assez pour que ça sonne.'); }
    if (ck.form <= 1) { out.factor *= 0.6; out.p = 0.9; out.notes.push('Très fatigué : séance minimale, juste pour garder le contact.'); }
    else if (ck.form === 2) { out.factor *= 0.8; out.p = Math.max(out.p, 0.86); out.notes.push('Fatigué : séance raccourcie, réussite facilitée.'); }
    else if (ck.form >= 5) out.p = 0.78;
    return out;
  };

  /** Charge : semaine en cours vs moyenne des 4 dernières (les hausses brutales de temps de jeu fatiguent mains et poignets). */
  P.loadRatio = function (s, dateStr) {
    const d = dateStr || St.today();
    let acute = 0, sum = 0, oldest = -1;
    for (const x of s.sessions) {
      const age = St.dayDiff(x.date, d);
      if (age < 0 || age >= 28) continue;
      const l = x.load || x.minutes || 0;
      if (age < 7) acute += l;
      sum += l; oldest = Math.max(oldest, age);
    }
    const span = oldest + 1, chronic = span >= 14 ? sum / (Math.min(28, span) / 7) : 0;
    return { acute, chronic, ratio: chronic > 0 ? acute / chronic : null };
  };
  P.mainSessions = s => s.sessions.filter(x => ['M', 'O', 'C'].includes(x.type) && !x.partial);
  /** Reprise après une pause de 7 jours ou plus : 2 séances allégées (les cals s'assouplissent vite). */
  P.repriseLeft = function (s, dateStr) {
    const L = P.mainSessions(s);
    if (!L.length) return 0;
    const d = dateStr || St.today();
    let idx = -1;
    for (let i = L.length - 1; i >= 0; i--) { const next = i === L.length - 1 ? d : L[i + 1].date; if (St.dayDiff(L[i].date, next) >= 7) { idx = i; break; } }
    if (idx < 0) return 0;
    return Math.max(0, 2 - (L.length - 1 - idx));
  };
  P.bilanTarget = function (s, week) {
    const due = week % 4 === 0 ? week : week % 4 === 1 && week > 4 ? week - 1 : null;
    if (!due || s.bilans.some(b => b.week === due && b.cycle === s.program.cycle)) return null;
    return due;
  };
  P.bilanDue = function (s, week) {
    // bilan d'entrée : pour mesurer ce que la personne sait déjà faire — inutile si elle n'a jamais joué
    if (!s.bilans.length) return s.profile.start === 'zero' ? null : 'entree';
    const due = P.bilanTarget(s, week);
    if (!due) return null;
    if (due !== week) return 'etape';
    const inWeek = s.sessions.filter(x => St.programWeek(s, x.date) === week && x.type !== 'B').length;
    return inWeek >= 2 ? 'etape' : null;
  };

  /** Prochain accord à apprendre : d'abord ceux de ta chanson, puis l'ordre du programme (barrés à partir du bloc 3). */
  P.nextChord = function (s, blk, noBarre) {
    const song = St.workSong(s);
    const allowBarre = !noBarre && (blk.n >= 3 || s.skills.barres.th >= 3.5) && s.skills.accords.th >= 3;
    // un accord à portée : sa forme n'est pas beaucoup plus dure que ton niveau actuel
    const reach = id => { const v = T.voicing(id); return v.barre ? 0.85 * v.d + 0.3 <= s.skills.barres.th + 1.6 : v.d <= s.skills.accords.th + 1.2; };
    const ok = id => !s.vocab.includes(id) && T.voicing(id) && (allowBarre || !C.isBarreId(id)) && reach(id);
    if (song) { const info = St.songInfo(song); if (info.ok) { const need = info.uniq.find(ok); if (need) return need; } }
    return C.VOCAB_ORDER.find(ok) || null;
  };
  /** Le dernier accord appris est-il assez installé pour en ajouter un ? (2 vérifications, ou 3 séances depuis) */
  P.readyForNew = function (s) {
    const intro = s.vocab.map(id => ({ id, c: s.chords[id] })).filter(x => x.c && !x.c.declared);
    if (!intro.length) return true;
    const last = intro[intro.length - 1];
    const since = s.sessions.filter(x => x.date >= last.c.intro).length;
    // les accords appris récemment doivent être en bonne voie (propres au moins une fois sur deux)
    const recent = intro.slice(-4).filter(x => x.c.n >= 1);
    const okRatio = recent.length ? recent.filter(x => x.c.clean >= 0.5).length / recent.length : 1;
    return ((last.c.n >= 2) || since >= 3) && okRatio >= 0.5;
  };

  /**
   * A priori informés : une compétence jamais travaillée part d'un niveau cohérent avec ses voisines (on ne joue
   * pas des barrés comme un débutant complet quand on maîtrise les accords ouverts), avec une incertitude large
   * que les premières prises corrigent vite.
   */
  P.RELATED = { barres: [['accords', -1.8]], chansons: [['changements', -0.6], ['rythmiques', -0.6]], picking: [['rythmiques', -1.2]], chant: [['rythmiques', -1.0]], composition: [['harmonie', -0.8]] };
  P.seedPriors = function (s) {
    for (const [comp, rel] of Object.entries(P.RELATED)) {
      const sk = s.skills[comp];
      if (!sk || sk.n > 0) continue;
      const vals = rel.map(([c, off]) => (s.skills[c] && s.skills[c].n > 0 ? s.skills[c].th + off : null)).filter(v => v != null);
      if (!vals.length) continue;
      const th = Math.min(...vals);
      if (th > sk.th) { sk.th = +th.toFixed(2); sk.sd = Math.max(sk.sd, 1.6); }
    }
  };

  /* ------------------------------------------------------------------ plan du jour */
  /** @param s état ; @param o {date, checkin, minutes, forceType, rand} */
  P.plan = function (s, o) {
    o = o || {};
    const date = o.date || St.today();
    const r = o.rand || Math.random;
    P.seedPriors(s);
    const week = St.programWeek(s, date);
    const blk = P.block(week);
    const rd = P.readiness(o.checkin);
    const plan = { date, week, block: blk.n, blockName: blk.name, goal: blk.goal, checkin: o.checkin || null, reasons: [], notes: rd.notes.slice(), items: [], targetP: rd.p, noBarre: rd.noBarre };
    let minutes = o.minutes || s.profile.sessionMin || 20;
    let factor = rd.factor;
    const dl = s.deadline && s.deadline.date ? St.dayDiff(date, s.deadline.date) : null;
    let type = o.forceType || rd.type;
    if (rd.stop) return P.recoveryPlan(s, plan, true);
    if (!o.forceType && dl != null && (dl === 0 || dl === 1)) type = dl === 0 ? 'jourJ' : 'veille';
    const bil = P.bilanDue(s, week);
    if (!type && bil && rd.factor >= 0.9 && P.repriseLeft(s, date) === 0 && !(dl != null && dl <= 7 && dl >= 0)) type = 'B';
    if (!type) {
      const seq = blk.n === 1 ? ['M', 'O', 'M', 'C'] : blk.n === 2 ? ['M', 'C', 'O', 'C'] : blk.n === 3 ? ['M', 'O', 'C'] : ['C', 'M', 'C', 'O'];
      const done = P.mainSessions(s).length;
      type = seq[done % seq.length];
      if (dl != null && dl >= 2 && dl <= 21 && type === 'O') type = 'C';
    }
    plan.type = type;
    if (type === 'R') return P.recoveryPlan(s, plan, false);
    if (type === 'jourJ' || type === 'veille') return P.showPlan(s, plan, dl);
    if (type === 'B') { plan.minutes = 18; return P.bilanPlan(s, plan, bil || 'etape'); }

    const rep = P.repriseLeft(s, date);
    if (rep > 0) { factor *= 0.75; plan.targetP = Math.max(plan.targetP, 0.86); plan.noBarre = true; plan.notes.push('Reprise après une pause : encore ' + rep + ' séance(s) allégée(s), le temps que les doigts se réhabituent.'); }
    if (P.isDeload(week)) { factor *= 0.85; plan.targetP = Math.max(plan.targetP, 0.84); plan.reasons.push('Semaine allégée : on consolide avant le bilan.'); }
    const lr = P.loadRatio(s, date);
    if (lr.ratio != null && lr.ratio > 1.4 && s.sessions.length >= 8) { factor *= 0.8; plan.notes.push('Tu as beaucoup joué cette semaine par rapport à d’habitude : séance réduite de 20 % pour ménager les mains.'); }
    if (dl != null && dl >= 2 && dl <= 10) { factor *= 0.7; plan.reasons.push('J−' + dl + ' avant « ' + (s.deadline.label || 'ton échéance') + ' » : moins de volume, on garde la qualité (affûtage).'); }
    minutes = Math.max(8, Math.round(minutes * factor));
    plan.minutes = minutes;
    plan.reasons.unshift('Semaine ' + week + '/16 · bloc ' + blk.n + ' « ' + blk.name + ' »');

    // accord nouveau (au plus un par séance, pas en séance « oreille », pas un jour de doigts douloureux)
    if (type !== 'O' && P.readyForNew(s) && !(o.checkin && o.checkin.tips === 'douloureux')) {
      const nc = P.nextChord(s, blk, plan.noBarre);
      if (nc) { plan.newChord = nc; plan.reasons.push('Nouvel accord : ' + C.vName(nc)); }
    }

    const warm = [{ ex: 'accordage', sec: 60 }];
    if (minutes >= 15) warm.push({ ex: 'echauffe', sec: 75 });
    const cool = [{ ex: 'libre', sec: minutes >= 15 ? 90 : 60 }];
    const mainSec = minutes * 60 - warm.reduce((a, b) => a + b.sec, 0) - cool[0].sec;
    const T0 = TYPES[type];
    const nBlocks = Math.max(2, Math.min(T0.slots.length, Math.round(mainSec / 200)));
    const blockSec = mainSec / nBlocks;
    const nTakes = ex => (ex.kind === 'quiz' || ex.kind === 'compose' || ex.kind === 'song' || ex.id === 'minute' ? 1 : Math.max(2, Math.min(6, Math.round(blockSec / P.takeSec(ex.id)))));

    // priorités par compétence
    const pri = {};
    const nowTs = Date.parse(date + 'T12:00:00');
    const goals = s.profile.goals || {};
    const GOAL = { changements: goals.accompagner ? 1.15 : 1, chant: goals.accompagner ? 1.2 : 1, chansons: goals.accompagner ? 1.1 : 1, composition: goals.composer ? 1.25 : 0.8, harmonie: goals.composer ? 1.1 : 1, picking: goals.picking ? 1.3 : 1 };
    for (const c of M.COMPS) {
      const sk = s.skills[c.id];
      const lastP = sk.lastMain || sk.last;
      const days = lastP ? (nowTs - lastP) / 864e5 : 30;
      const due = Math.max(0.4, Math.min(3.5, days / 4));
      const need = 1 + Math.max(0, 8 - sk.th) / 10;
      pri[c.id] = (blk.focus[c.id] || 1) * (GOAL[c.id] || 1) * need * due * (0.9 + 0.2 * r());
    }
    if (plan.noBarre) pri.barres = 0;
    const lastSess = s.sessions[s.sessions.length - 1];
    const lastEx = new Set(lastSess ? lastSess.takes.map(t => t.ex) : []);
    const ctx = St.ctx(s, plan);
    const song = St.workSong(s);
    const dueCards = R.dueList(s.cards, St.cardsAvailable(s), date, { max: 12 }).length;
    let newToday = 0;
    const used = new Set(), items = [];
    for (const slot of T0.slots.slice(0, nBlocks)) {
      if (slot === 'pause') { items.push(dueCards >= 4 && !items.some(i => i.ex === 'cartes') ? { ex: 'cartes', takes: 1, comp: 'harmonie', pause: true } : { ex: 'pause', sec: 45 }); continue; }
      if (slot === 'cartes') { if (!items.some(i => i.ex === 'cartes')) items.push({ ex: 'cartes', takes: 1, comp: 'harmonie' }); continue; }
      if (slot === 'song') {
        const feasible = song && C.EX.chanson.candidates(ctx).length && C.minDifficulty(C.EX.chanson, ctx, r) <= s.skills.chansons.th + 1.4;
        if (feasible) { items.push({ ex: 'chanson', takes: Math.max(2, Math.round(blockSec / SEC.chanson)), comp: 'chansons' }); continue; }
        // chanson encore hors de portée : on prépare ses changements en rythme
        items.push({ ex: 'bascule', takes: nTakes(C.EX.bascule), comp: 'changements', label: song ? 'Préparer « ' + song.title + ' »' : undefined }); continue;
      }
      let opts = slot.filter(c => !used.has(c) && pri[c] > 0);
      if (!opts.length) opts = slot.filter(c => pri[c] > 0);
      if (!opts.length) continue;
      const comp = opts.slice().sort((a, b) => pri[b] - pri[a])[0];
      used.add(comp);
      let exs = C.byComp(comp).filter(e => e.kind !== 'song' || (blk.n === 4 && song));
      exs = exs.filter(e => e.candidates(ctx, r).length > 0 && C.minDifficulty(e, ctx, r) <= s.skills[comp].th + 1.6);
      if (!s.profile.mic) exs = exs.filter(e => e.kind !== 'play');
      if (comp === 'chansons' && !song) exs = [];
      if (!exs.length) continue;
      const weights = exs.map(e => {
        const it = s.items[e.id];
        let w = blk.prefer[e.id] || 1;
        if (lastEx.has(e.id)) w *= 0.6;
        if (!it) w *= newToday >= 1 ? 0.05 : 1.15;
        return w * (0.85 + 0.3 * r());
      });
      let bi = 0; weights.forEach((w, i) => { if (w > weights[bi]) bi = i; });
      const ex = exs[bi];
      if (!s.items[ex.id]) newToday++;
      items.push({ ex: ex.id, takes: nTakes(ex), comp, isNew: !s.items[ex.id] });
    }
    // accord nouveau : un bloc « accord propre » dédié, en tête, appris d'abord en bloc (peu d'interférence)
    if (plan.newChord) {
      const exId = C.isBarreId(plan.newChord) ? 'barre' : 'propre';
      const idx = items.findIndex(i => i.ex === exId);
      const blkNew = { ex: exId, fixed: [{ v: plan.newChord }, { v: plan.newChord }, { v: plan.newChord }], comp: C.EX[exId].comp, newChord: true, label: 'Nouvel accord : ' + C.vName(plan.newChord) };
      if (idx >= 0) items.splice(idx, 1, blkNew); else items.unshift(blkNew);
    }
    // espacement garanti : une compétence oubliée depuis ≥ 9 jours remplace le bloc le moins prioritaire
    const lastOf = c => s.skills[c].lastMain || s.skills[c].last;
    const overdue = M.COMPS.map(c => ({ id: c.id, days: lastOf(c.id) ? (nowTs - lastOf(c.id)) / 864e5 : 0 }))
      .filter(x => x.days >= 9 && !used.has(x.id) && pri[x.id] > 0 && !['chansons', 'composition'].includes(x.id)).sort((a, b) => b.days - a.days);
    for (const ov of overdue.slice(0, 1)) {
      const cand = items.filter(it => it.comp && !it.fixed && !it.pause && it.ex !== 'chanson' && it.ex !== 'cartes');
      if (cand.length < 2) break;
      const exs = C.byComp(ov.id).filter(e => (e.kind === 'play' || e.kind === 'quiz') && e.candidates(ctx, r).length);
      if (!exs.length) break;
      const victim = cand.sort((a, b) => pri[a.comp] - pri[b.comp])[0];
      const ex = exs.slice().sort((a, b) => ((s.items[a.id] || {}).last || 0) - ((s.items[b.id] || {}).last || 0))[0];
      Object.assign(victim, { ex: ex.id, comp: ov.id, takes: nTakes(ex), isNew: !s.items[ex.id], rescued: true });
      plan.reasons.push('Rappel espacé : ' + M.COMP[ov.id].name.toLowerCase() + ' (pas travaillé depuis ' + Math.round(ov.days) + ' j)');
    }
    // alternance : un exercice déjà bien connu (≥ 6 prises) alterne avec un autre exercice connu de la même compétence —
    // une fois la base acquise, varier fait mieux retenir que répéter (Shea & Morgan 1979 ; Carter & Grahn 2016)
    for (const it of items) {
      if (!it.ex || it.mix || it.rescued || it.fixed || it.takes < 4) continue;
      const e = C.EX[it.ex];
      if (!e || e.kind !== 'play' || ((s.items[e.id] || {}).n || 0) < 6) continue;
      const mates = C.byComp(it.comp).filter(x => x.id !== e.id && x.kind === 'play' && ((s.items[x.id] || {}).n || 0) >= 6 && !items.some(o2 => o2.ex === x.id || (o2.mix && o2.mix.includes(x.id))) && x.candidates(ctx, r).length);
      if (!mates.length) continue;
      const mate = mates[Math.floor(r() * mates.length) % mates.length];
      it.mix = [e.id, mate.id]; it.label = e.name + ' ⇄ ' + mate.name;
    }
    // ajuste le nombre de prises pour tenir la durée prévue
    const unit = it => (it.mix ? (SEC[it.mix[0]] + SEC[it.mix[1]]) / 2 : SEC[it.ex] || 45);
    const est = () => items.reduce((a, it) => a + (it.sec && !it.takes ? it.sec : (it.fixed ? it.fixed.length : it.takes) * unit(it)), 0);
    for (let guard = 0; guard < 30; guard++) {
      const diff = mainSec - est();
      if (Math.abs(diff) < 25) break;
      const adj = items.filter(it => it.takes && !it.fixed && !['cartes', 'compo', 'filage', 'discri', 'qualite', 'degres', 'minute'].includes(it.ex) && (diff > 0 ? it.takes < 6 : it.takes > 1));
      if (!adj.length) break;
      const it = adj.sort((a, b) => (diff > 0 ? a.takes - b.takes : b.takes - a.takes))[0];
      if (Math.abs(diff) < unit(it) / 2) break;
      it.takes += diff > 0 ? 1 : -1;
    }
    plan.items = warm.concat(items, cool);
    plan.title = TYPES[type].name;
    plan.focus = Array.from(new Set(items.filter(i => i.comp).map(i => M.COMP[i.comp].short)));
    const weakest = M.COMPS.filter(c => plan.focus.includes(c.short)).sort((a, b) => s.skills[a.id].th - s.skills[b.id].th)[0];
    if (weakest) plan.reasons.push('Priorité : ' + weakest.name.toLowerCase() + ' (niveau ' + s.skills[weakest.id].th.toFixed(1).replace('.', ',') + ')');
    if (song) { const rdn = St.readiness(s, song); if (rdn && rdn.bottleneck) plan.reasons.push('« ' + song.title + ' » : ' + rdn.bottleneck.text.charAt(0).toLowerCase() + rdn.bottleneck.text.slice(1)); }
    return plan;
  };

  P.recoveryPlan = function (s, plan, pain) {
    plan.type = 'R'; plan.title = pain ? 'Pas de guitare aujourd’hui' : 'Récupération';
    plan.items = [{ ex: 'cartes', takes: 1, comp: 'harmonie' }, { ex: 'degres', takes: 1, comp: 'oreille' }];
    if (!pain) plan.items.push({ ex: 'qualite', takes: 1, comp: 'oreille' });
    plan.minutes = pain ? 6 : 8;
    plan.notes.push(pain ? 'Rien qui sollicite la main : oreille et théorie seulement.' : 'Aujourd’hui on entretient sans les doigts : oreille et théorie.');
    return plan;
  };

  P.showPlan = function (s, plan, dl) {
    const song = St.workSong(s);
    if (dl === 0) {
      plan.type = 'jourJ'; plan.title = 'Jour J — mise en doigts';
      plan.items = [{ ex: 'accordage', sec: 60 }, { ex: 'echauffe', sec: 90 }].concat(song ? [{ ex: 'chanson', takes: 2, comp: 'chansons' }] : [{ ex: 'rythme', takes: 2, comp: 'rythmiques' }]).concat([{ ex: 'libre', sec: 60 }]);
      plan.notes.push('Pas de travail technique aujourd’hui : on réveille les doigts et on se rassure. Une ou deux prises de ta chanson à 80 %, pas plus.', 'Juste avant de jouer : accorde-toi, 3 respirations lentes, et entends le début de la chanson dans ta tête.');
    } else {
      plan.type = 'veille'; plan.title = 'Veille — séance légère';
      plan.items = [{ ex: 'accordage', sec: 60 }, { ex: 'echauffe', sec: 75 }].concat(song ? [{ ex: 'filage', takes: 1, comp: 'chansons' }] : [{ ex: 'rythme', takes: 2, comp: 'rythmiques' }]).concat([{ ex: 'libre', sec: 60 }]);
      plan.notes.push('La veille : un seul filage, puis du repos. Le sommeil consolide ce que tu as travaillé (Walker et al. 2002 ; Simmons & Duke 2006).');
    }
    plan.targetP = 0.92;
    plan.minutes = Math.round(plan.items.reduce((a, it) => a + (it.sec || (it.takes || 1) * P.takeSec(it.ex)), 0) / 60);
    return plan;
  };

  /* ------------------------------------------------------------------ bilan */
  /** Batterie standard, adaptée au point de départ (identique d'un bilan à l'autre pour comparer). */
  P.bilanPlan = function (s, plan, kind) {
    plan.type = 'B'; plan.bilan = kind || 'etape';
    plan.bilanWeek = plan.bilan === 'entree' ? 0 : (P.bilanTarget(s, plan.week) || plan.week);
    plan.title = kind === 'entree' ? 'Bilan d’entrée' : 'Bilan de fin de bloc';
    plan.targetP = 0.8;
    const has = id => s.vocab.includes(id);
    const lvl = s.skills.accords.th;
    const chordA = lvl >= 4.5 && has('F') ? 'F' : has('C') ? 'C' : has('Am') ? 'Am' : 'Em';
    const chordB = lvl >= 4.5 && has('Bm') ? 'Bm' : has('G') ? 'G' : has('E') ? 'E' : 'Asus2';
    const pair = has('C') && has('G') ? ['C', 'G'] : has('Am') && has('Em') ? ['Em', 'Am'] : ['Em', 'Asus2'];
    plan.introduce = ['Em'].concat(pair[1] === 'Asus2' ? ['Asus2'] : []).filter(id => !has(id));
    plan.items = [
      { ex: 'accordage', sec: 60 },
      { ex: C.isBarreId(chordA) ? 'barre' : 'propre', fixed: [{ v: chordA }], comp: C.isBarreId(chordA) ? 'barres' : 'accords', bilan: true },
      { ex: C.isBarreId(chordB) ? 'barre' : 'propre', fixed: [{ v: chordB }], comp: C.isBarreId(chordB) ? 'barres' : 'accords', bilan: true },
      { ex: 'minute', fixed: [{ a: pair[0], b: pair[1], sec: 30, target: 30 }], comp: 'changements', bilan: true },
      { ex: 'pulse', fixed: [{ tempo: 80, sub: 1, silent: 2, tol: 45 }], comp: 'pulsation', bilan: true },
      { ex: 'rythme', ladder: [{ p: 'r1', tempo: 80, seq: ['Em'], tol: 55 }, { p: 'r3', tempo: 80, seq: ['Em'], tol: 55 }, { p: 'r4', tempo: 80, seq: ['Em'], tol: 55 }, { p: 'r8', tempo: 84, seq: ['Em'], tol: 55 }, { p: 'r11', tempo: 70, seq: ['Em'], tol: 55 }], comp: 'rythmiques', bilan: true },
      { ex: 'discri', fixed: [{ trials: 20 }], comp: 'oreille', bilan: true },
      { ex: 'degres', fixed: [{ set: 'pop', prog: false, n: 8 }], comp: 'oreille', bilan: true },
      { ex: 'chanter', fixed: [{ p: 'r1', tempo: 72, seq: ['Em'], voice: 'compter' }], comp: 'chant', bilan: true },
    ];
    if ((s.profile.goals || {}).picking || plan.week >= 8) plan.items.splice(6, 0, { ex: 'picking', ladder: [{ p: 'f1', tempo: 66, v: 'Em' }, { p: 'f3', tempo: 66, v: 'Em' }, { p: 'f4', tempo: 66, v: 'Em' }], comp: 'picking', bilan: true });
    plan.minutes = 18;
    plan.notes.push(kind === 'entree'
      ? 'Environ 15–20 minutes pour mesurer où tu en es vraiment (accords, changements, pulsation, rythmiques, oreille). Les exercices partiront de ces mesures.'
      : 'Même batterie qu’au bilan précédent : on compare, et le bloc suivant se règle sur les résultats.');
    return plan;
  };
  /** Fin de bilan : estimation a posteriori de chaque compétence à partir des items du bilan. */
  P.concludeBilan = function (s, sess, kind, ts) {
    const byComp = {}, obs = [];
    for (const t of sess.takes) {
      const ex = C.EX[t.ex]; if (!ex || !ex.comp || !t.judged) continue;
      if (t.judged.observe) obs.push(t.judged.observe);
      if (t.judged.y == null) continue;
      (byComp[ex.comp] = byComp[ex.comp] || []).push({ d: t.d, y: t.judged.y, w: 1.3 });
    }
    const before = {}, after = {}, start = sess.startSkills || {}, reset = new Set();
    for (const c of M.COMPS) {
      const sk = s.skills[c.id], pr = start[c.id] || { th: sk.th, sd: sk.sd };
      before[c.id] = +pr.th.toFixed(2);
      const items = byComp[c.id];
      if (items && items.length) {
        const est = M.mapEstimate({ th: pr.th, sd: Math.max(pr.sd, 1.2) }, items);
        sk.th = est.th; sk.sd = Math.min(pr.sd, est.sd + 0.2);
        reset.add(c.id);
      }
    }
    for (const o of obs) { if (reset.has(o.comp)) M.observe(s.skills[o.comp], o.level, o.noise, ts); else if (s.skills[o.comp]) reset.add(o.comp); }
    for (const c of M.COMPS) after[c.id] = +s.skills[c.id].th.toFixed(2);
    const rec = { date: St.today(ts), week: kind === 'entree' ? 0 : (sess.bilanWeek || sess.week), cycle: s.program.cycle, kind, before, after, measured: Array.from(reset), overall: +M.overall(s.skills).toFixed(2) };
    s.bilans.push(rec);
    return rec;
  };

  AC.planner = P;
  if (typeof module !== 'undefined' && module.exports) module.exports = P;
})(typeof globalThis !== 'undefined' ? globalThis : this);
