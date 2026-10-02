/* ==== ui-screens.js ==== */
/* ACCORD — écrans : accueil, progrès, chansons, studio, outils, réglages, science, premier lancement. */
(function (root) {
  'use strict';
  const AC = root.AC;
  const U = AC.ui, T = AC.theory, D = AC.dsp, M = AC.model, C = AC.catalog, St = AC.state, P = AC.planner, A = AC.audio, Store = AC.store, R = AC.srs;
  const esc = U.esc, fr = U.fr, btn = U.btn;
  const S = () => U.state();
  const save = () => Store.save(S());
  const vSym = id => C.vSym(id);

  const TABS = [['home', 'today', 'Aujourd’hui'], ['progress', 'progress', 'Progrès'], ['songs', 'song', 'Chansons'], ['studio', 'studio', 'Studio'], ['tools', 'tools', 'Outils']];
  let screen = 'home', onbStep = 0, planCache = null, songOpen = null, songEdit = null, toolOpen = null, recList = null, dictFilter = 'open';
  const won = t => t.ok === true || (t.ok == null && (t.y != null ? t.y : t.self) >= 1);

  U.render = function () {
    const s = S(), app = document.getElementById('app');
    if (!s.onboarded) { app.innerHTML = onboarding(); const tb = document.querySelector('.tabbar'); if (tb) tb.remove(); return; }
    if (!U.inSession() && St.maybeNewCycle(s)) { Store.save(s, true); planCache = null; setTimeout(() => U.toast('Nouveau cycle de 16 semaines : on repart du bloc Fondations, avec tes niveaux actuels.', 5000), 300); }
    const html = ({ home, progress, songs, studio, tools, settings, science })[screen]();
    app.innerHTML = html;
    let tb = document.querySelector('.tabbar');
    if (!tb) { tb = document.createElement('nav'); tb.className = 'tabbar'; tb.setAttribute('aria-label', 'Navigation'); document.body.appendChild(tb); }
    tb.innerHTML = TABS.map(([id, ic, lab]) => `<button class="tab ${screen === id || (id === 'home' && (screen === 'settings' || screen === 'science')) ? 'on' : ''}" data-act="tab" data-arg="${id}" aria-label="${lab}"${screen === id ? ' aria-current="page"' : ''}>${U.icon(ic)}<span>${lab}</span></button>`).join('');
    if (screen === 'songs' && songOpen && !recList) loadRecs();
    if (screen === 'tools' && toolOpen === 'tuner') startToolTuner();
  };
  U.on('tab', id => { stopTools(); screen = id; songOpen = id === 'songs' ? songOpen : null; toolOpen = null; U.render(); window.scrollTo(0, 0); });
  U.on('go', id => { stopTools(); screen = id; U.render(); window.scrollTo(0, 0); });
  U.invalidateRecs = () => { recList = null; };
  const topbar = (title, back) => `<header class="topbar">${back ? `<button class="iconbtn" data-act="${back.act}" ${back.arg != null ? `data-arg="${esc(back.arg)}"` : ''} aria-label="Retour">${U.icon('back', 22)}</button>` : ''}<h1 class="grow">${esc(title)}</h1></header>`;

  /* ================================================================ ACCUEIL */
  const FACES = [[1, '😴', 'Épuisé'], [2, '😮‍💨', 'Fatigué'], [3, '🙂', 'Normal'], [4, '😀', 'En forme'], [5, '🤩', 'Au top']];
  function todayRec() {
    const s = S(), d = St.today();
    if (!s.today || s.today.date !== d) s.today = { date: d, checkin: { form: null, tips: 'ok', pain: 'non' }, minutes: null, force: null };
    return s.today;
  }
  function currentPlan() {
    const s = S(), t = todayRec();
    if (!t.checkin.form || !t.checkin.ok) return null;
    const key = JSON.stringify([t.date, t.checkin, t.minutes, t.force, s.sessions.length, s.deadline, s.bilans.length, s.program, s.workSong, s.vocab.length]);
    if (planCache && planCache.key === key) return planCache.plan;
    const plan = P.plan(s, { date: t.date, checkin: t.checkin, minutes: t.minutes || undefined, forceType: t.force || undefined });
    planCache = { key, plan };
    return plan;
  }
  function home() {
    const s = S(), t = todayRec(), week = St.programWeek(s), blk = P.block(week);
    const weeks = Array.from({ length: 16 }, (_, i) => `<i class="${i + 1 < week ? 'done' : i + 1 === week ? 'now' : ''} ${(i + 1) % 4 === 0 ? 'b' : ''}"></i>`).join('');
    const dl = s.deadline && s.deadline.date ? St.dayDiff(St.today(), s.deadline.date) : null;
    let h = `<header class="topbar"><div class="brand"><i></i>ACCORD</div><div class="row"><span class="tag accent">${(s.program.cycle || 1) > 1 ? 'Cycle ' + s.program.cycle + ' · ' : ''}S${week} · ${esc(blk.name)}</span><button class="iconbtn" data-act="go" data-arg="settings" aria-label="Réglages">${U.icon('settings', 22)}</button></div></header><section class="screen">`;
    h += `<div class="card hero"><div class="small muted">${esc(U.dateLong(t.date))}${s.profile.name ? ' · ' + esc(s.profile.name) : ''}</div><h1 style="margin-top:2px">Bloc ${blk.n} · ${esc(blk.name)}</h1><p class="muted" style="margin-top:6px">${esc(blk.goal)}</p><div class="weeks" style="margin-top:12px" aria-label="Semaine ${week} sur 16">${weeks}</div>${weekCount(s, week)}</div>`;
    if (s.current && s.current.plan && St.dayDiff(s.current.date || St.today(), St.today()) <= 1) h += `<div class="card"><h3>Séance en cours</h3><p class="small muted" style="margin:4px 0 10px">${esc(s.current.plan.title || '')} — bloc ${s.current.idx + 1}/${s.current.plan.items.length}</p><div class="row">${btn('resume', 'Reprendre', 'primary grow')}${btn('drop-current', 'Abandonner', 'ghost')}</div></div>`;
    if (dl != null && dl >= 0) h += `<div class="card flat"><div class="row between"><div><div class="small muted">Échéance</div><h3>${esc(s.deadline.label || 'Échéance')}</h3></div><div class="big-num" style="font-size:34px">J−${dl}</div></div></div>`;
    const doneToday = s.sessions.filter(x => x.date === t.date && x.type !== 'libre' && !x.partial);
    if (doneToday.length && !t.extra) {
      const last = doneToday[doneToday.length - 1];
      const m = last.takes.filter(x => x.y != null || x.self != null), ok = m.filter(won).length;
      h += `<div class="card"><div class="row between"><span class="tag good">Aujourd’hui</span><span class="small muted">${last.minutes || 0} min</span></div><h2 style="margin-top:8px">Séance faite ✓</h2><p class="muted" style="margin-top:4px">${m.length ? ok + '/' + m.length + ' prises réussies. ' : ''}La consolidation se fait maintenant, surtout pendant le sommeil. Plusieurs petites séances espacées valent mieux qu’une longue.</p><div style="margin-top:12px">${btn('extra', 'Encore une séance', 'block')}</div></div>`;
    } else if (!t.checkin.form || !t.checkin.ok) {
      const ck = t.checkin;
      h += `<div class="card"><h2>Comment ça va aujourd’hui ?</h2><div class="faces" style="margin-top:12px">${FACES.map(([v, e, l]) => `<button class="face ${ck.form === v ? 'on' : ''}" data-act="ck-form" data-arg="${v}">${e}<span>${l}</span></button>`).join('')}</div>
        <div style="margin-top:14px" class="small muted">Le bout des doigts</div><div class="chips" style="margin-top:6px">${[['ok', 'Ça va'], ['sensibles', 'Sensibles'], ['douloureux', 'Douloureux']].map(([v, l]) => `<button class="chip ${ck.tips === v ? 'on' : ''}" data-act="ck-tips" data-arg="${v}">${l}</button>`).join('')}</div>
        <div style="margin-top:12px" class="small muted">Main, poignet, avant-bras</div><div class="chips" style="margin-top:6px">${[['non', 'Rien à signaler'], ['gene', 'Gêne'], ['douleur', 'Douleur']].map(([v, l]) => `<button class="chip ${ck.pain === v ? 'on' : ''}" data-act="ck-pain" data-arg="${v}">${l}</button>`).join('')}</div>
        <div style="margin-top:14px">${ck.form ? btn('ck-ok', 'Préparer ma séance', 'primary block') : '<p class="tiny faint">Choisis ton énergie, puis le reste si besoin.</p>'}</div></div>`;
    } else h += planCard(currentPlan());
    const song = St.workSong(s);
    if (song) {
      const rd = St.readiness(s, song);
      h += `<div class="card"><div class="row between"><div class="grow"><div class="small muted">Ta chanson</div><h3>${esc(song.title)}</h3><p class="small muted" style="margin-top:2px">${rd && rd.bottleneck ? esc(rd.bottleneck.text) : 'Prête : joue-la en entier !'}</p></div>${U.ready(rd ? rd.score : 0)}</div><div style="margin-top:10px">${btn('open-song', 'Ouvrir', 'small', song.id)}</div></div>`;
    } else h += `<div class="card flat"><h3>Quelle chanson veux-tu jouer ?</h3><p class="small muted" style="margin:4px 0 10px">Colle la grille d’une chanson que tu aimes : l’entraînement se règle sur ses accords, ses changements et sa rythmique.</p>${btn('new-song', 'Ajouter une chanson', 'block')}</div>`;
    if (s.intent) h += `<div class="card flat"><div class="small muted">Ton intention (fin de dernière séance)</div><p style="margin-top:4px">« ${esc(s.intent)} »</p></div>`;
    if (s.profile.plan && s.profile.plan.when) h += `<p class="small muted">Ton créneau : ${esc(s.profile.plan.when)}${s.profile.plan.where ? ', ' + esc(s.profile.plan.where) : ''}. La guitare sortie de sa housse, à portée de main.</p>`;
    const pain = (s.health.painDays || []).filter(x => St.dayDiff(x, St.today()) < 14).length;
    if (pain >= 3) h += `<div class="notice bad">Douleur signalée ${pain} fois en 2 semaines. Raccourcis les séances, fais des pauses, allège la pression des doigts — et si elle persiste, consulte (médecin ou kiné habitué aux musiciens).</div>`;
    const sinceExport = s.lastExport ? St.dayDiff(s.lastExport, St.today()) : null;
    if (s.sessions.length >= 3 && (sinceExport == null || sinceExport >= 7)) h += `<div class="card flat"><div class="row between"><div><h3>Sauvegarde</h3><p class="small muted" style="margin-top:2px">${sinceExport == null ? 'Jamais exportée' : 'Dernière il y a ' + sinceExport + ' jours'} : tout est sur ce téléphone.</p></div>${btn('export', 'Exporter', 'small')}</div></div>`;
    h += `<div class="row wrap">${btn('tool', 'Accordeur', 'small', 'tuner')}${btn('tool', 'Métronome', 'small', 'metro')}${btn('quick', 'Changements libres', 'small', 'minute')}${btn('quick', 'Cartes', 'small', 'cartes')}${btn('quick', 'Bilan', 'small', 'bilan')}</div>`;
    h += '</section>';
    return h;
  }
  function weekCount(s, week) {
    const n = s.sessions.filter(x => !x.partial && x.type !== 'libre' && St.dayDiff(s.program.start, x.date) >= 0 && St.programWeek(s, x.date) === week).length;
    const goal = s.profile.daysPerWeek || 5;
    return `<div class="small muted" style="margin-top:10px">Cette semaine : <b>${Math.min(n, 9)}/${goal}</b> séances${n >= goal ? ' ✓' : ''}</div>`;
  }
  function planCard(plan) {
    if (!plan) return '';
    if (plan.type === 'R' && plan.title.startsWith('Pas de')) return `<div class="card"><h2>${esc(plan.title)}</h2>${plan.notes.map(n => `<p class="notice bad" style="margin-top:10px">${esc(n)}</p>`).join('')}<div class="row" style="margin-top:12px">${btn('start', 'Oreille et théorie (6 min)', 'primary grow')}${btn('ck-reset', 'Modifier', 'ghost')}</div></div>`;
    const rows = plan.items.map(it => {
      const ex = C.EX[it.ex];
      if (!ex) return '';
      const n = it.sec && !it.takes && !it.fixed ? Math.round(it.sec / 60 * 10) / 10 + ' min' : it.fixed ? it.fixed.length + ' prise' + (it.fixed.length > 1 ? 's' : '') : it.ladder ? 'échelle' : it.takes + (it.takes > 1 ? ' prises' : ' prise');
      return `<div class="row between small"><span>${esc(it.label || (it.mix ? it.mix.map(id => C.EX[id].name).join(' ⇄ ') : ex.name))}${it.isNew ? ' <span class="tag accent">nouveau</span>' : ''}</span><span class="faint">${n}</span></div>`;
    }).join('');
    return `<div class="card"><div class="row between"><span class="tag accent">Séance du jour</span><span class="small muted">≈ ${plan.minutes} min</span></div>
      <h2 style="margin-top:8px">${esc(plan.title || P.TYPE_NAMES[plan.type])}</h2>
      ${plan.focus && plan.focus.length ? `<div class="chips" style="margin-top:8px">${plan.focus.map(f => `<span class="chip">${esc(f)}</span>`).join('')}</div>` : ''}
      ${plan.newChord ? `<div style="margin-top:10px">${U.diagram(plan.newChord, { size: 'small', label: '' })}</div>` : ''}
      <ul class="small muted" style="margin:10px 0 0;padding-left:18px">${plan.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
      ${plan.notes.map(n => `<p class="notice" style="margin-top:10px">${esc(n)}</p>`).join('')}
      <details style="margin-top:10px"><summary class="small" style="color:var(--accent)">Voir le détail</summary><div class="col" style="margin-top:8px">${rows}</div></details>
      <div style="margin-top:14px">${btn('start', '▶ Commencer', 'primary big block')}</div>
      <div class="row" style="margin-top:8px">${btn('plan-min', '−5 min', 'small grow', '-5')}${btn('plan-min', '+5 min', 'small grow', '5')}${btn('plan-type', 'Changer', 'small grow')}${btn('ck-reset', 'Forme', 'small ghost')}</div></div>`;
  }
  U.on('ck-form', v => { todayRec().checkin.form = +v; save(); U.render(); });
  U.on('ck-tips', v => { todayRec().checkin.tips = v; save(); U.render(); });
  U.on('ck-pain', v => { const t = todayRec(); t.checkin.pain = v; if (v === 'douleur') { const s = S(); s.health.painDays = (s.health.painDays || []).filter(d => d !== t.date).concat([t.date]).slice(-60); } save(); U.render(); });
  U.on('ck-ok', () => { const c = todayRec().checkin; if (c.form) { c.ok = true; save(); U.render(); } });
  U.on('ck-reset', () => { todayRec().checkin.ok = false; save(); U.render(); });
  U.on('extra', () => { todayRec().extra = true; todayRec().checkin.ok = false; save(); U.render(); });
  U.on('plan-min', v => { const t = todayRec(); t.minutes = Math.max(8, Math.min(60, (t.minutes || S().profile.sessionMin || 20) + (+v))); save(); U.render(); });
  U.on('plan-type', () => { const t = todayRec(), order = [null, 'M', 'O', 'C', 'R']; t.force = order[(order.indexOf(t.force) + 1) % order.length]; save(); U.render(); U.toast(t.force ? 'Séance « ' + P.TYPE_NAMES[t.force] + ' »' : 'Séance choisie par le programme'); });
  U.on('start', () => { const p = currentPlan(); if (p) { todayRec().extra = false; U.startSession(p); } });
  U.on('resume', () => { const s = S(); if (s.current) U.startSession(s.current.plan, s.current); });
  U.on('drop-current', () => { S().current = null; save(); U.render(); });
  U.on('open-song', id => { songOpen = id; screen = 'songs'; recList = null; U.render(); window.scrollTo(0, 0); });
  U.on('new-song', () => { songEdit = { title: '', text: '', tempo: 90, strum: 'r4', bpc: 4 }; songOpen = null; screen = 'songs'; U.render(); window.scrollTo(0, 0); });
  U.on('tool', id => { screen = 'tools'; toolOpen = id; U.render(); window.scrollTo(0, 0); });
  /** Séance d'un seul exercice (bibliothèque, raccourcis) : « exercice libre ». */
  function single(exId, extra) {
    const s = S(), ex = C.EX[exId];
    const plan = { type: 'libre', title: ex.name, minutes: 5, block: P.block(St.programWeek(s)).n, items: [Object.assign({ ex: exId, takes: ex.kind === 'quiz' ? 1 : 3, comp: ex.comp }, extra || {})], targetP: M.TARGET_P, notes: [], reasons: [] };
    U.startSession(plan);
  }
  U.on('quick', what => {
    const s = S();
    if (what === 'bilan') { const plan = P.bilanPlan(s, { date: St.today(), week: St.programWeek(s), block: P.block(St.programWeek(s)).n, reasons: [], notes: [], items: [] }, s.bilans.length ? 'etape' : 'entree'); U.startSession(plan); }
    else single(what);
  });
  U.on('lib-start', id => single(id));

  /* ================================================================ PROGRÈS */
  function progress() {
    const s = S(), ov = M.overall(s.skills);
    let h = topbar('Progrès') + '<section class="screen">';
    h += `<div class="card hero"><div class="row between"><div><div class="small muted">Niveau global</div><div class="big-num">${fr(ov)}</div><div class="muted" style="margin-top:4px">${esc(M.label(ov))}</div></div><div class="col" style="align-items:flex-end"><span class="tag">${s.sessions.filter(x => !x.partial).length} séances</span><span class="tag">${s.vocab.length} accords</span></div></div><p class="tiny faint" style="margin-top:10px">Échelle 0–10 : 2 intermédiaire · 4 confirmé · 6 avancé · 8 expert. La bande claire montre l’incertitude : elle se resserre avec les mesures.</p></div>`;
    for (const [pid, pil] of Object.entries(M.PILLARS)) {
      const comps = M.COMPS.filter(c => c.pillar === pid);
      h += `<div class="card"><h3 style="color:${pil.color}">${esc(pil.name)}</h3><div class="col" style="margin-top:10px">${comps.map(c => {
        const sk = s.skills[c.id], lo = Math.max(0, sk.th - sk.sd), hi = Math.min(10, sk.th + sk.sd);
        const past = sk.hist.length > 1 ? sk.hist.find(x => St.dayDiff(x[0], St.today()) <= 14) : null;
        const trend = past ? sk.th - past[1] : 0;
        return `<div class="skill" title="${esc(c.what)}"><span>${esc(c.short)}</span><div class="bar"><u style="left:${lo * 10}%;width:${(hi - lo) * 10}%"></u><b style="width:${sk.th * 10}%;background:${pil.color}"></b></div><span class="small" style="text-align:right">${fr(sk.th)}${trend > 0.25 ? ' ↑' : trend < -0.25 ? ' ↓' : ''}</span></div>`;
      }).join('')}</div></div>`;
    }
    // changements par minute : les paires travaillées
    const pairs = Object.entries(s.pairs).filter(([, p]) => p.best > 0).sort((a, b) => b[1].n - a[1].n).slice(0, 8);
    h += `<div class="card"><h3>Changements par minute</h3><p class="small muted" style="margin-top:2px">Ton record sur chaque paire d’accords (propres, en une minute).</p>${pairs.length ? `<table class="t" style="margin-top:8px"><tr><th>Paire</th><th class="n">Record</th><th class="n">Récent</th></tr>${pairs.map(([k, p]) => { const [a, b] = k.split('|'); return `<tr><td>${esc(vSym(a))} ⇄ ${esc(vSym(b))}</td><td class="n"><b>${p.best}</b></td><td class="n">${p.ema != null ? Math.round(p.ema) : '—'}</td></tr>`; }).join('')}</table>` : '<p class="small faint" style="margin-top:6px">Pas encore mesuré.</p>'}</div>`;
    const ser = s.series;
    const block = (title, key, unit, o) => `<div class="card flat"><div class="row between"><h3>${title}</h3><span class="small muted">${ser[key] && ser[key].length ? fr(ser[key][ser[key].length - 1][1], 0) + ' ' + unit : '—'}</span></div>${o && o.help ? `<p class="tiny faint" style="margin-top:2px">${esc(o.help)}</p>` : ''}${U.spark(ser[key], Object.assign({ label: title }, o || {}))}</div>`;
    h += block('Régularité au clic', 'timingSd', 'ms', { minSpan: 8, color: 'var(--accent2)', help: 'Écart-type de tes coups autour du clic (exercice Pulsation). Plus bas = plus régulier.' });
    h += block('Meilleur changements/min du jour', 'cpm', '/min', { minSpan: 6 });
    if (ser.jnd && ser.jnd.length) h += block('Oreille fine (seuil)', 'jnd', 'c', { minSpan: 4, color: 'var(--info)', help: 'Plus petit écart de hauteur entendu. Un écart de 10 cents s’entend dans un accord.' });
    if (ser.stress && ser.stress.length) h += block('Stress en filage', 'stress', '/5', { minSpan: 2, color: 'var(--warn)' });
    // rythmiques réussies
    const pats = Object.entries(s.patterns).filter(([, p]) => p.best > 0);
    if (pats.length) h += `<div class="card"><h3>Rythmiques</h3><div class="col" style="margin-top:8px">${pats.map(([id, p]) => `<div class="row between small"><span>${esc((T.strum(id) || {}).name || id)}</span><span>${p.best} BPM${s.chant[id] ? ' · en chantant ' + s.chant[id].best : ''}</span></div>`).join('')}</div></div>`;
    // vocabulaire
    h += `<div class="card"><h3>Tes accords</h3><p class="small muted" style="margin:2px 0 8px">Vert : propres et rapides · orange : en cours · gris : pas encore vérifiés.</p><div class="chips">${s.vocab.map(id => { const m = St.mastered(s, id), c = s.chords[id]; return `<span class="chip" style="${m ? 'border-color:var(--good);color:var(--good)' : c && c.n ? 'border-color:var(--accent)' : ''}">${esc(vSym(id))}${T.voicing(id) && T.voicing(id).variant ? '<small class="faint"> ·' + esc(T.voicing(id).variant.split(' ')[0]) + '</small>' : ''}</span>`; }).join('')}</div></div>`;
    const cal = St.calibRate(s);
    h += `<div class="card"><h3>Ton écoute</h3><p class="small muted" style="margin-top:4px">Quand tu devines avant de voir le résultat : combien de fois ton ressenti correspond à la mesure. C’est ce qui te guidera quand tu joueras seul.</p><div class="big-num" style="font-size:32px;margin-top:8px">${cal == null ? '—' : U.pct(cal)}</div><p class="tiny faint">${s.calib.n} estimations</p></div>`;
    if (s.bilans.length) h += `<div class="card"><h3>Bilans</h3><table class="t" style="margin-top:8px"><tr><th>Date</th><th>Type</th><th class="n">Global</th></tr>${s.bilans.map(b => `<tr><td>${esc(U.dateFr(b.date))}</td><td>${b.kind === 'entree' ? 'Entrée' : 'Semaine ' + b.week}</td><td class="n">${fr(b.overall)}</td></tr>`).join('')}</table></div>`;
    const last = s.sessions.slice(-12).reverse();
    if (last.length) h += `<div class="card"><h3>Dernières séances</h3><div class="list" style="margin-top:6px">${last.map(x => { const m = x.takes.filter(t => t.y != null || t.self != null), ok = m.filter(won).length; return `<div class="row between small"><span>${esc(U.dateFr(x.date))} · ${esc(P.TYPE_NAMES[x.type] || x.type)}${x.partial ? ' (partielle)' : ''}</span><span class="faint">${x.minutes || 0} min${m.length ? ' · ' + ok + '/' + m.length : ''}</span></div>`; }).join('')}</div></div>`;
    h += '</section>';
    return h;
  }

  /* ================================================================ CHANSONS */
  const EXAMPLES = [
    { title: 'Exemple : pop I–V–vi–IV', text: '[Couplet]\nG D Em C\nG D Em C\n[Refrain]\nC G D Em\nC G D', tempo: 92, strum: 'r4', note: 'La boucle la plus utilisée de la pop (Let It Be, With or Without You…). En Sol, sans capo.' },
    { title: 'Exemple : ballade I–vi–IV–V', text: '[Couplet]\nG Em C D\nG Em C D\n[Refrain]\nEm C G D\nEm C G D', tempo: 70, strum: 'r6', note: 'Le schéma de Perfect (Ed Sheeran, capo 1) ou Stand By Me. Ballade lente.' },
    { title: 'Exemple : folk 3 accords', text: '| G | G | C | G |\n| G | G | D | D |\n| C | C | G | Em |\n| C | D | G | G |', tempo: 100, strum: 'r3', note: 'Trois accords et une rythmique folk : pour bien commencer.' },
    { title: 'Exemple : mineur percussif', text: '[Couplet]\nAm F C G\nAm F C G', tempo: 96, strum: 'r8', note: 'i–♭VI–♭III–♭VII avec frappes sur 2 et 4, le groove acoustique moderne.' },
  ];
  function songs() {
    const s = S();
    if (songEdit) return songEditor();
    if (songOpen) { const song = s.songs.find(x => x.id === songOpen); if (song) return songDetail(song); songOpen = null; }
    let h = topbar('Chansons') + '<section class="screen">';
    h += `<p class="muted">Colle la grille d’une chanson que tu veux jouer (copiée d’un site de tablatures, en ChordPro, ou en mesures « | C | G | »). L’entraînement se règle dessus : ses accords, ses changements, sa rythmique.</p>`;
    h += btn('new-song', '+ Ajouter une chanson', 'primary block');
    if (s.songs.length) h += `<div class="card"><div class="list">${s.songs.map(song => { const rd = St.readiness(s, song); return `<div class="ex-row" data-act="open-song" data-arg="${song.id}">${U.ready(rd ? rd.score : 0)}<div class="grow"><b>${esc(song.title)}</b>${song.id === s.workSong ? ' <span class="tag accent">en travail</span>' : ''}<div class="small muted">${esc(song.artist || '')}${song.artist ? ' · ' : ''}${song.tempo} BPM${rd && rd.bottleneck ? ' · ' + esc(rd.bottleneck.text) : ''}</div></div></div>`; }).join('')}</div></div>`;
    h += `<div class="card flat"><h3>Pour démarrer : des grilles types</h3><div class="list" style="margin-top:6px">${EXAMPLES.map((e, i) => `<div class="ex-row" data-act="song-example" data-arg="${i}"><div class="ic">♪</div><div class="grow"><b>${esc(e.title)}</b><div class="small muted">${esc(e.note)}</div></div></div>`).join('')}</div></div>`;
    h += '</section>';
    return h;
  }
  function songEditor() {
    const e = songEdit;
    let h = topbar(e.id ? 'Modifier la chanson' : 'Nouvelle chanson', { act: 'song-cancel' }) + '<section class="screen">';
    const parsed = e.text ? T.parseSong(e.text) : null;
    h += `<label class="field">Titre<input type="text" data-input="se-title" value="${esc(e.title)}" placeholder="Titre de la chanson"></label>
      <label class="field">Artiste<input type="text" data-input="se-artist" value="${esc(e.artist || '')}" placeholder="(facultatif)"></label>
      <label class="field">Grille (accords, avec ou sans paroles)<textarea data-input="se-text" placeholder="[Couplet]&#10;G D Em C&#10;…&#10;&#10;ou : | C | G | Am | F |&#10;ou : [C]paroles [G]ici">${esc(e.text)}</textarea></label>`;
    if (parsed) h += `<div class="card flat"><p class="small">${parsed.uniq.length ? 'Accords trouvés : <b>' + parsed.uniq.map(x => esc(T.pretty(x))).join(' · ') + '</b>' : '<span class="faint">' + esc(parsed.warnings[0] || '') + '</span>'}${parsed.capo ? ' · capo ' + parsed.capo + ' indiqué' : ''}</p></div>`;
    h += `<div class="row"><label class="field grow">Tempo (BPM)<input type="number" min="40" max="200" data-input="se-tempo" value="${e.tempo}"></label><label class="field grow">Temps par accord<select data-change="se-bpc">${[[8, '2 mesures'], [4, '1 mesure'], [2, '½ mesure']].map(([v, l]) => `<option value="${v}" ${e.bpc === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <label class="field">Rythmique<select data-change="se-strum">${T.STRUMS.map(p => `<option value="${p.id}" ${e.strum === p.id ? 'selected' : ''}>${esc(p.name)} (${esc(p.slots)})</option>`).join('')}</select></label>
      <p class="tiny faint">Le tempo : tape-le avec l’outil Métronome (« taper le tempo ») en écoutant la chanson. Les paroles collées restent sur ton téléphone.</p>
      ${btn('song-save', 'Enregistrer', 'primary big block')}${e.id ? btn('song-delete', 'Supprimer cette chanson', 'ghost small') : ''}</section>`;
    return h;
  }
  U.on('se-title', v => { songEdit.title = v; });
  U.on('se-artist', v => { songEdit.artist = v; });
  U.on('se-text', v => { songEdit.text = v; clearTimeout(songEdit._t); songEdit._t = setTimeout(() => { const ta = document.activeElement; const pos = ta && ta.selectionStart; U.render(); const t2 = document.querySelector('[data-input="se-text"]'); if (t2 && pos != null) { t2.focus(); t2.setSelectionRange(pos, pos); } }, 900); });
  U.on('se-tempo', v => { songEdit.tempo = Math.max(40, Math.min(200, +v || 90)); });
  U.on('se-bpc', v => { songEdit.bpc = +v; });
  U.on('se-strum', v => { songEdit.strum = v; });
  U.on('song-cancel', () => { songEdit = null; U.render(); });
  U.on('song-example', i => { const e = EXAMPLES[+i]; songEdit = { title: e.title.replace('Exemple : ', ''), text: e.text, tempo: e.tempo, strum: e.strum, bpc: 4 }; U.render(); });
  U.on('song-save', () => {
    const s = S(), e = songEdit;
    clearTimeout(e._t);
    const parsed = T.parseSong(e.text);
    if (!parsed.seq.length) { U.toast('Aucun accord reconnu dans la grille.'); return; }
    if (e.id) { const song = s.songs.find(x => x.id === e.id); Object.assign(song, { title: e.title || song.title, artist: e.artist || '', text: e.text, tempo: e.tempo, strum: e.strum, bpc: e.bpc }); songOpen = song.id; }
    else { const song = St.makeSong(e.text, { title: e.title, artist: e.artist, tempo: e.tempo, strum: e.strum, bpc: e.bpc }); s.songs.push(song); if (!s.workSong) s.workSong = song.id; songOpen = song.id; }
    songEdit = null; planCache = null; save(); U.render(); window.scrollTo(0, 0);
  });
  U.on('song-delete', () => { const s = S(); if (!songEdit || !songEdit.id) return; if (!songEdit._armed) { songEdit._armed = true; U.toast('Touche encore pour supprimer.'); return; } s.songs = s.songs.filter(x => x.id !== songEdit.id); if (s.workSong === songEdit.id) s.workSong = s.songs[0] ? s.songs[0].id : null; songEdit = null; songOpen = null; save(); U.render(); });
  function songDetail(song) {
    const s = S(), info = St.songInfo(song), rd = info.ok ? St.readiness(s, song, info) : null;
    let h = topbar(song.title, { act: 'song-back' }) + '<section class="screen">';
    if (!info.ok) return h + `<p class="notice">${esc(info.warnings[0] || 'Grille illisible.')}</p>${btn('song-edit', 'Modifier', 'block')}</section>`;
    h += `<div class="card hero"><div class="row between"><div class="grow"><div class="small muted">${esc(song.artist || '')}${info.key ? (song.artist ? ' · ' : '') + 'en ' + esc(T.keyName(T.mod12(info.key.tonic), info.key.minor)) : ''}</div><h2>Prête à ${Math.round(100 * (rd ? rd.score : 0))} %</h2><p class="small muted" style="margin-top:4px">${rd && rd.bottleneck ? 'À travailler : ' + esc(rd.bottleneck.text) : 'Tout est en place : filage !'}</p></div>${U.ready(rd ? rd.score : 0)}</div>
      <div class="row wrap" style="margin-top:10px">${song.id === s.workSong ? '<span class="tag accent">Chanson en travail</span>' : btn('song-work', 'Travailler cette chanson', 'small primary', song.id)}${btn('song-play', '▶ Jouer avec moi', 'small')}${btn('song-edit', 'Modifier', 'small ghost')}</div></div>`;
    // capo
    const opts = info.capoOptions;
    h += `<div class="card"><h3>Capodastre ${info.capo ? 'case ' + info.capo : ': aucun'}</h3><p class="small muted" style="margin:4px 0 8px">Même son, formes plus faciles. Choisis aussi selon ta voix : « Transposer » monte ou descend toute la chanson.</p><div class="chips">${opts.map(o => `<button class="chip ${o.capo === info.capo ? 'on' : ''}" data-act="song-capo" data-arg="${o.capo}">Capo ${o.capo} · ${esc(o.shapes.map(T.pretty).join(' '))}</button>`).join('')}</div><div class="row" style="margin-top:8px">${btn('song-tr', '− ½ ton', 'small', '-1')}<span class="small muted">Transposition : ${song.transpose > 0 ? '+' : ''}${song.transpose || 0}</span>${btn('song-tr', '+ ½ ton', 'small', '1')}</div>${info.simplified.length ? `<p class="tiny faint" style="margin-top:6px">Simplifié : ${info.simplified.map(x => esc(T.pretty(x.shape)) + ' → ' + esc(T.pretty(x.as))).join(', ')}.</p>` : ''}</div>`;
    h += `<div class="card"><h3>Les accords à jouer</h3>${U.diagrams(info.uniq, { size: 'small' })}</div>`;
    if (rd && rd.changes.length) h += `<div class="card"><h3>Changements</h3><p class="small muted" style="margin:2px 0 8px">Il te faut ≈ ${rd.changes[0].need} changements/min (tempo ${song.tempo}, avec de la marge).</p>${rd.changes.map(c => `<div class="row between small" style="padding:4px 0"><span>${esc(vSym(c.a))} ⇄ ${esc(vSym(c.b))} <span class="faint">×${c.n}</span></span><span>${c.best ? c.best + '/min' : 'à mesurer'} ${c.ratio >= 1 ? '✓' : ''}</span></div>`).join('')}<div style="margin-top:8px">${btn('song-minute', 'Travailler le plus faible', 'small', rd.changes[0].a + '|' + rd.changes[0].b)}</div></div>`;
    h += `<div class="card"><h3>Rythmique : ${esc((T.strum(song.strum) || {}).name || '')}</h3><div style="margin-top:8px">${U.pattern(song.strum)}</div><p class="small muted" style="margin-top:6px">${rd ? 'Ton record : ' + ((s.patterns[song.strum] || {}).best || 0) + ' BPM · en chantant : ' + ((s.chant[song.strum] || {}).best || 0) + ' BPM' : ''}</p></div>`;
    h += `<div class="card"><h3>Grille</h3>${info.sections.map(sec => `<h3 class="small muted" style="margin-top:10px">${esc(sec.name)}</h3><div class="grid" style="margin-top:4px">${sec.bars.map(b => `<div class="barc">${b.map(vSym).join(' ')}</div>`).join('')}</div>${sec.lines.some(l => l.lyrics) ? `<div class="lyrics small" style="margin-top:6px">${sec.lines.filter(l => l.lyrics || l.chords.length).map(l => (l.chords.length ? `<span class="ch">${l.chords.map(c => esc(T.pretty(T.transposeSym(c, -info.capo)))).join(' ')}</span>  ` : '') + esc(l.lyrics || '')).join('\n')}</div>` : ''}`).join('')}</div>`;
    h += `<div class="card"><h3>Tes prises</h3><div id="recBox" class="list" style="margin-top:6px"><p class="small faint">…</p></div></div>`;
    h += `<div class="card flat"><h3>Échéance</h3><p class="small muted" style="margin:4px 0 8px">Une date où tu veux la jouer (anniversaire, scène ouverte) : les dernières séances s’allègent pour arriver en forme.</p><div class="row"><input type="date" data-change="song-deadline" value="${s.deadline && s.deadline.song === song.id ? esc(s.deadline.date) : ''}">${s.deadline && s.deadline.song === song.id ? btn('song-deadline-clear', 'Retirer', 'small ghost') : ''}</div></div>`;
    h += '</section>';
    return h;
  }
  async function loadRecs() {
    const id = songOpen; if (!id) return;
    recList = await Store.listRecs(r => r.kind === 'song' && r.song === id);
    const box = document.getElementById('recBox'); if (!box) return;
    box.innerHTML = recList.length ? recList.slice(0, 12).map(r => `<div class="row between small"><span>${esc(U.dateFr(new Date(r.ts).toISOString().slice(0, 10)))} · ${esc(r.label || '')} · ${Math.round(r.sec)} s</span><span class="row">${btn('rec-play', '▶', 'small', r.id)}${btn('rec-keep', r.keep ? '★' : '☆', 'small ghost', r.id)}</span></div>`).join('') : '<p class="small faint">Aucune prise pour l’instant : elles s’enregistrent pendant les exercices « Ma chanson » et « Filage ».</p>';
  }
  U.on('rec-play', async id => { A.stopAll(); const r = await Store.getRec(id); if (r) A.playPcm(r.pcm, r.sr); });
  U.on('rec-keep', async id => { const r = (recList || []).find(x => x.id === id); await Store.keepRec(id, !(r && r.keep)); recList = null; U.render(); });
  U.on('song-back', () => { songOpen = null; recList = null; A.stopAll(); U.render(); });
  U.on('song-edit', () => { const song = S().songs.find(x => x.id === songOpen); if (song) { songEdit = { id: song.id, title: song.title, artist: song.artist, text: song.text, tempo: song.tempo, strum: song.strum, bpc: song.bpc }; U.render(); } });
  U.on('song-work', id => { S().workSong = id; planCache = null; save(); U.render(); U.toast('Les séances vont se régler sur cette chanson.'); });
  U.on('song-capo', v => { const song = S().songs.find(x => x.id === songOpen); if (song) { song.capo = +v; planCache = null; save(); U.render(); } });
  U.on('song-tr', v => { const song = S().songs.find(x => x.id === songOpen); if (song) { song.transpose = Math.max(-6, Math.min(6, (song.transpose || 0) + +v)); song.capo = null; planCache = null; save(); U.render(); A.ensure().then(() => { const info = St.songInfo(song); if (info.ok) A.play({ kind: 'progression', seq: info.seq.slice(0, 4), bpc: 2, tempo: song.tempo }); }); } });
  U.on('song-deadline', v => { const s = S(), song = s.songs.find(x => x.id === songOpen); if (!song) return; s.deadline = v ? { date: v, label: song.title, song: song.id } : null; save(); U.render(); });
  U.on('song-deadline-clear', () => { S().deadline = null; save(); U.render(); });
  U.on('song-minute', key => { const [a, b] = key.split('|'); const s = S(); [a, b].forEach(id => St.introduce(s, id)); save(); single('minute', { fixed: null, takes: 3, focus: [a, b] }); });
  U.on('song-play', async () => {
    const s = S(), song = s.songs.find(x => x.id === songOpen); if (!song) return;
    const info = St.songInfo(song); if (!info.ok) return;
    await A.ensure(); A.stopAll();
    const seq = info.sections.flatMap(sec => C.sectionSeq(sec));
    const sc = C.rhythmScore({ strum: song.strum, seq, bpc: 2, tempo: song.tempo, bars: Math.ceil(seq.length / 2) });
    const t0 = A.now() + 0.3; A.scheduleScore(sc, t0);
    U.toast('Lecture de la grille — touche « Chansons » pour arrêter.', 3000);
  });

  /* ================================================================ STUDIO */
  let studio = null;
  function studioState() {
    const s = S();
    if (!studio) studio = { key: s.studioKey != null ? s.studioKey : 7, minor: false, prog: ['I', 'V', 'vi', 'IV'], tempo: 88, strum: 'r4', bpc: 4, idea: null };
    return studio;
  }
  function studio() {
    const s = S(), st = studioState();
    const syms = st.prog.map(dg => T.degreeChord(dg, st.key));
    const vids = syms.map(x => { const p = T.playable(x); return p ? p.v.id : null; });
    const capo = T.capoOptions(syms)[0];
    let h = topbar('Studio') + '<section class="screen">';
    h += `<p class="muted">Construis une grille, écoute-la, garde tes idées. Les accords de la tonalité sont tous « justes » ensemble ; les emprunts (en pointillé) apportent de la couleur.</p>`;
    h += `<div class="card"><div class="chips">${[0, 2, 4, 5, 7, 9, 10].map(k => `<button class="chip ${k === st.key ? 'on' : ''}" data-act="st-key" data-arg="${k}">${esc(T.keyName(k, false))}</button>`).join('')}</div>
      <h3 style="margin-top:12px">Ta grille</h3><div class="prog" style="margin-top:6px">${st.prog.map((dg, i) => `<button class="pc" data-act="st-del" data-arg="${i}"><b>${esc(T.pretty(syms[i]))}</b><span>${esc(dg)}</span></button>`).join('') || '<span class="small faint">Touche les accords ci-dessous.</span>'}</div>
      ${st.prog.length ? `<p class="tiny faint" style="margin-top:4px">Touche un accord de la grille pour l’enlever.${capo && capo.capo ? ' Plus facile : capo ' + capo.capo + ' (' + esc(capo.shapes.map(T.pretty).join(' ')) + ').' : ''}</p>` : ''}
      ${(() => { const sg = st.prog.length ? T.suggestNext(st.prog) : []; return sg.length ? `<div class="small muted" style="margin-top:8px">Et après ? ${sg.map(x => `<button class="chip" data-act="st-add" data-arg="${esc(x.deg)}">${esc(x.deg)} · ${esc(T.pretty(T.degreeChord(x.deg, st.key)))}</button>`).join(' ')}</div>${sg[0].why ? `<p class="tiny faint" style="margin-top:4px">${esc(sg[0].why)}</p>` : ''}` : ''; })()}
      <div class="palette" style="margin-top:10px">${['I', 'ii', 'iii', 'IV', 'V', 'vi', '♭VII', 'iv', 'I/3', 'V7', '♭VI', 'II'].map(dg => { const b = ['♭VII', 'iv', '♭VI', 'II'].includes(dg); return `<button class="pc ${b ? 'borrowed' : ''}" data-act="st-add" data-arg="${esc(dg)}"><b>${esc(T.pretty(T.degreeChord(dg, st.key)))}</b><span>${esc(dg)}</span></button>`; }).join('')}</div></div>`;
    h += `<div class="card"><h3>Écouter</h3><div class="chips" style="margin-top:8px">${['r0', 'r1', 'r3', 'r4', 'r6', 'r8', 'r10'].map(p => `<button class="chip ${p === st.strum ? 'on' : ''}" data-act="st-strum" data-arg="${p}">${esc(T.strum(p).name)}</button>`).join('')}</div>
      <div class="row" style="margin-top:8px">${btn('st-tempo', '−', 'small', '-4')}<span class="small">${st.tempo} BPM</span>${btn('st-tempo', '+', 'small', '4')}<span class="grow"></span>${btn('st-bpc', st.bpc === 4 ? '1 accord/mesure' : st.bpc === 2 ? '2 accords/mesure' : '1 accord / 2 mesures', 'small ghost')}</div>
      <div class="row" style="margin-top:10px">${btn('st-play', '▶ Écouter en boucle', 'primary grow')}${btn('st-stop', '■', 'small')}</div>
      ${vids.filter(Boolean).length ? U.diagrams(vids.filter(Boolean), { size: 'small' }) : ''}</div>`;
    h += `<div class="card"><h3>Progressions connues</h3><p class="small muted" style="margin:2px 0 8px">Les chansons pop réutilisent quelques boucles. Pars de l’une d’elles, puis change un accord.</p><div class="list">${T.PROGRESSIONS.map(p => `<div class="ex-row" data-act="st-load" data-arg="${p.id}"><div class="ic">♪</div><div class="grow"><b>${esc(p.name)}</b><div class="small muted">${esc(p.mood)} · ${esc(p.ex)}</div></div></div>`).join('')}</div></div>`;
    h += `<div class="card"><div class="row between"><h3>Tes idées</h3>${btn('st-save', 'Garder la grille', 'small primary')}</div>${s.ideas.length ? `<div class="list" style="margin-top:6px">${s.ideas.slice(0, 30).map(idea => `<div class="row between small"><span class="grow" data-act="st-open" data-arg="${idea.id}" style="cursor:pointer"><b>${esc(idea.title || 'Idée')}</b><br><span class="faint">${esc((idea.syms || []).map(T.pretty).join(' – '))} · ${idea.tempo || ''} BPM${idea.text ? ' · paroles' : ''}</span></span><span class="row">${idea.rec ? btn('rec-play', '▶', 'small', idea.rec) : ''}${btn('st-del-idea', '✕', 'small ghost', idea.id)}</span></div>`).join('')}</div>` : '<p class="small faint" style="margin-top:6px">Tes grilles et mélodies gardées apparaîtront ici (aussi celles des ateliers de composition).</p>'}</div>`;
    h += '</section>';
    return h;
  }
  U.on('st-key', k => { const st = studioState(); st.key = +k; S().studioKey = st.key; save(); U.render(); });
  U.on('st-add', dg => { const st = studioState(); if (st.prog.length >= 8) { U.toast('8 accords maximum.'); return; } st.prog.push(dg); A.ensure().then(() => { const p = T.playable(T.degreeChord(dg, st.key)); if (p) A.play({ kind: 'strum', v: p.v.id }); }); U.render(); });
  U.on('st-del', i => { studioState().prog.splice(+i, 1); U.render(); });
  U.on('st-strum', p => { studioState().strum = p; U.render(); });
  U.on('st-tempo', d => { const st = studioState(); st.tempo = Math.max(50, Math.min(160, st.tempo + +d)); U.render(); });
  U.on('st-bpc', () => { const st = studioState(); st.bpc = st.bpc === 4 ? 2 : st.bpc === 2 ? 8 : 4; U.render(); });
  U.on('st-load', id => { const p = T.PROGRESSIONS.find(x => x.id === id); if (p) { studioState().prog = p.deg.slice(); U.render(); U.toast(p.name + ' : ' + p.mood); } });
  let loopTimer = null;
  U.on('st-play', async () => {
    const st = studioState();
    const vids = st.prog.map(dg => T.playable(T.degreeChord(dg, st.key))).filter(Boolean).map(p => p.v.id);
    if (!vids.length) return;
    await A.ensure(); A.stopAll(); clearTimeout(loopTimer);
    const loop = () => {
      const bars = Math.max(1, Math.ceil(vids.length * st.bpc / 4));
      const sc = C.rhythmScore({ strum: st.strum, seq: vids, bpc: st.bpc, tempo: st.tempo, bars });
      const t0 = A.now() + 0.1; const end = A.scheduleScore(sc, t0);
      loopTimer = setTimeout(loop, Math.max(500, (end - 1.2 - A.now()) * 1000));
    };
    loop();
  });
  U.on('st-stop', () => { clearTimeout(loopTimer); A.stopAll(); });
  U.on('st-save', () => {
    const s = S(), st = studioState();
    if (!st.prog.length) return;
    s.ideas.unshift({ id: 'i' + Date.now().toString(36), date: St.today(), task: 'studio', key: st.key, prog: st.prog.slice(), syms: st.prog.map(dg => T.degreeChord(dg, st.key)), tempo: st.tempo, strum: st.strum, title: 'Grille du ' + U.dateFr(St.today()) });
    save(); U.render(); U.toast('Idée gardée ✓');
  });
  U.on('st-open', id => { const idea = S().ideas.find(x => x.id === id); if (!idea) return; const st = studioState(); Object.assign(st, { key: idea.key, prog: idea.prog.slice(), tempo: idea.tempo || st.tempo, strum: idea.strum || st.strum }); U.render(); window.scrollTo(0, 0); });
  U.on('st-del-idea', async id => { const s = S(), idea = s.ideas.find(x => x.id === id); if (!idea) return; if (idea._armed) { s.ideas = s.ideas.filter(x => x.id !== id); if (idea.rec) await Store.deleteRec(idea.rec); save(); U.render(); } else { idea._armed = true; U.toast('Touche encore ✕ pour supprimer.'); } });

  /* ================================================================ OUTILS */
  let tunerRun = 0;
  function stopTools() { tunerRun++; A.metronome.stop(); clearTimeout(loopTimer); }
  function tools() {
    if (toolOpen === 'tuner') return topbar('Accordeur', { act: 'tool-back' }) + `<section class="screen"><div class="card"><div class="tuner" id="toolTuner"><div class="note">♪</div><p class="muted">Joue une corde à vide et laisse-la sonner.</p></div></div>
      <div class="strings6">${T.OPEN.map((n, s) => `<button class="st ${toolTunerString === s ? 'on' : ''}" data-act="tt-string" data-arg="${s}"><b>${T.STRING_NUM[s]}</b>${esc(T.STRING_FR[s].split(' ')[0])}</button>`).join('')}</div><p class="tiny faint">Choisis une corde, ou laisse l’accordeur la deviner (touche-la de nouveau pour revenir en automatique). Diapason : La = ${S().profile.tuning || 440} Hz.</p></section>`;
    if (toolOpen === 'metro') return metroScreen();
    if (toolOpen === 'dict') return dictScreen();
    if (toolOpen === 'lib') return libScreen();
    if (toolOpen === 'latency') return topbar('Latence du micro', { act: 'tool-back' }) + `<section class="screen"><p class="muted">Pour comparer tes coups au clic, il faut savoir combien de temps le son met à sortir du haut-parleur et à revenir dans le micro. C’est mesuré à chaque prise au haut-parleur ; ici tu peux le mesurer seul. Pose le téléphone, volume moyen, ne joue pas.</p>${btn('latency-run', 'Mesurer (3 s)', 'primary block')}<p class="small" id="latBox">${isFinite(S().profile.latency) ? 'Dernière mesure : ' + Math.round(1000 * S().profile.latency) + ' ms' : 'Pas encore mesurée.'}</p><p class="tiny faint">Au casque Bluetooth, la latence est longue et variable : pour les exercices de rythme, préfère le haut-parleur ou un casque filaire.</p></section>`;
    let h = topbar('Outils') + '<section class="screen">';
    const row = (id, ic, title, sub) => `<div class="ex-row" data-act="tool" data-arg="${id}"><div class="ic">${ic}</div><div class="grow"><b>${title}</b><div class="small muted">${sub}</div></div></div>`;
    h += `<div class="card"><div class="list">${row('tuner', '🎯', 'Accordeur', 'Corde par corde, avec aiguille')}${row('metro', '⏱', 'Métronome', 'Tempo, mesures, clic qui se tait, taper le tempo')}${row('dict', '🖐', 'Dictionnaire d’accords', 'Formes, doigtés, son')}${row('lib', '🧩', 'Exercices au choix', 'Lancer un exercice précis')}${row('latency', '📡', 'Latence du micro', 'Pour un rythme mesuré au plus juste')}</div></div>`;
    h += '</section>';
    return h;
  }
  U.on('tool-back', () => { stopTools(); toolOpen = null; U.render(); });
  let toolTunerString = null;
  U.on('tt-string', s => { toolTunerString = toolTunerString === +s ? null : +s; U.render(); });
  async function startToolTuner() {
    const my = ++tunerRun;
    try { await A.ensure(); await A.openMic(); } catch (e) { const b = document.getElementById('toolTuner'); if (b) b.innerHTML = '<p class="muted">Micro indisponible.</p>'; return; }
    const hist = [];
    while (my === tunerRun && screen === 'tools' && toolOpen === 'tuner') {
      const f = A.frame(4096), r = f ? D.tune(f.x, f.sr, A.tuning) : null;
      const box = document.getElementById('toolTuner');
      if (box && r && isFinite(r.f0)) {
        const s = toolTunerString, target = s != null ? T.OPEN[s] : r.target, c0 = 100 * (r.midi - target);
        if (Math.abs(c0) < 300) hist.push(c0); if (hist.length > 5) hist.shift();
        const c = D.median(hist), ok = Math.abs(c) <= 4;
        box.innerHTML = `<div class="small muted">Corde ${T.STRING_NUM[s != null ? s : r.string]} · ${esc(T.STRING_FR[s != null ? s : r.string])}</div><div class="note">${esc(T.noteName(target))}</div><div class="gauge"><div class="scale"></div><div class="needle ${ok ? 'ok' : ''}" style="left:${50 + Math.max(-50, Math.min(50, c))}%"></div></div><div class="cents">${c > 0 ? '+' : ''}${Math.round(c)} cents · ${ok ? 'juste ✓' : c < 0 ? 'trop bas' : 'trop haut'}</div>`;
      }
      await U.sleep(90);
    }
    A.closeMic();
  }
  let metroState = { tempo: 80, sig: 4, sub: 1, silent: false, kind: 'bois' }, taps = [];
  function metroScreen() {
    const m = metroState;
    return topbar('Métronome', { act: 'tool-back' }) + `<section class="screen"><div class="card center"><div class="big-num">${m.tempo}</div><div class="muted">BPM</div><div class="beatdots" id="mDots" style="margin-top:12px">${Array.from({ length: m.sig }, (_, i) => `<i class="${i === 0 ? 'first' : ''}"></i>`).join('')}</div>
      <div class="row" style="justify-content:center;margin-top:12px">${btn('m-tempo', '−5', 'small', '-5')}${btn('m-tempo', '−1', 'small', '-1')}${btn('m-tempo', '+1', 'small', '1')}${btn('m-tempo', '+5', 'small', '5')}</div>
      <div style="margin-top:12px">${btn('m-toggle', A.metronome.on ? '■ Arrêter' : '▶ Démarrer', 'primary big block')}</div>${btn('m-tap', 'Taper le tempo', 'block')}</div>
      <div class="card"><div class="small muted">Mesure</div><div class="chips" style="margin-top:6px">${[2, 3, 4, 6].map(v => `<button class="chip ${m.sig === v ? 'on' : ''}" data-act="m-sig" data-arg="${v}">${v} temps</button>`).join('')}</div>
      <div class="small muted" style="margin-top:10px">Subdivision</div><div class="chips" style="margin-top:6px">${[[1, 'Noires'], [2, 'Croches'], [4, 'Doubles']].map(([v, l]) => `<button class="chip ${m.sub === v ? 'on' : ''}" data-act="m-sub" data-arg="${v}">${l}</button>`).join('')}</div>
      <label class="switch"><span>Le clic se tait (2 mesures sur 4) : pour muscler ta pulsation intérieure</span><input type="checkbox" data-change="m-silent" ${m.silent ? 'checked' : ''}></label>
      <div class="small muted">Son</div><div class="chips" style="margin-top:6px">${[['bois', 'Bois'], ['aigu', 'Clic aigu']].map(([v, l]) => `<button class="chip ${m.kind === v ? 'on' : ''}" data-act="m-kind" data-arg="${v}">${l}</button>`).join('')}</div></div></section>`;
  }
  function metroRestart() { if (A.metronome.on) { const m = metroState; A.metronome.start({ tempo: m.tempo, sig: m.sig, sub: m.sub, kind: m.kind, silent: m.silent ? { play: 2, mute: 2 } : null, onBeat: metroBeat }); } }
  function metroBeat(b, muted) { const d = document.getElementById('mDots'); if (d) [...d.children].forEach((x, j) => { x.classList.toggle('on', j === b); x.classList.toggle('mute', muted); }); }
  U.on('m-tempo', d => { metroState.tempo = Math.max(30, Math.min(240, metroState.tempo + +d)); metroRestart(); U.render(); });
  U.on('m-sig', v => { metroState.sig = +v; metroRestart(); U.render(); });
  U.on('m-sub', v => { metroState.sub = +v; metroRestart(); U.render(); });
  U.on('m-silent', v => { metroState.silent = !!v; metroRestart(); });
  U.on('m-kind', v => { metroState.kind = v; metroRestart(); U.render(); });
  U.on('m-toggle', async () => { await A.ensure(); if (A.metronome.on) A.metronome.stop(); else { A.metronome.on = true; metroRestart(); } U.render(); });
  U.on('m-tap', () => { const now = performance.now(); taps = taps.filter(t => now - t < 3000); taps.push(now); if (taps.length >= 3) { const iv = []; for (let i = 1; i < taps.length; i++) iv.push(taps[i] - taps[i - 1]); metroState.tempo = Math.round(60000 / D.median(iv)); metroRestart(); U.render(); } });
  function dictScreen() {
    const fams = [['open', 'Ouverts'], ['7', 'Septièmes'], ['color', 'Couleurs'], ['pop', 'Pop (doigts fixes)'], ['barre', 'Barrés']];
    const list = T.OPEN_DB.filter(v => (dictFilter === 'barre' ? T.isBarre(v) || v.tags.includes('barre-prep') : v.tags.includes(dictFilter) && (dictFilter !== 'open' || (!v.tags.includes('7') && !v.tags.includes('color') && !v.tags.includes('pop')))));
    return topbar('Dictionnaire d’accords', { act: 'tool-back' }) + `<section class="screen"><div class="chips">${fams.map(([k, l]) => `<button class="chip ${dictFilter === k ? 'on' : ''}" data-act="dict-f" data-arg="${k}">${l}</button>`).join('')}</div>
      <p class="small muted">Touche un accord pour l’entendre. Chiffres = doigts (1 index … 4 auriculaire, P pouce) ; o = corde à vide ; × = ne pas jouer.</p>
      <div class="diagrams">${list.map(v => `<button class="card flat" style="padding:8px;cursor:pointer" data-act="dict-play" data-arg="${esc(v.id)}">${U.diagram(v.id, { size: 'small' })}<div class="tiny faint">difficulté ${fr(v.d)}${S().vocab.includes(v.id) ? ' · ✓' : ''}</div></button>`).join('')}</div></section>`;
  }
  U.on('dict-f', f => { dictFilter = f; U.render(); });
  U.on('dict-play', async id => { await A.ensure(); A.stopAll(); A.play({ kind: 'arp', v: id, gap: 0.18 }); });
  function libScreen() {
    const groups = [['gauche', 'Main gauche'], ['droite', 'Main droite & rythme'], ['oreille', 'Oreille & harmonie'], ['musique', 'Musique']];
    let h = topbar('Exercices au choix', { act: 'tool-back' }) + '<section class="screen"><p class="muted">Chaque exercice se règle sur ton niveau (difficulté pour réussir environ 4 prises sur 5).</p>';
    for (const [pid, title] of groups) {
      const exs = C.EXERCISES.filter(e => e.pillar === pid);
      h += `<div class="card"><h3>${title}</h3><div class="list" style="margin-top:6px">${exs.map(e => `<div><div class="row between"><b>${esc(e.name)}</b>${btn('lib-start', 'Lancer', 'small', e.id)}</div><p class="small muted" style="margin-top:4px">${esc(e.why)}</p></div>`).join('')}</div></div>`;
    }
    return h + '</section>';
  }
  U.on('latency-run', async () => {
    const box = document.getElementById('latBox');
    try { await A.ensure(); await A.openMic(); } catch (e) { if (box) box.textContent = 'Micro indisponible.'; return; }
    if (box) box.textContent = 'Mesure…';
    A.startRec(); await U.sleep(300);
    const t0 = A.now() + 0.2, times = [];
    for (let i = 0; i < 8; i++) { const t = t0 + i * 0.3; A.clickAt(t, true, 'aigu'); times.push(t); }
    await U.sleep(3000);
    const r = A.stopRec(); A.closeMic();
    const x = D.prepare(r.pcm, r.sr).x, rec0 = r.t0 != null ? r.t0 : t0 - 0.5;
    const L = D.measureLatency(x, times.map(t => t - rec0));
    if (L) { S().profile.latency = +L.latency.toFixed(4); save(); if (box) box.textContent = 'Latence mesurée : ' + Math.round(1000 * L.latency) + ' ms (±' + Math.round(L.spread) + ' ms).'; }
    else if (box) box.textContent = 'Je n’ai pas entendu les clics : monte le volume et recommence (pas de casque).';
  });

  /* ================================================================ RÉGLAGES */
  function settings() {
    const s = S(), p = s.profile;
    const sw = (k, label, sub) => `<label class="switch"><span>${label}${sub ? `<br><span class="tiny faint">${sub}</span>` : ''}</span><input type="checkbox" data-change="pf-bool" data-arg="${k}" ${p[k] ? 'checked' : ''}></label>`;
    let h = topbar('Réglages', { act: 'go', arg: 'home' }) + '<section class="screen">';
    h += `<div class="card"><h3>Toi</h3><div class="col" style="margin-top:8px"><label class="field">Prénom<input type="text" data-change="pf-text" data-arg="name" value="${esc(p.name)}"></label>
      <div class="small muted">Objectifs</div><div class="chips">${[['accompagner', 'M’accompagner en chantant'], ['composer', 'Composer'], ['picking', 'Jouer aux doigts']].map(([k, l]) => `<button class="chip ${p.goals[k] ? 'on' : ''}" data-act="pf-goal" data-arg="${k}">${l}</button>`).join('')}</div>
      <label class="field">Quand je joue (créneau fixe)<input type="text" data-change="pf-plan" data-arg="when" value="${esc(p.plan.when)}" placeholder="ex. après le dîner"></label>
      <label class="field">Où<input type="text" data-change="pf-plan" data-arg="where" value="${esc(p.plan.where)}" placeholder="ex. dans le salon, guitare sur son stand"></label>
      <p class="tiny faint">Décider à l’avance « quand et où » augmente nettement les chances de s’y tenir (intentions de mise en œuvre : Gollwitzer & Sheeran 2006).</p></div></div>`;
    h += `<div class="card"><h3>Séances</h3><div class="col" style="margin-top:8px"><label class="field">Durée<select data-change="pf-num" data-arg="sessionMin">${[10, 15, 20, 25, 30, 40].map(v => `<option value="${v}" ${p.sessionMin === v ? 'selected' : ''}>${v} min</option>`).join('')}</select></label>
      <label class="field">Séances par semaine<select data-change="pf-num" data-arg="daysPerWeek">${[3, 4, 5, 6, 7].map(v => `<option value="${v}" ${p.daysPerWeek === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <p class="tiny faint">Mieux vaut 15–20 minutes presque tous les jours qu’une longue séance par semaine : la pratique répartie consolide mieux (Simmons 2012) et ménage le bout des doigts.</p></div></div>`;
    h += `<div class="card"><h3>Son et micro</h3>${sw('mic', 'Micro (mesures)', 'Sans micro, tu t’auto-évalues.')}${sw('predict', 'Deviner avant de voir', 'Parfois, l’appli te demande ton ressenti avant le résultat.')}${sw('lefty', 'Gaucher (diagrammes inversés)')}
      <label class="field">Clic pendant les prises<select data-change="pf-click"><option value="aigu" ${p.click !== 'bois' ? 'selected' : ''}>Aigu (haut-parleur : la latence est mesurée à chaque prise)</option><option value="bois" ${p.click === 'bois' ? 'selected' : ''}>Bois (au casque filaire)</option></select></label>
      <label class="field">Diapason (La)<select data-change="pf-num" data-arg="tuning">${[438, 440, 442].map(v => `<option value="${v}" ${p.tuning === v ? 'selected' : ''}>${v} Hz</option>`).join('')}</select></label>
      <label class="field">Thème<select data-change="pf-theme"><option value="" ${!p.theme ? 'selected' : ''}>Comme le téléphone</option><option value="dark" ${p.theme === 'dark' ? 'selected' : ''}>Sombre</option><option value="light" ${p.theme === 'light' ? 'selected' : ''}>Clair</option></select></label></div>`;
    h += `<div class="card"><h3>Sauvegarde</h3><p class="small muted" style="margin:4px 0 10px">Tout reste sur ce téléphone. Exporte de temps en temps (fichier à garder dans tes fichiers ou ton cloud).</p><div class="row">${btn('export', 'Exporter', 'grow')}<label class="btn grow">Importer<input type="file" accept=".json,application/json" data-change="import-file" style="display:none"></label></div><div style="margin-top:10px">${btn('reset-all', 'Tout effacer', 'ghost small')}</div></div>`;
    h += `<div class="card flat">${btn('go', 'Comment ça marche (la science)', 'block', 'science')}<p class="tiny faint center" style="margin-top:8px">ACCORD ${esc(AC.VERSION || '')}</p></div>`;
    return h + '</section>';
  }
  U.on('pf-bool', (v, el2) => { S().profile[el2.dataset.arg] = !!v; save(); });
  U.on('pf-text', (v, el2) => { S().profile[el2.dataset.arg] = String(v).slice(0, 40); save(); });
  U.on('pf-num', (v, el2) => { S().profile[el2.dataset.arg] = +v; if (el2.dataset.arg === 'tuning') A.tuning = +v; planCache = null; save(); });
  U.on('pf-plan', (v, el2) => { S().profile.plan[el2.dataset.arg] = String(v).slice(0, 80); save(); });
  U.on('pf-goal', k => { const g = S().profile.goals; g[k] = !g[k]; planCache = null; save(); U.render(); });
  U.on('pf-click', v => { S().profile.click = v; save(); });
  U.on('pf-theme', v => { S().profile.theme = v || null; save(); U.applyTheme(); });
  U.on('export', () => {
    const s = S(), blob = new Blob([St.exportJSON(s)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'accord-' + St.today() + '.json'; document.body.appendChild(a); a.click(); a.remove();
    s.lastExport = St.today(); save(); U.render();
  });
  U.on('import-file', (v, el2) => {
    const f = el2.files && el2.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { try { const st = St.importJSON(rd.result); st.onboarded = true; U.setState(st); planCache = null; screen = 'home'; U.render(); U.toast('Sauvegarde importée ✓'); } catch (e) { U.toast(e.message, 4000); } };
    rd.readAsText(f);
  });
  let resetArmed = 0;
  U.on('reset-all', () => { if (Date.now() - resetArmed < 3000) { Store.clear(); U.setState(St.newState()); onbStep = 0; screen = 'home'; U.render(); } else { resetArmed = Date.now(); U.toast('Touche encore pour TOUT effacer (pense à exporter avant).', 3000); } });

  /* ================================================================ SCIENCE */
  U.SOURCES = [
    ['Ericsson, Krampe & Tesch-Römer (1993). The role of deliberate practice in the acquisition of expert performance. Psychological Review 100(3).', 'Pratique délibérée : objectifs précis, retour immédiat, travail ciblé sur les points faibles.'],
    ['Macnamara, Hambrick & Oswald (2014). Deliberate practice and performance in music, games, sports, education, and professions: a meta-analysis. Psychological Science 25(8).', 'La quantité de pratique ne fait pas tout : sa qualité compte au moins autant.'],
    ['Duke, Simmons & Cash (2009). It’s not how much; it’s how: characteristics of practice behavior and retention of performance skills. Journal of Research in Music Education 56(4).', 'Repérer l’endroit exact de l’erreur, le corriger, varier le tempo logiquement, répéter jusqu’à ce que ce soit stable.'],
    ['Wilson, Shenhav, Straccia & Cohen (2019). The Eighty Five Percent Rule for optimal learning. Nature Communications 10:4646.', 'Difficulté réglée pour réussir environ 80 % des prises.'],
    ['Guadagnoli & Lee (2004). Challenge point: a framework for conceptualizing the effects of various practice conditions in motor learning. Journal of Motor Behavior 36(2).', 'La difficulté optimale suit ton niveau.'],
    ['Maxwell, Masters, Kerr & Weedon (2001). The implicit benefit of learning without errors. Quarterly Journal of Experimental Psychology 54A(4).', 'Un geste nouveau démarre facile (peu d’erreurs) : plus robuste ensuite, même avec une tâche en plus.'],
    ['Shea & Morgan (1979). Contextual interference effects on the acquisition, retention, and transfer of a motor skill. JEP: Human Learning and Memory 5(2).', 'Alterner les exercices connus fait mieux retenir que les répéter en bloc.'],
    ['Carter & Grahn (2016). Optimizing music learning: exploring how blocked and interleaved practice schedules affect advanced performance. Frontiers in Psychology 7:1251.', 'L’alternance vaut aussi pour les musiciens.'],
    ['Abushanab & Bishara (2013). Memory and metacognition for piano melodies: illusory advantages of fixed- over random-order practice. Memory & Cognition 41.', 'La répétition en bloc donne l’illusion de progresser plus vite ; le mélange retient mieux.'],
    ['Simmons (2012). Distributed practice and procedural memory consolidation in musicians’ skill learning. Journal of Research in Music Education 59(4).', 'Des séances espacées (d’un jour à l’autre) consolident mieux.'],
    ['Walker et al. (2002). Practice with sleep makes perfect: sleep-dependent motor skill learning. Neuron 35 · Simmons & Duke (2006). Effects of sleep on performance of a keyboard melody. JRME 54(3).', 'Le sommeil consolide les gestes travaillés.'],
    ['Allen (2013). Memory stabilization and enhancement following music practice. Psychology of Music 41(6).', 'Deux gestes nouveaux et proches dans la même séance se gênent : un seul accord nouveau par séance.'],
    ['Simmons, Allen, Cash & Duke (2019). Effects of early break intervals on musicians’ and nonmusicians’ skill learning. Psychology of Music 47(1).', 'Une courte pause sans geste en cours de séance aide.'],
    ['Cash, Allen, Simmons & Duke (2014). Effects of model performances on music skill acquisition and overnight memory consolidation. JRME 62(1).', 'Écouter un modèle avant de jouer accélère l’apprentissage.'],
    ['Wulf & Lewthwaite (2016). Optimizing performance through intrinsic motivation and attention for learning: the OPTIMAL theory of motor learning. Psychonomic Bulletin & Review 23.', 'Confiance, autonomie, attention tournée vers l’effet produit.'],
    ['Chua, Jimenez-Diaz, Lewthwaite, Kim & Wulf (2021). Superiority of external attentional focus for motor performance and learning. Psychological Bulletin 147(6) · Duke, Cash & Allen (2011). Focus of attention affects performance of motor skills in music. JRME 59(1).', 'Consignes tournées vers le son (la corde qui sonne) plutôt que vers les muscles. Effet probablement plus modeste qu’annoncé, mais sans coût.'],
    ['McKay et al. (2022). Meta-analytic findings of the self-controlled motor learning literature: underpowered, biased, and lacking evidence of benefit. Meta-Psychology 6.', 'Laisser choisir n’améliore probablement pas l’apprentissage lui-même : les choix (chanson, durée) servent ta motivation.'],
    ['Salmoni, Schmidt & Walter (1984). Knowledge of results and motor learning. Psychological Bulletin 95(3) · Guadagnoli & Kohl (2001). Journal of Motor Behavior 33(2).', 'Retour après la prise, bref ; deviner avant de voir entraîne l’écoute de soi.'],
    ['Roediger & Karpicke (2006). Test-enhanced learning. Psychological Science 17(3) · Cepeda et al. (2006). Distributed practice in verbal recall tasks. Psychological Bulletin 132(3).', 'Cartes : se tester et espacer les révisions.'],
    ['Ye, Su & Cao (2022). A stochastic shortest path algorithm for optimizing spaced repetition scheduling. KDD (FSRS).', 'Ordonnanceur des cartes (révision quand le souvenir tombe à 90 %).'],
    ['Beilock, Carr, MacMahon & Starkes (2002). When paying attention becomes counterproductive. Journal of Experimental Psychology: Applied 8(1).', 'Un geste automatisé résiste à une tâche en plus : chanter en jouant, par paliers.'],
    ['Repp (2005). Sensorimotor synchronization: a review of the tapping literature. Psychonomic Bulletin & Review 12(6).', 'Se caler sur un clic, l’anticipation naturelle, la régularité.'],
    ['Micheyl, Delhommeau, Perrot & Oxenham (2006). Influence of musical and psychoacoustical training on pitch discrimination. Hearing Research 219 · King-Smith et al. (1994). Vision Research 34(7).', 'Oreille fine : entraînable ; seuil estimé par ZEST.'],
    ['Bigand & Poulin-Charronnat (2006). Are we “experienced listeners”? Cognition 100.', 'L’intuition harmonique existe déjà : l’oreille la rend explicite.'],
    ['de Clercq & Temperley (2011). A corpus analysis of rock harmony. Popular Music 30(1).', 'I, IV, V, vi dominent ; IV mène souvent à I : les suggestions du Studio.'],
    ['von Hippel & Huron (2000). Why do skips precede reversals? Music Perception 18(1).', 'Mélodies : petits pas, et retour après un grand saut.'],
    ['Gollwitzer & Sheeran (2006). Implementation intentions and goal achievement: a meta-analysis. Advances in Experimental Social Psychology 38 · Lally et al. (2010). European Journal of Social Psychology 40.', 'Décider quand et où jouer ; une habitude met des semaines à s’installer.'],
    ['Oudejans & Pijpers (2009). Training with anxiety has a positive effect on expert perceptual–motor performance under pressure. QJEP 62(8).', 'Filages sous légère pression.'],
    ['Zaza (1998). Playing-related musculoskeletal disorders in musicians: a systematic review. CMAJ 158(8).', 'Les douleurs liées au jeu sont fréquentes : séances courtes, pauses, consulter si ça persiste.'],
    ['Böck & Widmer (2013). Maximum filter vibrato suppression for onset detection. DAFx · Böck, Krebs & Schedl (2012). ISMIR · Bello et al. (2005). IEEE TSAP 13(5).', 'Détection des coups (attaques).'],
    ['Mauch & Dixon (2010). Approximate note transcription for the improved identification of difficult chords. ISMIR · Fujishima (1999). ICMC.', 'Reconnaissance des accords.'],
    ['de Cheveigné & Kawahara (2002). YIN, a fundamental frequency estimator for speech and music. JASA 111(4).', 'Accordeur et suivi de la voix.'],
    ['Karplus & Strong (1983) · Jaffe & Smith (1983). Computer Music Journal 7(2).', 'Guitare de synthèse des modèles.'],
  ];
  function science() {
    let h = topbar('Comment ça marche', { act: 'go', arg: 'settings' }) + '<section class="screen">';
    h += `<div class="card"><h3>Ce que mesure le micro</h3><ul class="small" style="margin:8px 0 0;padding-left:18px">
      <li><b>Chaque coup</b> : sa place par rapport au clic (± quelques millisecondes), les coups manqués et les coups en trop. Les clics du métronome sont aigus et repérés dans la prise : la latence du téléphone est mesurée à chaque fois.</li>
      <li><b>Les accords</b> : l’empreinte de chaque doigté (notes exactes, octaves comprises) est comparée au son ; une corde jouée à vide au lieu de sa case, une case voisine ou une corde à éviter qui sonne sont signalées.</li>
      <li><b>Corde par corde</b> : quelle corde est étouffée, laquelle sonne faux, et quelle note j’entends à la place.</li>
      <li><b>Changements par minute</b> : seuls les changements reconnus et propres comptent.</li>
      <li><b>Pulsation</b> : quand le clic se tait, le tempo réellement tenu et la dérive.</li>
      <li><b>Accordage</b> : les 6 cordes d’un seul coup (à ±1 cent sur nos tests), puis l’aiguille corde par corde.</li>
      <li>Testé sur des guitares de synthèse réalistes (cordes inharmoniques, micro de téléphone, réverbération, bruit). Une corde étouffée dans un accord gratté ne s’entend pas toujours : l’exercice « corde par corde » est là pour ça. Si la mesure te semble fausse, dis-le (« Mesure fausse ? »).</li></ul></div>`;
    h += `<div class="card"><h3>Comment tu progresses</h3><ul class="small" style="margin:8px 0 0;padding-left:18px">
      <li>Chaque compétence a un niveau estimé ; chaque exercice est généré pour que tu réussisses environ 4 prises sur 5. Un exercice nouveau démarre plus facile.</li>
      <li>Ta chanson pilote l’entraînement : ses accords, ses changements (« il te faut 34 changements/min »), sa rythmique, puis la chanter en jouant.</li>
      <li>Un accord nouveau au plus par séance, d’abord travaillé seul, puis mélangé aux autres. Les exercices connus alternent.</li>
      <li>Retour bref après la prise ; parfois tu devines d’abord. Cartes de théorie en répétition espacée. Bilans toutes les 4 semaines.</li>
      <li>Forme du jour, état des doigts, charge de la semaine, pauses et échéance ajustent la séance.</li></ul></div>`;
    h += `<div class="card"><h3>Mains et doigts</h3><ul class="small" style="margin:8px 0 0;padding-left:18px"><li>Les premières semaines, le bout des doigts fait mal : c’est normal, les cals se forment avec des séances courtes et fréquentes.</li><li>Appuie juste assez pour que la note sonne ; garde épaules et poignet souples.</li><li>Douleur dans la main, le poignet ou l’avant-bras : on arrête. Si elle persiste ou revient, consulte.</li></ul></div>`;
    h += `<div class="card"><h3>Sources</h3><ol class="small" style="margin:8px 0 0;padding-left:18px">${U.SOURCES.map(([ref, why]) => `<li style="margin-bottom:8px">${esc(ref)}<br><span class="faint">${esc(why)}</span></li>`).join('')}</ol></div>`;
    return h + '</section>';
  }

  /* ================================================================ PREMIER LANCEMENT */
  function onboarding() {
    const s = S();
    if (onbStep === 0) return `<section class="screen" style="padding-top:calc(40px + env(safe-area-inset-top))"><div class="brand" style="font-size:18px"><i></i>ACCORD</div><h1 style="font-size:32px">La guitare pour t’accompagner en chantant, et composer.</h1>
      <div class="col" style="margin-top:6px">${[['🎯', 'Mesuré au micro', 'chaque coup au clic près, chaque accord, chaque corde.'], ['🎵', 'Ta chanson au centre', 'l’entraînement se règle sur ses accords et sa rythmique.'], ['🧠', 'Pédagogie fondée sur la recherche', 'difficulté ajustée, retours brefs, alternance, répétition espacée.'], ['✍️', 'Composer', 'grilles, mélodies, idées gardées.']].map(([e, t, d]) => `<div class="row" style="align-items:flex-start"><div style="font-size:24px">${e}</div><div><b>${t}</b><div class="small muted">${d}</div></div></div>`).join('')}</div>
      <p class="small muted">Rien ne quitte ton téléphone : pas de compte, pas de serveur.</p>${btn('onb', 'Commencer', 'primary big block', '1')}</section>`;
    if (onbStep === 1) {
      const corde = St.readCorde(k => Store.getJSON(k));
      return `<section class="screen" style="padding-top:calc(30px + env(safe-area-inset-top))"><h1>D’où pars-tu ?</h1>
        ${corde ? `<div class="card hero"><div class="small muted">Données de l’app Corde trouvées sur ce téléphone</div><p class="small" style="margin-top:4px">${corde.days} jours de pratique (jusqu’au jour ${corde.maxDay}), ${corde.records} records. Proposition : <b>${esc(St.START_LEVELS[corde.suggest].label)}</b>.</p></div>` : ''}
        <div class="col">${Object.entries(St.START_LEVELS).map(([k, v]) => `<button class="btn block ${s.profile.start === k ? 'sel' : ''}" data-act="onb-level" data-arg="${k}">${esc(v.label)}</button>`).join('')}</div>
        <p class="tiny faint">C’est un point de départ : le bilan d’entrée (15–20 min, au micro) mesurera ton vrai niveau.</p></section>`;
    }
    return `<section class="screen" style="padding-top:calc(30px + env(safe-area-inset-top))"><h1>Tes objectifs</h1>
      <div class="chips">${[['accompagner', 'M’accompagner en chantant'], ['composer', 'Composer mes chansons'], ['picking', 'Jouer aux doigts']].map(([k, l]) => `<button class="chip ${s.profile.goals[k] ? 'on' : ''}" data-act="pf-goal" data-arg="${k}">${l}</button>`).join('')}</div>
      <div class="card"><h3>Ton rythme</h3><div class="col" style="margin-top:8px"><label class="field">Durée des séances<select data-change="pf-num" data-arg="sessionMin">${[10, 15, 20, 25, 30].map(v => `<option value="${v}" ${s.profile.sessionMin === v ? 'selected' : ''}>${v} min</option>`).join('')}</select></label>
      <label class="field">Séances par semaine<select data-change="pf-num" data-arg="daysPerWeek">${[3, 4, 5, 6, 7].map(v => `<option value="${v}" ${s.profile.daysPerWeek === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <label class="field">Quand vas-tu jouer ?<input type="text" data-change="pf-plan" data-arg="when" value="${esc(s.profile.plan.when)}" placeholder="ex. chaque soir après le dîner"></label>
      <label class="field">Où sera ta guitare ?<input type="text" data-change="pf-plan" data-arg="where" value="${esc(s.profile.plan.where)}" placeholder="ex. sur son stand, dans le salon"></label>
      <p class="tiny faint">Décider quand et où, et laisser la guitare sortie, aide beaucoup à tenir.</p></div></div>
      <div class="card"><h3>Le programme (16 semaines)</h3><div class="col small" style="margin-top:8px">${P.BLOCKS.map(b => `<div><b>Semaines ${b.from}–${b.to} · ${esc(b.name)}</b><div class="muted">${esc(b.goal)}</div></div>`).join('')}</div></div>
      ${btn('onb-done', 'C’est parti', 'primary big block')}</section>`;
  }
  U.on('onb', v => { onbStep = +v; U.render(); window.scrollTo(0, 0); });
  U.on('onb-level', k => { St.applyStart(S(), k); onbStep = 2; save(); U.render(); window.scrollTo(0, 0); });
  U.on('onb-done', () => { const s = S(); if (!s.vocab.length) St.applyStart(s, s.profile.start || 'debut'); s.onboarded = true; s.program.start = St.today(); save(); Store.persist(); screen = 'home'; U.render(); window.scrollTo(0, 0); });
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== app.js ==== */
/* ACCORD — démarrage. */
(function (root) {
  'use strict';
  const AC = root.AC, U = AC.ui, St = AC.state, Store = AC.store;
  let state = null;
  U.state = () => state;
  U.setState = s => { state = St.migrate(s); Store.save(state, true); };
  function boot() {
    let s = null;
    try { s = Store.load(); } catch (e) { s = null; }
    state = s ? St.migrate(s) : St.newState();
    U.applyTheme();
    if (AC.audio) { AC.audio.tuning = state.profile.tuning || 440; AC.audio.setUserVolume(state.profile.volume || 1); }
    let warned = false;
    Store.onError = () => { if (!warned) { warned = true; U.toast('Sauvegarde impossible (mémoire du navigateur pleine ?). Exporte tes données dans Réglages.', 6000); } };
    U.render();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') Store.flush(); });
    root.addEventListener('pagehide', () => Store.flush());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !U.inSession()) U.render(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
