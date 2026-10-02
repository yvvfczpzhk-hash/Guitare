/* ==== ui-session.js ==== */
/* ACCORD — lecteur de séance : accordage, échauffement, blocs d'exercices, prises au micro calées sur le
   métronome, analyse, verdict et retour bref ; quiz d'oreille et cartes ; ateliers de composition. */
(function (root) {
  'use strict';
  const AC = root.AC;
  const U = AC.ui, T = AC.theory, D = AC.dsp, M = AC.model, C = AC.catalog, St = AC.state, P = AC.planner, A = AC.audio, Store = AC.store, R = AC.srs;
  const ABORT = new Error('abort'), SKIP = new Error('skip');
  const esc = U.esc, btn = U.btn, fr = U.fr;
  let RS = null;          // séance en cours
  let el = null;          // conteneur plein écran
  const S = () => U.state();
  const save = () => Store.save(S());
  const vSym = id => C.vSym(id);

  /* ------------------------------------------------------------ cadre */
  function frame(body, foot, o) {
    o = o || {};
    if (!el) return;
    const items = RS.plan.items;
    const prog = items.map((it, i) => `<i class="${i < RS.idx ? 'done' : i === RS.idx ? 'cur' : ''}"></i>`).join('');
    el.innerHTML = `<div class="sess-head"><button class="iconbtn" data-act="sess-quit" aria-label="Quitter la séance">${U.icon('close', 22)}</button><div class="sess-prog" aria-hidden="true">${prog}</div><span class="small muted">${Math.round(activeMs() / 60000)}/${RS.plan.minutes} min</span></div>
      <div class="sess-body" id="sessBody">${o.title ? `<div><div class="small muted">${esc(o.kicker || '')}</div><h2>${esc(o.title)}</h2>${o.sub ? `<p class="small muted" style="margin-top:4px">${esc(o.sub)}</p>` : ''}</div>` : ''}${body}</div>
      <div class="sess-foot">${foot || ''}</div>`;
  }
  const stage = (label, sub, visual) => `<div class="stage">${visual || ''}<div class="label" aria-live="polite">${esc(label)}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;

  /* ------------------------------------------------------------ écran allumé, arrière-plan */
  let wake = null;
  async function keepAwake() { if (wake || !navigator.wakeLock || document.visibilityState !== 'visible') return; try { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => { wake = null; }); } catch (e) { wake = null; } }
  function releaseAwake() { try { if (wake) wake.release(); } catch (e) { /* rien */ } wake = null; }
  document.addEventListener('visibilitychange', () => {
    if (!RS) return;
    if (document.visibilityState === 'hidden') { RS.hidden++; RS.hiddenAt = Date.now(); }
    else { if (RS.hiddenAt) { RS.pausedMs += Date.now() - RS.hiddenAt; RS.hiddenAt = 0; } keepAwake(); }
  });
  document.addEventListener('click', () => { if (RS && !wake) keepAwake(); }, true);
  const activeMs = () => (RS ? Date.now() - RS.t0 - (RS.pausedMs || 0) - (RS.hiddenAt ? Date.now() - RS.hiddenAt : 0) : 0);
  async function ensureSound(head) {
    await A.ensure();
    while (!A.running()) {
      frame(stage('Le son est en pause', 'Le téléphone l’a coupé (appel, verrouillage, autre app). Touche le bouton pour le relancer.', '<div style="font-size:44px">🔇</div>'), btn('audio-wake', '🔊 Relancer le son', 'primary big block'), head);
      await U.wait(['audio-wake']);
      await A.ensure();
    }
  }

  /* ------------------------------------------------------------ démarrage */
  let starting = false;
  U.startSession = async function (plan, resume) {
    if (RS || starting) return;
    starting = true;
    keepAwake();
    try { await A.ensure(); } catch (e) { starting = false; U.toast('Audio indisponible sur ce navigateur.'); return; }
    starting = false;
    if (RS) return;
    U.resetAbort();
    const s = S();
    A.tuning = s.profile.tuning || 440;
    A.setUserVolume(s.profile.volume || 1);
    A.clickKind = s.profile.click === 'bois' ? 'bois' : 'aigu';
    el = document.createElement('div'); el.className = 'sess'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Séance');
    document.body.appendChild(el); document.body.style.overflow = 'hidden';
    const sess = resume ? resume.sess : St.startSession(s, plan);
    RS = { plan, sess, idx: resume ? resume.idx : 0, t0: resume ? Date.now() - (resume.elapsed || 0) : Date.now(), mic: false, hidden: 0, hiddenAt: 0, pausedMs: 0, last: null, lastRec: null };
    const needsMic = plan.items.some(it => (it.mix || [it.ex]).some(id => C.EX[id] && ['play', 'tune', 'song', 'compose'].includes(C.EX[id].kind)));
    if (s.profile.mic && needsMic) {
      frame(stage('Accès au micro', 'Le micro écoute ta guitare pour mesurer tes accords et ton rythme. Rien n’est envoyé : tout reste sur ton téléphone.', '<div class="pulse"></div>'), '');
      try { await A.openMic(); RS.mic = true; } catch (e) { RS.mic = false; U.toast('Micro indisponible : tu t’auto-évalueras.', 3500); }
    }
    try {
      for (; RS.idx < plan.items.length; RS.idx++) { saveCurrent(); await runItem(plan.items[RS.idx]); }
      await endSession(false);
    } catch (e) {
      if (e !== ABORT) { console.error(e); U.toast('Erreur : ' + e.message, 4000); }
      await endSession(true);
    }
  };
  function saveCurrent() { S().current = { plan: RS.plan, sess: RS.sess, idx: RS.idx, elapsed: activeMs(), date: St.today() }; save(); }
  U.on('sess-quit', () => {
    if (!RS) return;
    if (RS.quitArmed && Date.now() - RS.quitArmed < 2500) { A.stopAll(); if (A.isRecording()) A.stopRec(); U.abortWaits(ABORT); RS.aborted = true; return; }
    RS.quitArmed = Date.now(); U.toast(RS.plan.type === 'libre' ? 'Touche encore ✕ pour quitter.' : 'Touche encore ✕ pour quitter (tu pourras reprendre la séance).');
  });
  U.inSession = () => !!RS;

  /* ------------------------------------------------------------ blocs */
  async function runItem(item) {
    const ex = C.EX[item.ex || item.mix[0]];
    if (!ex) return;
    if (ex.kind === 'tune') return runTune(item);
    if (item.sec && !item.takes && !item.fixed) return runGuided(ex, item);
    const ids = item.mix || [item.ex];
    const n = item.fixed ? item.fixed.length : item.ladder ? item.ladder.length : item.takes;
    RS.item = item;
    RS.block = { fails: 0, offset: 0, stop: false, ladderFails: 0, n };
    try { await intro(ex, item); } catch (e) { if (e === SKIP) return; throw e; }
    for (let k = 0; k < n; k++) {
      const e = C.EX[ids[k % ids.length]];
      if (item.mix && k > 0 && k < ids.length) { try { await intro(e, item, true); } catch (x) { if (x === SKIP) return; throw x; } }
      let again = true;
      while (again) {
        const out = await runTake(e, item, k);
        again = out === 'retry';
        if (out === 'skip') return;
      }
      if (RS.block.stop) break;
    }
  }
  async function intro(ex, item, compact) {
    const s = S(), first = !s.items[ex.id];
    const how = ex.how.map(h => `<li>${esc(h)}</li>`).join('');
    const kicker = (item.bilan ? 'Bilan · ' : '') + (ex.comp ? M.COMP[ex.comp].name : 'Préparation') + (first ? ' · nouveau' : '');
    const body = `<div class="card flat"><p>${esc(ex.why)}</p><ul style="margin:10px 0 0;padding-left:20px">${how}</ul></div><div class="cue">${esc(ex.cue)}</div>` +
      (item.mix ? '<p class="small muted">Bloc alterné : les deux exercices se mélangent (on retient mieux qu’en les répétant chacun en bloc).</p>' : '') +
      (item.newChord ? `<div class="card flat">${U.diagram(item.fixed[0].v, { size: 'big' })}<p class="small muted center" style="margin-top:6px">Nouvel accord. Pose les doigts un par un la première fois, puis essaie de les poser ensemble.</p></div>` : '');
    frame(body, btn('go', 'Commencer', 'primary big block') + (compact ? '' : btn('skip-block', 'Passer ce bloc', 'ghost small')), { kicker, title: item.label || ex.name });
    const a = await U.wait(['go', 'skip-block']);
    if (a.act === 'skip-block') throw SKIP;
  }

  /* ------------------------------------------------------------ guidé */
  async function runGuided(ex, item) {
    const st = ex.steps({ sec: item.sec }, St.ctx(S(), RS.plan))[0];
    const total = item.sec, t0 = Date.now();
    const how = ex.how.map(h => `<li>${esc(h)}</li>`).join('');
    const kicker = ex.cooldown ? 'Retour au calme' : ex.rest ? 'Pause' : 'Échauffement';
    frame(`<div class="card flat"><ul style="margin:0;padding-left:20px">${how}</ul></div><div class="cue">${esc(ex.cue)}</div>` + stage(st.label, '', U.ring(0, Math.ceil(total) + ' s')), btn('guided-next', 'Suivant', 'primary big block'), { kicker, title: ex.name });
    if (st.play && st.play.kind === 'clicks') { await A.ensure(); A.metronome.start({ tempo: st.play.tempo || 60, sig: 4, sub: 1, kind: 'bois', silent: null, onBeat: null }); }
    const timer = setInterval(() => {
      const left = Math.max(0, total - (Date.now() - t0) / 1000);
      const ring = el && el.querySelector('.stage .ring'); if (ring) ring.outerHTML = U.ring(1 - left / total, Math.ceil(left) + ' s');
      if (left <= 0) U.fire('guided-next');
    }, 500);
    try { await U.wait(['guided-next']); } finally { clearInterval(timer); A.metronome.stop(); A.stopAll(); }
    RS.sess.takes.push({ ex: ex.id, d: 0, judged: { y: null }, guided: true });
  }

  /* ------------------------------------------------------------ accordage */
  async function runTune(item) {
    const head = { kicker: 'Préparation', title: 'Accordage' };
    if (!RS.mic) { RS.sess.takes.push({ ex: 'accordage', d: 0, judged: { y: null }, guided: true }); return; }
    const draw = (res, msg) => {
      const cells = T.OPEN.map((n, s) => {
        const r = res ? res[s] : null, c = r && r.cents != null ? r.cents : null;
        const cls = c == null ? '' : Math.abs(c) <= 6 ? 'ok' : c < 0 ? 'lo' : 'hi';
        return `<button class="st ${cls}" data-act="tune-string" data-arg="${s}"><b>${esc(T.STRING_FR[s].replace(' grave', '').replace(' aigu', ''))}</b>${c == null ? '·' : (c > 0 ? '+' : '') + Math.round(c)}</button>`;
      }).join('');
      frame(`<p class="muted">${esc(msg)}</p><div class="strings6">${cells}</div><p class="tiny faint">Touche une corde pour l’accorder seule avec l’aiguille.</p>`,
        btn('tune-strum', '● Gratter les 6 cordes à vide', 'primary big block') + btn('tune-done', 'C’est accordé, continuer', 'block'), head);
    };
    draw(null, 'Gratte les 6 cordes à vide d’un coup, laisse sonner : je vérifie chaque corde.');
    for (;;) {
      const a = await U.wait(['tune-strum', 'tune-done', 'tune-string']);
      if (a.act === 'tune-done') break;
      if (a.act === 'tune-string') { await liveTuner(+a.arg, head); draw(null, 'Re-gratte les 6 cordes pour vérifier.'); continue; }
      await ensureSound(head);
      A.startRec();
      frame(stage('Gratte les 6 cordes…', 'et laisse sonner', '<div class="rec-dot"></div>'), '', head);
      await U.sleep(3200);
      const { pcm, sr } = A.stopRec();
      frame(stage('Analyse…', '', '<div class="pulse"></div>'), '', head); await U.frame();
      let res = null; try { res = D.polyTune(pcm, sr, A.tuning); } catch (e) { res = null; }
      if (!res) { draw(null, 'Je n’ai pas entendu les cordes : rapproche le téléphone (30–60 cm de la rosace) et gratte franchement.'); continue; }
      const off = res.filter(r => r.cents != null && Math.abs(r.cents) > 6);
      const unsure = res.filter(r => r.cents == null || r.conf < 0.4);
      draw(res, !off.length && !unsure.length ? 'Accordé ✓ (toutes les cordes à ±6 cents).' : off.length ? off.length + ' corde(s) à corriger : touche-la pour l’accorder avec l’aiguille.' : 'Certaines cordes ne sont pas sûres : vérifie-les une par une.');
      if (!off.length && !unsure.length) { RS.sess.takes.push({ ex: 'accordage', d: 0, judged: { y: null }, guided: true }); U.toast('Guitare accordée ✓'); await U.sleep(900); return; }
    }
    RS.sess.takes.push({ ex: 'accordage', d: 0, judged: { y: null }, guided: true });
  }
  /** Accordeur à aiguille (une corde, ou automatique si s == null). */
  async function liveTuner(s, head) {
    await ensureSound(head);
    if (!A.micAlive()) { try { await A.openMic(); } catch (e) { return; } }
    let stop = false, okSince = 0;
    frame(`<div class="tuner" id="tunerBox"></div>`, btn('tuner-close', 'Terminé', 'primary big block'), head || { title: 'Accordeur' });
    U.wait(['tuner-close']).then(() => { stop = true; }).catch(() => { stop = true; });
    const hist = [];
    while (!stop && el) {
      const fr0 = A.frame(4096);
      const r = fr0 ? D.tune(fr0.x, fr0.sr, A.tuning) : null;
      const box = document.getElementById('tunerBox');
      if (r && isFinite(r.f0)) {
        const target = s != null ? T.OPEN[s] : r.target, cents = 100 * (r.midi - target);
        if (Math.abs(cents) < 300) hist.push(cents); if (hist.length > 5) hist.shift();
        const c = D.median(hist), ok = Math.abs(c) <= 4;
        okSince = ok ? okSince || Date.now() : 0;
        const pos = 50 + Math.max(-50, Math.min(50, c));
        if (box) box.innerHTML = `<div class="small muted">${esc(s != null ? 'Corde ' + T.STRING_NUM[s] + ' · ' + T.STRING_FR[s] : 'Corde ' + T.STRING_NUM[r.string] + ' · ' + T.STRING_FR[r.string])}</div><div class="note">${esc(T.noteName(target))}</div><div class="gauge"><div class="scale"></div><div class="needle ${ok ? 'ok' : ''}" style="left:${pos}%"></div></div><div class="cents">${c > 0 ? '+' : ''}${Math.round(c)} cents · ${ok ? (Date.now() - okSince > 600 ? 'juste ✓' : 'presque…') : c < 0 ? 'trop bas : tends la corde' : 'trop haut : détends un peu, puis remonte'}</div>`;
      } else if (box && !hist.length) box.innerHTML = `<div class="note">♪</div><p class="muted">Joue la corde ${s != null ? T.STRING_NUM[s] + ' (' + esc(T.STRING_FR[s]) + ')' : ''} à vide, et laisse sonner.</p>`;
      await U.sleep(90);
    }
    U.cancel(['tuner-close']);
  }
  U.liveTuner = liveTuner;

  /* ------------------------------------------------------------ une prise */
  async function runTake(ex, item, k) {
    const s = S(), comp = ex.comp;
    const ctx = St.ctx(s, RS.plan, { takeIndex: k, block: RS.plan.block });
    let params, d;
    if (item.fixed) { params = item.fixed[Math.min(k, item.fixed.length - 1)]; d = ex.difficulty(params, ctx); }
    else if (item.ladder) { params = item.ladder[k]; d = ex.difficulty(params, ctx); }
    else {
      const it = s.items[ex.id];
      const p = !it || it.n < 2 ? Math.max(RS.plan.targetP, 0.86) : RS.plan.targetP;
      const target = M.dFor(s.skills[comp].th, p) - RS.block.offset;
      const ch = C.choose(ex, target, ctx, Math.random);
      if (!ch) return 'skip';
      params = ch.params; d = ch.d;
    }
    if (RS.retryParams && RS.retryEx === ex.id) { params = RS.retryParams; d = ex.difficulty(params, ctx); }
    RS.retryParams = null;
    const steps = ex.steps(params, ctx);
    const head = { kicker: (item.bilan ? 'Bilan · ' : '') + (comp ? M.COMP[comp].name : '') + ' · prise ' + (k + 1) + (RS.block.n ? '/' + RS.block.n : ''), title: ex.name, sub: ex.label(params, ctx) };
    let res = null, rec = null, quiz = null, song = null, compose = null;
    const multi = [];
    for (let si = 0; si < steps.length; si++) {
      const st = steps[si], nx = steps[si + 1];
      if (st.t === 'show') await stepShow(st, head, nx);
      else if (st.t === 'listen') await stepListen(st, head, nx && nx.t === 'play' ? 'À moi' : 'Suivant');
      else if (st.t === 'wait') await stepWait(st, head);
      else if (st.t === 'play') {
        const r = await stepPlay(ex, st, params, head);
        if (r.interrupted) { RS.retryParams = params; RS.retryEx = ex.id; return 'retry'; }
        res = r.res; rec = r; multi.push(r.res);
        RS.lastScore = st.score || null;
      }
      else if (st.t === 'quiz') { quiz = await runQuiz(st, head); res = quiz; }
      else if (st.t === 'song') { song = await stepSong(ex, st, head); res = song.res; rec = song; }
      else if (st.t === 'compose') { compose = await stepCompose(st, head); res = compose; }
    }
    let judged = res || ex.kind === 'quiz' || ex.kind === 'compose' ? ex.judge(res, params, ctx, { multi, score: RS.lastScore, t0: rec && rec.t0rel }) : { y: null, success: null, fb: [] };
    if (!judged) judged = { y: null, success: null, fb: [] };
    // deviner avant de voir : entraîne l'écoute de soi (Guadagnoli & Kohl 2001)
    let predicted = null, predictKind = null;
    if (ex.kind === 'play' && judged.y != null && s.profile.predict && RS.mic && !item.bilan) {
      const n = s.calib.recent.length;
      if (Math.random() < (n < 10 ? 0.5 : 0.3)) { predictKind = ['propre', 'barre', 'forme'].includes(ex.id) ? 'clean' : 'timing'; predicted = await askPredict(predictKind, head); }
    }
    let self = null;
    if (song) self = song.self;
    else if (compose) self = compose.self;
    else if (judged.y == null && (ex.kind === 'play') && !(ex.id === 'releve')) self = await askSelf(head, judged.fb);
    const take = { ex: ex.id, params, d, judged, self, predicted, predictKind, ts: Date.now() };
    const snap = St.snapshot(s, ex.id);
    St.recordTake(s, take, take.ts);
    if (ex.id === 'cartes' || ex.kind === 'quiz') { /* les cartes sont notées une à une pendant le quiz */ }
    const entry = { ex: ex.id, params, d, judged: { y: judged.y, success: judged.success, metrics: judged.metrics, observe: judged.observe }, self, predicted };
    RS.sess.takes.push(entry);
    RS.sess.load = (RS.sess.load || 0) + (ex.load != null ? ex.load : 1);
    save();
    RS.last = { snap, take, entry, block: { fails: RS.block.fails, offset: RS.block.offset } };
    adapt(item, judged.y != null ? judged.y : self);
    if (song || compose || ex.kind === 'quiz' && !judged.fb.length) return 'next';
    return showResult(ex, params, res, judged, take, rec, head);
  }
  /** Escalier du bloc : deux ratés → plus facile ; une réussite → un peu plus dur. Échelles de bilan : on monte tant que ça passe. */
  function adapt(item, y) {
    if (y == null) return;
    if (y === 0) { RS.block.fails++; if (RS.block.fails >= 2) { RS.block.offset += 0.6; RS.block.fails = 0; } }
    else if (y === 1) { RS.block.fails = 0; RS.block.offset = Math.max(0, RS.block.offset - 0.3); }
    if (item.ladder) { if (y < 1) RS.block.ladderFails++; if (RS.block.ladderFails >= 2) RS.block.stop = true; }
  }

  /* ------------------------------------------------------------ étapes */
  async function stepShow(st, head, nx) {
    let vis = '';
    if (st.songSection) vis += songGrid(st.songSection.song, st.songSection.sec);
    if (st.v && st.v.length) vis += U.diagrams(st.v, { size: st.v.length === 1 ? 'big' : null });
    if (st.pattern) vis += `<div style="margin-top:8px">${U.pattern(st.pattern)}</div>`;
    if (st.pick) vis += `<div style="margin-top:8px">${U.pickPattern(st.pick, st.v && st.v[0])}</div>`;
    if (st.text) vis += `<div class="card flat"><p>${esc(st.text)}</p></div>`;
    frame(`<div class="center"><h2>${esc(st.label || '')}</h2>${st.sub ? `<p class="muted small" style="margin-top:4px">${esc(st.sub)}</p>` : ''}</div>${vis}`, btn('show-ok', nx && nx.t === 'listen' ? 'Écouter le modèle' : 'Prêt', 'primary big block'), head);
    await U.wait(['show-ok']);
  }
  function songGrid(songId, secIdx, now, marks) {
    const s = S(), song = s.songs.find(x => x.id === songId);
    if (!song) return '';
    const info = St.songInfo(song), sec = info.ok ? info.sections[secIdx] : null;
    if (!sec) return '';
    return `<div class="grid">${sec.bars.map((b, i) => `<div class="barc ${now === i ? 'now' : ''} ${marks && marks[i] != null ? (marks[i] ? 'ok' : 'ko') : ''}">${b.map(vSym).join(' ')}</div>`).join('')}</div>`;
  }
  const volRow = () => `<div class="row" style="justify-content:center;gap:8px">${btn('vol', '🔉 −', 'small ghost', '-0.25')}<span class="small muted">Volume ${Math.round(100 * (S().profile.volume || 1))} %</span>${btn('vol', '🔊 +', 'small ghost', '0.25')}</div>`;
  function stepVolume(delta) { const p = S().profile; p.volume = Math.max(0.5, Math.min(2, Math.round(((p.volume || 1) + delta) * 100) / 100)); A.setUserVolume(p.volume); save(); }
  async function stepListen(st, head, okLabel) {
    await ensureSound(head);
    frame(stage(st.label || 'Écoute', st.sub || 'Écoute une fois, attentivement.', '<div class="pulse"></div>'), '', head);
    await A.play(st.play);
    const ready = () => frame(stage(st.label || 'Écoute', st.sub || 'Prêt ?', '<div class="pulse" style="animation:none;opacity:.5"></div>'), btn('listen-ok', okLabel || 'À moi', 'primary big block') + btn('replay-model', 'Réécouter', 'ghost block') + volRow(), head);
    ready();
    for (;;) {
      const a = await U.wait(['listen-ok', 'replay-model', 'vol']);
      if (a.act === 'listen-ok') return;
      if (a.act === 'vol') { stepVolume(+a.arg); ready(); continue; }
      await ensureSound(head); await A.play(st.play);
    }
  }
  async function stepWait(st, head) {
    frame(stage(st.label, esc(st.sub || ''), '<div style="font-size:44px">🎸</div>'), btn('wait-ok', st.button || 'Suivant', 'primary big block') + (st.replay ? btn('wait-replay', 'Réécouter', 'ghost block') : ''), head);
    for (;;) { const a = await U.wait(['wait-ok', 'wait-replay']); if (a.act === 'wait-ok') return; await ensureSound(head); await A.play(st.replay); }
  }

  /** Prise au micro. Renvoie {res, pcm, sr} ou {interrupted}. */
  async function stepPlay(ex, st, params, head) {
    const s = S(), kind = st.rec.kind;
    if (!RS.mic) return manualPlay(st, head);
    await ensureSound(head);
    if (!A.micAlive()) { try { await A.openMic(); } catch (e) { /* on tente quand même */ } }
    const hid0 = RS.hidden;
    let out;
    if (kind === 'rhythm') out = await playRhythm(ex, st, head);
    else if (kind === 'changes') out = await playChanges(st, head);
    else if (kind === 'cues') out = await playCues(st, head);
    else out = await playPlucks(st, head);
    if (RS.aborted) throw ABORT;
    if (RS.hidden !== hid0) {
      frame(stage('Prise interrompue', 'L’écran s’est verrouillé ou l’app est passée en arrière-plan : cette prise ne compte pas.', '<div style="font-size:44px">⏸</div>'), btn('retake', 'Refaire la prise', 'primary big block'), head);
      await U.wait(['retake']);
      return { interrupted: true };
    }
    frame(stage('Analyse…', '', '<div class="pulse"></div>'), '', head);
    await U.frame();
    const a4 = s.profile.tuning || 440;
    let res = null;
    try {
      if (kind === 'rhythm') {
        const spec = out.spec; spec.a4 = a4;
        res = D.analyzeRhythm(out.pcm, out.sr, spec);
        if (res && res.latencySrc === 'mesurée' && isFinite(res.latency)) {
          const L0 = s.profile.latency;
          s.profile.latency = L0 && isFinite(L0) ? +(0.7 * L0 + 0.3 * res.latency).toFixed(4) : +res.latency.toFixed(4);
        }
        if (res && st.rec.voice) { const tr = D.trackVoice(out.pcm, out.sr, { a4 }); res.voiceShare = D.voiceShare(tr, spec.events[0].t + 60 / out.score.tempo * out.score.sig, spec.events[spec.events.length - 1].t); }
      } else if (kind === 'changes') res = D.analyzeChanges(out.pcm, out.sr, { a: st.rec.a, b: st.rec.b, t0: out.t0rel, t1: out.t1rel, a4 });
      else if (kind === 'cues') res = D.analyzeCues(out.pcm, out.sr, Object.assign(out.spec, { a4 }));
      else res = D.analyzePlucks(out.pcm, out.sr, { v: st.rec.v, a4 });
    } catch (e) { console.error(e); res = null; }
    RS.lastRec = { pcm: out.pcm, sr: out.sr };
    if (st.rec.save && out.pcm && out.pcm.length) {
      try { const x22 = D.resample(out.pcm, out.sr, 22050); const song = St.workSong(s); await Store.saveRec(x22, 22050, { ex: ex.id, kind: 'song', song: song ? song.id : null, label: (song ? song.title : 'Chanson') + ' · ' + (head.sub || '') }); } catch (e) { /* stockage plein */ }
    }
    return { res, pcm: out.pcm, sr: out.sr, t0rel: out.t0rel };
  }
  /** Sans micro : on joue avec le guide (métronome, motif), puis auto-évaluation. */
  async function manualPlay(st, head) {
    if (st.score) {
      const sc = st.score, beat = 60 / sc.tempo;
      const t0 = A.now() + 0.4;
      const ck = A.scheduleClicks(sc, t0, 'bois');
      frame(stage('Joue avec le clic', 'Décompte d’une mesure', guideHtml(sc)), btn('rec-stop', 'J’ai fini', 'ghost block'), head);
      await guideLoop(sc, t0, ck.end, null);
      void beat;
    } else {
      frame(stage(st.label, esc(st.sub || ''), '<div style="font-size:44px">🎸</div>'), btn('rec-stop', 'J’ai fini', 'primary big block'), head);
      await U.wait(['rec-stop']);
    }
    return { res: null };
  }

  /* --- guide visuel pendant une prise rythmée : points de temps, case du motif, accord en cours */
  function guideHtml(sc) {
    const dots = Array.from({ length: sc.sig }, (_, i) => `<i class="${i === 0 ? 'first' : ''}"></i>`).join('');
    return `<div id="gChord" class="bigchord">${esc(vSym(sc.seq[0]))}<small id="gNext"></small></div><div class="beatdots" id="gDots">${dots}</div>${sc.strum ? `<div id="gPat" style="width:100%">${U.pattern(sc.strum)}</div>` : sc.pick ? `<div id="gPat" style="width:100%">${U.pickPattern(sc.pick, sc.seq[0])}</div>` : ''}<div id="gMsg" class="sub"></div>`;
  }
  async function guideLoop(sc, t0, tEnd, onTick) {
    const beat = 60 / sc.tempo, start = t0 + sc.countIn * beat;
    let stop = false;
    U.wait(['rec-stop']).then(a => { if (a) stop = true; }).catch(() => { stop = true; });
    let lastSlot = -2;
    while (!stop && A.now() < tEnd + 0.4) {
      if (RS && RS.aborted) break;
      const now = A.now();
      const dots = document.getElementById('gDots'), chordEl = document.getElementById('gChord'), msg = document.getElementById('gMsg');
      if (now < start) {
        const i = Math.floor((now - t0) / beat);
        if (dots) [...dots.children].forEach((d, j) => d.classList.toggle('on', j === i % sc.sig));
        if (msg) msg.textContent = 'Décompte… ' + Math.max(1, sc.countIn - i);
      } else {
        const pos = (now - start) / beat, bi = Math.floor(pos), bar = Math.floor(bi / sc.sig);
        if (dots) [...dots.children].forEach((d, j) => { d.classList.toggle('on', j === bi % sc.sig); d.classList.toggle('mute', !sc.clickBars[bar]); });
        const ci = Math.floor(pos / sc.bpc) % sc.seq.length, cur = sc.seq[ci], nxt = sc.seq[(ci + 1) % sc.seq.length];
        if (chordEl && chordEl.firstChild) chordEl.firstChild.nodeValue = vSym(cur);
        const ng = document.getElementById('gNext'); if (ng) ng.textContent = nxt !== cur ? 'ensuite : ' + vSym(nxt) : '';
        const slot = Math.floor(pos * sc.sub) % (sc.sig * sc.sub);
        if (slot !== lastSlot) { const pat = document.getElementById('gPat'); if (pat) [...pat.querySelectorAll('.slot')].forEach((x, j) => x.classList.toggle('now', j === slot)); lastSlot = slot; }
        if (msg) msg.textContent = sc.clickBars[bar] === false ? 'Le clic se tait : continue au même tempo…' : bar >= sc.bars ? '' : 'Mesure ' + (bar + 1) + '/' + sc.bars;
        if (onTick) onTick(pos);
      }
      await new Promise(r => requestAnimationFrame(r));
    }
    U.cancel(['rec-stop']);
    return stop;
  }
  async function playRhythm(ex, st, head) {
    const sc = st.score, beat = 60 / sc.tempo;
    A.startRec();
    frame(stage(st.label, esc(st.voiceText || ''), guideHtml(sc)), btn('rec-stop', 'Arrêter', 'ghost block'), head);
    await U.sleep(350);
    const t0 = A.now() + 0.5;
    const ck = A.scheduleClicks(sc, t0, A.clickKind);
    const tEnd = ck.end + 0.6;
    await guideLoop(sc, t0, tEnd);
    while (A.now() < tEnd) await U.sleep(50);
    const r = A.stopRec();
    const recT0 = r.t0 != null ? r.t0 : t0 - 0.85;
    const rel = t => t - recT0;
    const start = ck.start;
    const spec = {
      clicks: ck.times.map(c => rel(c.t)), cleanClicks: sc.countIn,
      latency: isFinite(S().profile.latency) ? S().profile.latency : A.outputLatency() + 0.03,
      events: sc.events.map(e => ({ t: rel(start + e.beat * beat), k: e.k, chord: e.v, free: !sc.clickBars[Math.floor(e.beat / sc.sig)] })),
      slot: beat / sc.sub,
      segments: sc.segments.map(g => ({ t0: rel(start + g.beat0 * beat), t1: rel(start + g.beat1 * beat), v: g.v })),
      vocab: Array.from(new Set(sc.seq)).map(id => T.voicing(id)),
    };
    return { pcm: r.pcm, sr: r.sr, spec, score: sc, t0rel: rel(start) };
  }
  async function playChanges(st, head) {
    for (const n of [3, 2, 1]) { frame(stage(String(n), esc(st.sub || ''), U.diagrams([st.rec.a, st.rec.b], { size: 'small' })), '', head); await U.sleep(700); if (RS.aborted) throw ABORT; }
    A.startRec();
    const tStart = Date.now();
    let stop = false;
    frame(stage('Alterne ! ' + vSym(st.rec.a) + ' ⇄ ' + vSym(st.rec.b), '', U.ring(0, st.sec + ' s') + U.diagrams([st.rec.a, st.rec.b], { size: 'small' })), btn('rec-stop', 'Arrêter', 'ghost block'), head);
    U.wait(['rec-stop']).then(a => { if (a) stop = true; }).catch(() => { stop = true; });
    while (!stop && (Date.now() - tStart) / 1000 < st.sec) {
      const left = st.sec - (Date.now() - tStart) / 1000;
      const ring = el && el.querySelector('.stage .ring'); if (ring) ring.outerHTML = U.ring(1 - left / st.sec, Math.ceil(left) + ' s');
      await U.sleep(250);
      if (RS.aborted) break;
    }
    U.cancel(['rec-stop']);
    const r = A.stopRec();
    const dur = r.pcm.length / r.sr;
    return { pcm: r.pcm, sr: r.sr, t0rel: 0.15, t1rel: Math.min(dur, st.sec + 0.2) };
  }
  async function playCues(st, head) {
    const cues = st.rec.cues;
    A.startRec();
    frame(stage(st.label, '', '<div id="cueBox" class="bigchord">…</div><div class="rec-dot"></div>'), btn('rec-stop', 'Arrêter', 'ghost block'), head);
    await U.sleep(300);
    const t0 = A.now() + 0.2;
    cues.forEach(c => A.clickAt(t0 + c.at, true, 'aigu'));
    const tEnd = t0 + st.sec;
    let stop = false;
    U.wait(['rec-stop']).then(a => { if (a) stop = true; }).catch(() => { stop = true; });
    while (!stop && A.now() < tEnd) {
      const now = A.now() - t0;
      const cur = cues.filter(c => c.at <= now).pop();
      const box = document.getElementById('cueBox');
      if (box) box.innerHTML = cur ? (st.hidden ? '🎸' : esc(vSym(cur.v)) + `<small>${esc(T.chordFr(T.voicing(cur.v).sym))}</small>`) : '…';
      await U.sleep(60);
      if (RS.aborted) break;
    }
    U.cancel(['rec-stop']);
    const r = A.stopRec();
    const recT0 = r.t0 != null ? r.t0 : t0 - 0.5;
    const spec = { cues: cues.map(c => ({ t: t0 + c.at - recT0, v: c.v, limit: c.limit })), clicks: cues.map(c => t0 + c.at - recT0), latency: isFinite(S().profile.latency) ? S().profile.latency : A.outputLatency() + 0.03, vocab: (st.rec.vocab || []).map(id => T.voicing(id)).filter(Boolean) };
    if (!spec.vocab.length) spec.vocab = St.ctx(S(), RS.plan).vocab.map(id => T.voicing(id)).filter(Boolean);
    return { pcm: r.pcm, sr: r.sr, spec };
  }
  async function playPlucks(st, head) {
    const v = T.voicing(st.rec.v), n = T.sounding(v).length;
    A.startRec();
    const tStart = Date.now();
    let stop = false, heard = 0, quietSince = 0, lastLoud = 0;
    const noise = A.level();
    frame(stage(st.label, esc(st.sub || ''), U.diagram(st.rec.v, { size: 'big' }) + '<div class="meter" style="margin:6px auto 0"><b id="mtr"></b></div>'), btn('rec-stop', 'J’ai fini', 'primary block'), head);
    U.wait(['rec-stop']).then(a => { if (a) stop = true; }).catch(() => { stop = true; });
    while (!stop && (Date.now() - tStart) / 1000 < st.sec + 6) {
      const lv = A.level(), loud = lv > Math.min(-38, Math.max(noise + 14, -55));
      if (loud) { if (Date.now() - lastLoud > 250) heard++; lastLoud = Date.now(); quietSince = 0; } else if (heard && !quietSince) quietSince = Date.now();
      const m = document.getElementById('mtr'); if (m) m.style.width = Math.max(0, Math.min(100, (lv + 60) / 60 * 100)) + '%';
      if (heard >= n && quietSince && Date.now() - quietSince > 1500) break;
      await U.sleep(80);
      if (RS.aborted) break;
    }
    U.cancel(['rec-stop']);
    await U.sleep(200);
    const r = A.stopRec();
    return { pcm: r.pcm, sr: r.sr };
  }

  /* ------------------------------------------------------------ quiz */
  async function runQuiz(st, head) {
    if (st.quiz === 'discri') return quizDiscri(st, head);
    if (st.quiz === 'qualite') return quizQualite(st, head);
    if (st.quiz === 'degres') return quizDegres(st, head);
    if (st.quiz === 'cartes') return quizCartes(st, head);
    return null;
  }
  async function quizDiscri(st, head) {
    const z = C.zest.init(35, 2.2);
    for (let i = 0; i < st.trials; i++) {
      const cents = C.zest.next(z), base = 55 + Math.floor(Math.random() * 9), up = Math.random() < 0.5;
      const q = { kind: 'pair', a: base, b: base + (up ? 1 : -1) * cents / 100, gap: 1.0 };
      await ensureSound(head);
      frame(stage('Écoute les deux notes', 'Essai ' + (i + 1) + '/' + st.trials + ' · écart ' + Math.round(cents) + ' cents', '<div class="pulse"></div>'), '', head);
      await U.sleep(250); await A.play(q);
      frame(stage('La 2ᵉ note était…', 'Essai ' + (i + 1) + '/' + st.trials), `<div class="predict">${btn('q-ans', '▲ Plus haute', 'big', 'up')}${btn('q-ans', '▼ Plus basse', 'big', 'down')}</div>` + btn('q-replay', 'Réécouter', 'ghost small'), head);
      let a;
      for (;;) { a = await U.wait(['q-ans', 'q-replay']); if (a.act === 'q-ans') break; await ensureSound(head); await A.play(q); }
      const ok = (a.arg === 'up') === up;
      C.zest.update(z, cents, ok);
      frame(stage(ok ? '✓ Oui' : '✗ Non', ok ? '' : 'Elle était ' + (up ? 'plus haute' : 'plus basse') + '.'), '', head);
      await U.sleep(600);
    }
    const est = C.zest.estimate(z);
    return { threshold: est.threshold, lo80: est.lo80, hi80: est.hi80, correct: est.correct, n: est.n };
  }
  const Q_NAMES = { '': 'Majeur', m: 'Mineur', '7': '7 (septième)', sus4: 'sus4', sus2: 'sus2', maj7: 'maj7', m7: 'm7' };
  async function quizQualite(st, head) {
    const set = C.QUALITY_SETS[st.set].opts;
    let correct = 0; const conf = {};
    for (let i = 0; i < st.n; i++) {
      const q = set[Math.floor(Math.random() * set.length)];
      const root0 = [0, 2, 4, 7, 9][Math.floor(Math.random() * 5)];
      const pl = T.playable(T.chordSym({ root: root0, q })) || T.playable(T.chordSym({ root: 9, q }));
      if (!pl || pl.simplified) { i--; continue; }
      const model = st.arp ? { kind: 'arp', v: pl.v.id, gap: 0.22 } : { kind: 'strum', v: pl.v.id };
      await ensureSound(head);
      frame(stage('Écoute', 'Question ' + (i + 1) + '/' + st.n, '<div class="pulse"></div>'), '', head);
      await A.play(model);
      frame(stage('Cet accord est…', 'Question ' + (i + 1) + '/' + st.n), `<div class="predict">${set.map(x => btn('q-ans', esc(Q_NAMES[x]), 'big', x)).join('')}</div>` + btn('q-replay', 'Réécouter', 'ghost small'), head);
      let a;
      for (;;) { a = await U.wait(['q-ans', 'q-replay']); if (a.act === 'q-ans') break; await ensureSound(head); await A.play(model); }
      const ok = a.arg === q;
      if (ok) correct++; else { const k = Q_NAMES[q] + ' pris pour ' + Q_NAMES[a.arg]; conf[k] = (conf[k] || 0) + 1; }
      frame(stage(ok ? '✓ ' + Q_NAMES[q] : '✗ C’était ' + Q_NAMES[q], esc(T.chordLong(pl.v.sym))), '', head);
      await U.sleep(800);
    }
    const top = Object.entries(conf).sort((a, b) => b[1] - a[1])[0];
    return { correct, n: st.n, confusions: top ? 'Confusion la plus fréquente : ' + top[0] + ' (' + top[1] + '×).' : '' };
  }
  async function quizDegres(st, head) {
    let correct = 0; const conf = {};
    const keys = [7, 0, 2, 9, 4];
    for (let i = 0; i < st.n; i++) {
      const key = keys[Math.floor(Math.random() * keys.length)];
      let model, answer, opts;
      if (st.prog) {
        const cands = T.PROGRESSIONS.filter(p => p.deg.length === 4 && p.deg.every(dg => st.set.includes(dg) || ['I', 'IV', 'V', 'vi'].includes(dg)));
        const pick3 = cands.sort(() => Math.random() - 0.5).slice(0, 3);
        const target = pick3[0];
        const seq = target.deg.map(dg => T.playable(T.degreeChord(dg, key)).v.id);
        model = { kind: 'cadence', key, then: seq };
        answer = target.name; opts = pick3.map(p => p.name).sort(() => Math.random() - 0.5);
      } else {
        const dg = st.set[Math.floor(Math.random() * st.set.length)];
        const pl = T.playable(T.degreeChord(dg, key));
        model = { kind: 'cadence', key, then: pl.v.id };
        answer = dg; opts = st.set;
      }
      await ensureSound(head);
      frame(stage('Tonalité, puis l’accord', 'Question ' + (i + 1) + '/' + st.n + ' · en ' + esc(T.keyName(key, false)), '<div class="pulse"></div>'), '', head);
      await A.play(model);
      frame(stage(st.prog ? 'Quelle progression ?' : 'Quel degré ?', 'Question ' + (i + 1) + '/' + st.n), `<div class="${st.prog ? 'col' : 'predict'}">${opts.map(x => btn('q-ans', esc(x), st.prog ? 'block' : 'big', x)).join('')}</div>` + btn('q-replay', 'Réécouter', 'ghost small'), head);
      let a;
      for (;;) { a = await U.wait(['q-ans', 'q-replay']); if (a.act === 'q-ans') break; await ensureSound(head); await A.play(model); }
      const ok = a.arg === answer;
      if (ok) correct++; else { const k = answer + ' pris pour ' + a.arg; conf[k] = (conf[k] || 0) + 1; }
      const chordTxt = !st.prog ? ' (' + T.pretty(T.degreeChord(answer, key)) + ' en ' + T.keyName(key, false) + ')' : '';
      frame(stage(ok ? '✓ ' + answer : '✗ C’était ' + answer, esc(chordTxt)), '', head);
      await U.sleep(900);
    }
    const top = Object.entries(conf).sort((a, b) => b[1] - a[1])[0];
    return { correct, n: st.n, confusions: top ? 'À retravailler : ' + top[0] + '.' : '' };
  }
  async function quizCartes(st, head) {
    const s = S(), day = St.today();
    const ids = R.dueList(s.cards, St.cardsAvailable(s), day, { max: st.max || 12, maxNew: St.programWeek(s) <= 1 ? 4 : 6 });
    if (!ids.length) return { n: 0, correct: 0 };
    let correct = 0; const retry = [];
    const ask = async (id, again) => {
      const cd = R.card(id, (s.cards[id] && s.cards[id].reps || 0) + (again ? 7 : 0));
      if (!cd) return;
      const qHtml = (cd.diagram ? U.diagram(cd.diagram, { title: '?', fr: false, label: '' }) : '') + `<h2 class="center" style="margin-top:6px">${esc(cd.q)}</h2>`;
      frame(qHtml + '<p class="small muted center">Réponds d’abord dans ta tête…</p>', '', Object.assign({}, head, { sub: (again ? 'Encore une fois · ' : '') + R.FAMILIES[cd.fam].name }));
      const t0 = Date.now();
      await U.sleep(1200);
      frame(qHtml, `<div class="col">${cd.opts.map((o, i) => btn('card-ans', esc(o), 'block', i)).join('')}</div>`, Object.assign({}, head, { sub: R.FAMILIES[cd.fam].name }));
      const a = await U.wait(['card-ans']);
      const ok = +a.arg === cd.ans, sec = (Date.now() - t0) / 1000;
      if (!again) { St.reviewCard(s, id, ok, sec); if (ok) correct++; else retry.push(id); save(); }
      frame(qHtml + `<div class="card flat"><div class="fb ${ok ? 'good' : 'bad'}"><span class="dot"></span><span>${ok ? '✓ Oui : ' : '✗ Réponse : '}${esc(cd.opts[cd.ans])}</span></div><p class="small muted" style="margin-top:6px">${esc(cd.explain)}</p></div>`, btn('card-next', 'Suivant', 'primary big block'), Object.assign({}, head, { sub: R.FAMILIES[cd.fam].name }));
      await U.wait(['card-next']);
    };
    for (const id of ids) await ask(id, false);
    for (const id of retry) await ask(id, true);           // une carte ratée revient en fin de série
    return { n: ids.length, correct };
  }

  /* ------------------------------------------------------------ filage (chanson entière) */
  async function stepSong(ex, st, head) {
    const s = S(), song = St.workSong(s);
    const info = song ? St.songInfo(song) : null;
    const grid = info && info.ok ? info.sections.map((sec, i) => `<h3 style="margin-top:8px">${esc(sec.name)}</h3>` + songGrid(song.id, i)).join('') : '';
    frame(`<div class="notice">Une seule prise, du début à la fin. Si tu te trompes, continue comme sur scène.</div>${grid}`, btn('song-rec', '● Enregistrer', 'primary big block'), head);
    await U.wait(['song-rec']);
    let pcm = null, sr = 48000;
    if (RS.mic) {
      for (const n of [3, 2, 1]) { frame(stage(String(n), 'Silence dans la salle…', '<div class="rec-dot"></div>'), '', head); await U.sleep(900); if (RS.aborted) throw ABORT; }
      await ensureSound(head);
      const t0 = Date.now();
      A.startRec();
      const iv = setInterval(() => { const lab = el && el.querySelector('.stage .label'); if (lab) lab.textContent = 'Enregistrement… ' + Math.floor((Date.now() - t0) / 1000) + ' s'; }, 500);
      frame(stage('Enregistrement… 0 s', 'Joue et chante !', '<div class="rec-dot"></div>'), btn('song-stop', '■ Arrêter', 'primary big block'), head);
      try { await Promise.race([U.wait(['song-stop']), U.sleep(8 * 60 * 1000)]); } finally { U.cancel(['song-stop']); clearInterval(iv); const r = A.stopRec(); pcm = r.pcm; sr = r.sr; }
      if (pcm && pcm.length > sr) { try { const x22 = D.resample(pcm, sr, 22050); await Store.saveRec(x22, 22050, { ex: ex.id, kind: 'song', song: song ? song.id : null, label: (song ? song.title : 'Chanson') + ' · filage' }); if (U.invalidateRecs) U.invalidateRecs(); } catch (e) { /* stockage plein */ } }
    } else { frame(stage('Joue ta chanson', 'du début à la fin'), btn('song-stop', 'J’ai fini', 'primary big block'), head); await U.wait(['song-stop']); }
    const crit = [['changements', 'Changements à l’heure'], ['rythme', 'Rythmique régulière'], ['continu', 'Je ne me suis pas arrêté'], ['voix', 'Voix posée, texte vivant']];
    const chosen = new Set(); let stress = null;
    const draw = () => frame(`<h3>Réécoute-toi. Qu’est-ce qui était réussi ?</h3><div class="chips" style="margin-top:8px">${crit.map(([k, l]) => `<button class="chip ${chosen.has(k) ? 'on' : ''}" data-act="crit" data-arg="${k}">${l}</button>`).join('')}</div>
      <h3 style="margin-top:14px">Stress ressenti</h3><div class="chips" style="margin-top:8px">${[1, 2, 3, 4, 5].map(v => `<button class="chip ${stress === v ? 'on' : ''}" data-act="stress" data-arg="${v}">${v}</button>`).join('')}</div><p class="tiny faint">1 = serein · 5 = très stressé</p>`,
      (pcm && pcm.length ? btn('song-play', '▶ Réécouter', 'block') : '') + btn('song-done', 'Valider', 'primary big block'), head);
    draw();
    for (;;) {
      const a = await U.wait(['crit', 'song-play', 'song-done', 'stress']);
      if (a.act === 'crit') { chosen.has(a.arg) ? chosen.delete(a.arg) : chosen.add(a.arg); draw(); }
      else if (a.act === 'stress') { stress = +a.arg; draw(); }
      else if (a.act === 'song-play') { A.stopAll(); A.playPcm(pcm, sr).catch(() => {}); }
      else { A.stopAll(); break; }
    }
    if (stress) St.addSeries(s, 'stress', stress);
    return { res: null, pcm, sr, self: chosen.size >= 3 ? 1 : chosen.size >= 2 ? 0.5 : 0 };
  }

  /* ------------------------------------------------------------ atelier de composition */
  const CONSTRAINTS = [
    'Une boucle de 4 accords qui commence sur I et utilise vi.',
    'Une boucle sombre qui commence sur vi.',
    'Une grille qui se termine sur V : elle doit donner envie de recommencer.',
    'Utilise un accord emprunté (♭VII ou iv) quelque part.',
    'Seulement 3 accords, dont un qui revient deux fois.',
  ];
  async function stepCompose(st, head) {
    const s = S();
    const task = st.task;
    const song = St.workSong(s);
    let key = s.studioKey != null ? s.studioKey : 7;
    let prog = ['I', 'V', 'vi', 'IV'].map(dg => dg);
    if (task === 'grille') prog = [];
    const constraint = CONSTRAINTS[Math.floor(Math.random() * CONSTRAINTS.length)];
    let tempo = song ? song.tempo : 84, strum = 'r3', melody = null, pcm = null, sr = 48000, text = '';
    const syms = () => prog.map(dg => T.degreeChord(dg, key));
    const vids = () => syms().map(x => { const p = T.playable(x); return p ? p.v.id : null; }).filter(Boolean);
    const palette = () => {
      const base = ['I', 'ii', 'iii', 'IV', 'V', 'vi'].map(dg => ({ dg, b: false })).concat(['♭VII', 'iv', 'I/3'].map(dg => ({ dg, b: true })));
      return `<div class="palette">${base.map(x => `<button class="pc ${x.b ? 'borrowed' : ''}" data-act="cp-add" data-arg="${esc(x.dg)}"><b>${esc(T.pretty(T.degreeChord(x.dg, key)))}</b><span>${esc(x.dg)}</span></button>`).join('')}</div>`;
    };
    const sugg = () => { if (!prog.length) return ''; const sg = T.suggestNext(prog); return `<div class="small muted" style="margin-top:6px">Et après ? ${sg.map(x => `<button class="chip" data-act="cp-add" data-arg="${esc(x.deg)}">${esc(x.deg)} · ${esc(T.pretty(T.degreeChord(x.deg, key)))}</button>`).join(' ')}</div>${sg[0] && sg[0].why ? `<p class="tiny faint" style="margin-top:4px">${esc(sg[0].why)}</p>` : ''}`; };
    const keys = [0, 2, 4, 5, 7, 9];
    const draw = () => {
      const c = C.COMPO[task];
      let body = `<div class="cue">${esc(task === 'grille' ? constraint : task === 'rythme' ? 'Essaie 3 rythmiques et 2 tempos sur ta grille : garde ce qui colle à l’émotion.' : task === 'melodie' ? 'Fredonne une mélodie sur ta boucle : notes de l’accord sur les temps 1 et 3, petits pas entre elles. Au casque si possible.' : task === 'structure' ? 'Écris un refrain qui contraste avec ton couplet : il commence ailleurs (IV ou vi), monte en énergie.' : 'Écris 4 vers sur ta grille ; place les syllabes accentuées sur les temps forts.')}</div>`;
      body += `<div class="chips">${keys.map(k => `<button class="chip ${k === key ? 'on' : ''}" data-act="cp-key" data-arg="${k}">${esc(T.keyName(k, false))}</button>`).join('')}</div>`;
      body += `<h3>Ta grille</h3><div class="prog">${prog.map((dg, i) => `<button class="pc" data-act="cp-del" data-arg="${i}"><b>${esc(T.pretty(T.degreeChord(dg, key)))}</b><span>${esc(dg)}</span></button>`).join('') || '<span class="small faint">Touche les accords ci-dessous.</span>'}</div>${sugg()}${palette()}`;
      if (task === 'rythme' || task === 'melodie' || task === 'structure') body += `<div class="chips" style="margin-top:6px">${['r1', 'r3', 'r4', 'r6', 'r8'].map(p => `<button class="chip ${p === strum ? 'on' : ''}" data-act="cp-strum" data-arg="${p}">${esc(T.strum(p).name)}</button>`).join('')}</div><div class="row" style="margin-top:6px">${btn('cp-tempo', '−', 'small', '-6')}<span class="small">${tempo} BPM</span>${btn('cp-tempo', '+', 'small', '6')}</div>`;
      if (task === 'texte') body += `<textarea id="cpText" placeholder="Tes 4 vers…">${esc(text)}</textarea>`;
      if (melody) body += `<div class="card flat">${U.fbList(melody.fb)}</div>`;
      frame(body, `<div class="row">${btn('cp-play', '▶ Écouter', 'grow')}${task === 'melodie' ? btn('cp-rec', '● Mélodie', 'grow') : ''}</div>` + btn('cp-save', 'Garder cette idée', 'primary big block') + btn('cp-skip', 'Passer', 'ghost small'), Object.assign({}, head, { title: c.name }));
    };
    draw();
    for (;;) {
      const a = await U.wait(['cp-add', 'cp-del', 'cp-key', 'cp-strum', 'cp-tempo', 'cp-play', 'cp-rec', 'cp-save', 'cp-skip']);
      const ta = document.getElementById('cpText'); if (ta) text = ta.value;
      if (a.act === 'cp-add') { if (prog.length < 8) prog.push(a.arg); const p = T.playable(T.degreeChord(a.arg, key)); if (p) A.play({ kind: 'strum', v: p.v.id }); draw(); }
      else if (a.act === 'cp-del') { prog.splice(+a.arg, 1); draw(); }
      else if (a.act === 'cp-key') { key = +a.arg; s.studioKey = key; draw(); }
      else if (a.act === 'cp-strum') { strum = a.arg; draw(); }
      else if (a.act === 'cp-tempo') { tempo = Math.max(50, Math.min(150, tempo + +a.arg)); draw(); }
      else if (a.act === 'cp-play') { if (prog.length) { await ensureSound(head); A.stopAll(); A.play({ kind: 'pattern', strum, seq: vids(), bpc: 4, tempo, bars: prog.length, withClicks: false }); } }
      else if (a.act === 'cp-rec') { if (!prog.length) { U.toast('Construis d’abord une grille.'); continue; } const r = await recordMelody(vids(), syms(), tempo, strum, head); if (r) { melody = r; pcm = r.pcm; sr = r.sr; } draw(); }
      else if (a.act === 'cp-skip') { A.stopAll(); return { self: null }; }
      else if (a.act === 'cp-save') { A.stopAll(); break; }
    }
    const idea = { id: 'i' + Date.now().toString(36), date: St.today(), task, key, prog: prog.slice(), syms: syms(), tempo, strum, text, title: 'Idée du ' + U.dateFr(St.today()) };
    if (pcm && pcm.length) { try { idea.rec = await Store.saveRec(D.resample(pcm, sr, 22050), 22050, { kind: 'idea', idea: idea.id, label: idea.title }); } catch (e) { /* rien */ } }
    s.ideas.unshift(idea); save();
    frame(stage('Idée gardée ✓', 'Retrouve-la dans Studio.') , `<div class="predict">${btn('self', '✓ Ça me plaît', 'good big', '1')}${btn('self', '~ À retravailler', 'warnb big', '0.5')}</div>`, head);
    const a2 = await U.wait(['self']);
    return { self: +a2.arg, melody: melody ? melody.stats : null };
  }
  /** Mélodie fredonnée sur la boucle : suivi de hauteur, notes de l'accord sur les temps forts. */
  async function recordMelody(vids, syms, tempo, strum, head) {
    if (!RS.mic) { U.toast('Micro indisponible.'); return null; }
    await ensureSound(head);
    const beat = 60 / tempo, bars = vids.length * 2;
    const seq = []; vids.forEach(v => { seq.push(v); seq.push(v); });
    A.startRec();
    frame(stage('Fredonne ta mélodie…', '2 tours de grille. La guitare joue doucement (au casque, c’est mieux).', '<div class="rec-dot"></div>'), btn('rec-stop', 'Arrêter', 'ghost block'), head);
    await U.sleep(300);
    const t0 = A.now() + 0.4;
    for (let i = 0; i < 4; i++) A.clickAt(t0 + i * beat, i === 0, 'bois');
    const start = t0 + 4 * beat;
    const sc = C.rhythmScore({ strum, seq, bpc: 4, tempo, bars });
    A.setUserVolume(Math.max(0.5, (S().profile.volume || 1) * 0.6));
    A.scheduleScore(sc, start);
    const tEnd = start + bars * 4 * beat;
    let stop = false;
    U.wait(['rec-stop']).then(a => { if (a) stop = true; }).catch(() => { stop = true; });
    while (!stop && A.now() < tEnd + 0.3) await U.sleep(100);
    U.cancel(['rec-stop']);
    A.setUserVolume(S().profile.volume || 1);
    A.stopAll();
    const r = A.stopRec();
    const recT0 = r.t0 != null ? r.t0 : t0 - 0.7;
    frame(stage('Analyse…', '', '<div class="pulse"></div>'), '', head); await U.frame();
    const tr = D.trackVoice(r.pcm, r.sr, { a4: S().profile.tuning || 440 });
    const notes = D.segmentNotes(tr);
    const timeline = [], strong = [];
    for (let b = 0; b < bars; b++) { const a = start + b * 4 * beat - recT0; timeline.push({ t0: a, t1: a + 4 * beat, sym: syms[Math.floor(b / 2) % syms.length] }); strong.push(a, a + 2 * beat); }
    const stats = D.melodyVsChords(notes, timeline, strong);
    const fb = [];
    if (!stats.n) fb.push({ kind: 'warn', text: 'Je n’ai pas entendu de mélodie : fredonne plus fort, plus près du téléphone (ou au casque).' });
    else {
      fb.push({ kind: stats.strongRatio >= 0.6 ? 'good' : 'info', text: Math.round(100 * (stats.strongRatio || 0)) + ' % de tes notes sur les temps forts sont des notes de l’accord.' });
      fb.push({ kind: 'info', text: 'Ambitus : ' + T.noteName(stats.range.lo) + ' → ' + T.noteName(stats.range.hi) + ' · ' + Math.round(100 * (stats.stepRatio || 0)) + ' % de mouvements par petits pas.' });
      if (stats.stepRatio != null && stats.stepRatio < 0.5) fb.push({ kind: 'tip', text: 'Les mélodies qu’on retient avancent surtout par petits pas ; après un grand saut, elles reviennent souvent dans l’autre sens (von Hippel & Huron 2000).' });
    }
    return { pcm: r.pcm, sr: r.sr, stats, fb };
  }

  /* ------------------------------------------------------------ prédiction et auto-évaluation */
  async function askPredict(kind, head) {
    const opts = kind === 'clean' ? [['propre', 'Tout sonnait'], ['pas propre', 'Une corde ou plus clochait'], ['?', 'Je ne sais pas']] : [['en place', 'C’était en place'], ['pas en place', 'Ça flottait'], ['?', 'Je ne sais pas']];
    frame(stage('Avant de voir : c’était…', 'Deviner d’abord entraîne ton écoute : c’est elle qui te guidera quand tu joueras seul.'), `<div class="col">${opts.map(([v, l]) => btn('pred', l, v === '?' ? 'ghost block' : 'block', v)).join('')}</div>`, head);
    const a = await U.wait(['pred']);
    return a.arg;
  }
  async function askSelf(head, fb) {
    const why = U.fbList(fb);
    frame((why ? `<div class="card flat">${why}</div>` : '') + stage('Comment c’était pour toi ?', RS.mic ? 'La mesure n’a pas pu trancher : ton ressenti compte (à moitié).' : 'Sans micro, c’est ton ressenti qui guide la suite.'),
      `<div class="predict">${btn('self', '✓ Réussi', 'good big', '1')}${btn('self', '~ Presque', 'warnb big', '0.5')}</div>${btn('self', '✗ Pas encore', 'badb block', '0')}`, head);
    const a = await U.wait(['self']);
    return +a.arg;
  }

  /* ------------------------------------------------------------ résultat */
  async function showResult(ex, params, res, judged, take, rec, head) {
    const y = judged.y != null ? judged.y : take.self;
    const win = judged.success === true || (judged.success == null && y >= 1);
    const vcls = y == null ? 'none' : win ? 'good' : y >= 0.5 ? 'half' : 'bad';
    const vtxt = y == null ? 'Enregistré' : win ? 'Réussi' : y >= 0.5 ? 'Presque' : 'Pas encore';
    const fb = (judged.fb || []).slice(0, 5);
    if (take.calib) fb.unshift({ kind: take.calib.hit ? 'good' : 'warn', text: take.calib.hit ? 'Ton écoute : bien senti ✓' : 'Ton écoute : la mesure dit « ' + take.calib.truth + ' ».' });
    let vis = '';
    if ((ex.id === 'propre' || ex.id === 'barre') && res && res.strings) {
      const status = new Array(6).fill(null); res.strings.forEach(st => { status[st.s] = st.status; });
      vis = U.diagram(params.v, { size: 'big', status });
      if (judged.y === 1) vis += '<p class="small muted center">Une corde frise (un « bzz ») ? Le micro ne l’entend pas toujours : avance le doigt juste derrière la frette.</p>';
    } else if (ex.id === 'minute' && res && res.strums) vis = `<div class="center"><div class="big-num">${Math.round(res.cpm || 0)}</div><div class="muted">changements/min · objectif ${params.target}${(() => { const p = St.pairStat(S(), params.a, params.b); return p ? ' · record ' + p.best : ''; })()}</div></div>`;
    else if (res && res.events && RS.lastScore) vis = U.rplot(res, (RS.lastScore && params.tol) || 60, RS.lastScore);
    const draw = () => frame(`<div class="center"><div class="verdict ${vcls}">${vtxt}</div></div>${vis}<div class="card flat">${U.fbList(fb) || '<p class="muted small">—</p>'}</div>` +
      `<div class="row wrap">${rec && rec.pcm && rec.pcm.length ? btn('res-play', '▶ Ma prise', 'small') : ''}${btn('res-retry', '↺ Refaire', 'small')}${judged.y != null ? btn('res-dispute', 'Mesure fausse ?', 'small ghost') : ''}${btn('res-pain', RS.painMark ? '⚠︎ Noté' : 'Douleur', 'small ghost')}</div>`,
      btn('res-next', 'Suivant', 'primary big block'), head);
    RS.painMark = false; draw();
    for (;;) {
      const a = await U.wait(['res-next', 'res-retry', 'res-play', 'res-dispute', 'res-pain']);
      if (a.act === 'res-play') { A.stopAll(); A.playPcm(rec.pcm, rec.sr).catch(() => {}); continue; }
      A.stopAll();
      if (a.act === 'res-pain') {
        if (!RS.painMark) {
          RS.painMark = true; RS.last.entry.pain = true;
          const s = S(); s.health.painDays = (s.health.painDays || []).filter(d => d !== St.today()).concat([St.today()]).slice(-60); save();
          RS.block.stop = true;
          U.toast('Noté : on arrête ce bloc. Secoue les mains, relâche. Si la douleur persiste, arrête la séance.', 5000);
        }
        draw(); continue;
      }
      if (a.act === 'res-dispute') {
        const self = await askSelf(head, [{ kind: 'info', text: 'Dis-moi comment c’était vraiment : ta réponse remplace la mesure pour cette prise.' }]);
        reviseLast(ex, { y: null, success: null, metrics: null, fb: [] }, self);
        RS.last.entry.disputed = true;
        U.toast('Merci : noté comme ' + (self === 1 ? 'réussi' : self > 0 ? 'presque' : 'pas encore') + '.');
        return 'next';
      }
      if (a.act === 'res-retry') { RS.retryParams = params; RS.retryEx = ex.id; return 'retry'; }
      return 'next';
    }
  }
  function reviseLast(ex, judged2, self2) {
    const L = RS.last, s = S();
    St.restore(s, ex.id, L.snap);
    const t2 = Object.assign({}, L.take, { judged: judged2, self: self2, predicted: null });
    St.recordTake(s, t2, L.take.ts);
    Object.assign(L.entry.judged, { y: judged2.y, success: judged2.success, metrics: judged2.metrics || null });
    L.entry.self = self2;
    Object.assign(RS.block, { fails: L.block.fails, offset: L.block.offset });
    adapt(RS.item, judged2.y != null ? judged2.y : self2);
    save();
  }

  /* ------------------------------------------------------------ fin */
  async function endSession(aborted) {
    const s = S();
    A.stopAll();
    try { A.closeMic(); } catch (e) { /* rien */ }
    releaseAwake();
    const sess = RS.sess;
    sess.activeMs = activeMs();
    const measured = sess.takes.filter(t => !t.guided && (t.judged && t.judged.y != null || t.self != null));
    const resumable = aborted && RS.plan.type !== 'libre' && RS.idx < RS.plan.items.length;
    let summary = null;
    if (measured.length || !aborted) {
      const done = St.finishSession(s, sess, null, resumable);
      done.load = Math.round((sess.load || 0) * 1.5 + (done.minutes || 0) * 0.5);
      if (RS.plan.type === 'B' && !aborted) {
        summary = P.concludeBilan(s, sess, RS.plan.bilan);
        if (RS.plan.bilan === 'entree') { s.program.start = St.today(); s.program.pausedDays = 0; }
      }
    }
    s.current = resumable ? { plan: RS.plan, sess, idx: RS.idx, elapsed: sess.activeMs, date: St.today() } : null;
    Store.save(s, true);
    const won = t => { const j = t.judged || {}, y = j.y != null ? j.y : t.self; return j.success === true || (j.success == null && y >= 1); };
    const ok = measured.filter(won).length;
    RS = null;
    const box = el;
    U.resetAbort();
    const lines = [];
    if (measured.length) lines.push(`<div class="stat"><span class="muted small">Prises réussies</span><b>${ok}/${measured.length}</b></div>`);
    lines.push(`<div class="stat"><span class="muted small">Durée</span><b>${Math.max(1, Math.round((sess.activeMs || 0) / 60000))} min</b></div>`);
    let bil = '';
    if (summary) bil = `<div class="card flat"><h3>Résultats du bilan</h3><table class="t" style="margin-top:8px"><tr><th>Compétence</th><th class="n">Avant</th><th class="n">Mesuré</th></tr>${M.COMPS.filter(c => summary.measured.includes(c.id)).map(c => `<tr><td>${esc(c.name)}</td><td class="n">${fr(summary.before[c.id])}</td><td class="n"><b>${fr(summary.after[c.id])}</b></td></tr>`).join('')}</table><p class="tiny faint" style="margin-top:6px">Niveau global : ${fr(summary.overall)} · ${esc(M.label(summary.overall))}</p></div>`;
    box.innerHTML = `<div class="sess-body"><div class="center" style="margin-top:20px"><div style="font-size:48px">🎸</div><h1 style="margin-top:8px">${aborted ? 'Séance interrompue' : 'Séance terminée'}</h1><p class="muted" style="margin-top:6px">${aborted ? (resumable ? 'Tu pourras la reprendre depuis l’accueil.' : 'Ce que tu as fait est enregistré.') : 'Le sommeil de cette nuit va consolider ce que tu viens de travailler.'}</p></div>
      <div class="row between card flat">${lines.join('')}</div>${bil}
      ${!aborted ? '<div class="card flat"><h3>Une intention pour la prochaine fois</h3><p class="small muted" style="margin:4px 0 8px">Une phrase précise (« le changement Do → Sol sans regarder ») : se fixer un objectif concret après chaque séance aide à progresser.</p><input type="text" id="nextIntent" placeholder="La prochaine fois, je…"></div>' : ''}
      </div><div class="sess-foot">${btn('sess-close', 'Terminer', 'primary big block')}</div>`;
    await new Promise(res => { const h = () => { const inp = document.getElementById('nextIntent'); if (inp && inp.value.trim()) { s.intent = inp.value.trim(); Store.save(s, true); } res(); }; U.wait(['sess-close']).then(h).catch(h); });
    document.body.style.overflow = '';
    box.remove(); el = null;
    U.render();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
