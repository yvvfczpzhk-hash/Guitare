'use strict';
/*
 * Tests dans un vrai navigateur (Chromium, via Playwright) : node tests/browser.js
 *   (une fois : npm i -D playwright && npx playwright install chromium)
 * 1) Sons de l'app rendus par le vrai moteur Web Audio : notes justes, rythmique jouée au bon instant, pas de
 *    saturation ; tapes de l'écran ramenées sur l'horloge du son.
 * 2) Interface : premier lancement, passage d'une version 1 à la version 2, accueil et plan du jour, onglets,
 *    chanson collée, studio, outils (accordeur guidé avec un micro factice), réglages, puis des séances complètes :
 *    vraies tapes sur l'écran, rythmique tapée puis jouée, corde par corde, chrono, comptage, oreille, cartes,
 *    composition, filage enregistré, section de chanson, bilan interrompu puis repris, sauvegarde.
 */
const path = require('path'), fs = require('fs'), http = require('http');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  try { ({ chromium } = require(path.join(process.execPath, '..', '..', 'lib', 'node_modules', 'playwright'))); } catch (e2) {
    console.log('Playwright absent : npm i -D playwright (ou npx playwright install chromium), puis relance.'); process.exit(0);
  }
}
const ROOT = path.join(__dirname, '..');

let fails = 0, count = 0;
function report(name, problems) {
  count++;
  if (!problems.length) console.log('✓ ' + name);
  else { fails++; console.log('✗ ' + name + '\n    ' + problems.slice(0, 8).join('\n    ')); }
}

(async () => {
  // petit serveur local : l'AudioWorklet du micro exige une vraie origine (pas file://)
  const srv = http.createServer((q, r) => {
    const f = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    if (!f.startsWith(ROOT)) { r.writeHead(403); r.end(); return; }
    fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': f.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' }); r.end(d); } });
  }).listen(0);
  await new Promise(r => srv.on('listening', r));
  const URL0 = 'http://localhost:' + srv.address().port + '/index.html';
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ['microphone'], locale: 'fr-FR' });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')));
  page.on('console', m => { if (m.type() === 'error') errors.push('console : ' + m.text()); });
  await page.goto(URL0);
  await page.waitForFunction(() => window.AC && AC.audio && AC.dsp && AC.taps && AC.ui && AC.ui.state);


  /* ------------------------------------------------------------ 1) sons */
  const snd = await page.evaluate(async () => {
    const A = AC.audio, D = AC.dsp, out = { notes: [], rhythm: [], peak: 0 };
    for (const m of [40, 45, 50, 55, 59, 64, 69, 76]) {
      const { pcm, sr } = await A.renderOffline({ kind: 'note', midi: m, dur: 1.6 }, 48000, 2);
      const a = Math.round(0.5 * sr), r = D.tuneString(pcm.subarray(a, a + 8192), sr, m);
      out.notes.push({ m, e: r ? r.cents : NaN });
      for (let i = 0; i < pcm.length; i++) out.peak = Math.max(out.peak, Math.abs(pcm[i]));
    }
    for (const id of ['C', 'G', 'D', 'Am', 'Em', 'E', 'F', 'Bm']) {
      const { pcm } = await A.renderOffline({ kind: 'strum', v: id }, 44100, 2.2);
      for (let i = 0; i < pcm.length; i++) out.peak = Math.max(out.peak, Math.abs(pcm[i]));
    }
    // rythmique « Folk » à 90 BPM sur Sol, rendue sans clics : chaque coup retrouvé à sa place. Attaques repérées
    // par l'énergie au-dessus de 2,5 kHz : le bruit du médiator ressort sur les cordes qui sonnent encore.
    const tempo = 90, beat = 60 / tempo, sr = 44100;
    const { pcm } = await A.renderOffline({ kind: 'pattern', strum: 'r3', seq: ['G'], bpc: 4, tempo, bars: 2, withClicks: false }, sr, 6.5);
    const w0 = 2 * Math.PI * 2500 / sr, cs = Math.cos(w0), al = Math.sin(w0) / Math.SQRT2, a0 = 1 + al;
    const b0 = (1 + cs) / 2 / a0, b1 = -(1 + cs) / a0, b2 = (1 + cs) / 2 / a0, a1 = -2 * cs / a0, a2 = (1 - al) / a0;
    const hp = new Float32Array(pcm.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < pcm.length; i++) { const v = b0 * pcm[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = pcm[i]; y2 = y1; y1 = v; hp[i] = v; }
    const hop = 64, env = [];
    for (let i = 0; i + hop <= hp.length; i += hop) { let e = 0; for (let j = 0; j < hop; j++) e += hp[i + j] * hp[i + j]; env.push(e); }
    const mx = Math.max(...env), ons = [];
    for (let k = 6; k < env.length; k++) { let m = 0; for (let j = 1; j <= 6; j++) m += env[k - j]; m /= 6; if (env[k] > 4 * m && env[k] > 0.02 * mx && (!ons.length || k * hop / sr - ons[ons.length - 1] > 0.1)) ons.push(k * hop / sr); }
    const evs = AC.catalog.rhythmScore({ strum: 'r3', seq: ['G'], bpc: 4, tempo, bars: 2 }).events;
    const t0 = ons[0];
    evs.forEach(e => { const exp = t0 + e.beat * beat; const near = ons.reduce((b, o) => (Math.abs(o - exp) < Math.abs(b - exp) ? o : b), Infinity); out.rhythm.push(1000 * (near - exp)); });
    // une tape de l'écran « maintenant » correspond au son entendu maintenant
    await A.ensure();
    out.map = A.perfToCtx(performance.now()) - (A.now() - A.outputLatency());
    return out;
  });
  const P1 = [];
  snd.notes.forEach(n => { if (!(Math.abs(n.e) <= 1.5)) P1.push('note ' + n.m + ' : ' + n.e.toFixed(2) + ' c'); });
  report('notes de la guitare de l’app justes à ±1,5 cent dans le vrai moteur audio (accordeur guidé)', P1);
  const worst = Math.max(...snd.rhythm.map(Math.abs));
  report('rythmique jouée par l’app : chaque coup du motif à sa place (±25 ms)', worst <= 25 ? [] : ['écart max ' + worst.toFixed(1) + ' ms']);
  report('pas de saturation (crête < 1)', snd.peak < 1 ? [] : ['crête ' + snd.peak.toFixed(3)]);
  report('tape de l’écran ramenée sur l’horloge du son (cohérence < 60 ms)', Math.abs(snd.map) < 0.06 ? [] : ['écart ' + (1000 * snd.map).toFixed(0) + ' ms']);

  /* ------------------------------------------------------------ 2) interface */
  const click = async (sel, wait) => { if (!(await page.locator(sel).count())) throw new Error('absent : ' + sel); await page.locator(sel).first().click({ timeout: 5000 }); await page.waitForTimeout(wait || 120); };
  const text = async () => page.$eval('body', b => b.innerText);
  const U0 = [];
  try {
    // un état de la version 1 (records venus du micro) : migré, message expliquant le changement
    await page.evaluate(() => { localStorage.setItem('accord.state.v1', JSON.stringify({ v: 1, created: 1, onboarded: true, profile: { name: 'Test', mic: true, click: 'aigu' }, skills: {}, vocab: ['Em', 'G'], chords: { Em: { intro: '2026-01-01', n: 4, clean: 1, form: 1.1 } }, pairs: { 'Em|G': { n: 2, best: 44 } }, sessions: [{ id: 'a', date: '2026-01-02', takes: [], type: 'M' }], series: { cpm: [['2026-01-02', 44]] }, bilans: [], songs: [], ideas: [] })); });
    await page.reload(); await page.waitForFunction(() => window.AC && AC.ui && AC.ui.state);
    if (!/Nouvelle version d’ACCORD/.test(await text())) U0.push('message de la version 2 absent');
    const st = await page.evaluate(() => { const s = AC.ui.state(); return { v: s.v, pairs: Object.keys(s.pairs).length, click: s.profile.click, vocab: s.vocab.length }; });
    if (st.v !== 2 || st.pairs || st.click !== 'bois' || st.vocab !== 2) U0.push('migration : ' + JSON.stringify(st));
    await click('[data-act="notice-ok"]');
    if (/Nouvelle version d’ACCORD/.test(await text())) U0.push('le message ne se ferme pas');
    // repartir de zéro : l'app ne doit pas réécrire son état en quittant la page
    await page.evaluate(() => { AC.store.flush(); AC.store.save = () => {}; AC.store.flush = () => {}; localStorage.clear(); });
    await page.reload(); await page.waitForFunction(() => window.AC && AC.ui && AC.ui.state);
  } catch (e) { U0.push(e.message); }
  report('version 1 → 2 : records du micro remis à zéro, message expliqué puis fermé', U0.concat(errors.splice(0)));

  const U1 = [];
  try {
    await click('[data-act="onb"][data-arg="1"]');
    await click('[data-act="onb-level"][data-arg="debut"]');
    await click('[data-act="onb-done"]');
    if (!/Comment ça va aujourd’hui/.test(await text())) U1.push('pas de question sur la forme du jour');
    await click('[data-act="ck-form"][data-arg="4"]'); await click('[data-act="ck-ok"]');
    if (!/Bilan d’entrée/.test(await text())) U1.push('le premier plan n’est pas le bilan d’entrée');
    for (const t of ['progress', 'songs', 'studio', 'tools', 'home']) { await click(`[data-act="tab"][data-arg="${t}"]`); if ((await text()).length < 200) U1.push('onglet ' + t + ' vide'); }
    await click('[data-act="nav"][data-arg="settings"]');
    if (!/M’enregistrer pour me réécouter/.test(await text())) U1.push('réglage du micro (enregistrement) absent');
    await click('[data-act="nav"][data-arg="science"]');
    const t = await text();
    if (!/Pourquoi l’app ne t’écoute plus/.test(t) || !/Wilson/.test(t) || !/Hewitt/.test(t) || !/Repp/.test(t)) U1.push('page « Comment ça marche » incomplète');
  } catch (e) { U1.push(e.message); }
  report('premier lancement, plan du jour, onglets, réglages et explications', U1.concat(errors.splice(0)));

  const U2 = [];
  try {
    await click('[data-act="tab"][data-arg="songs"]');
    await click('[data-act="new-song"]');
    await page.fill('[data-input="se-title"]', 'Ma chanson');
    await page.fill('[data-input="se-text"]', 'Capo 1\n[Couplet]\nG Em C D\nG Em C D\n[Refrain]\nC D G Em');
    await page.waitForTimeout(1100);
    if (!/Accords trouvés : G · Em · C · D/.test(await text())) U2.push('aperçu des accords absent');
    await click('[data-act="song-save"]');
    const t = await text();
    if (!/Prête à/.test(t) || !/Capodastre case 1/.test(t)) U2.push('fiche de chanson incomplète');
    await click('[data-act="song-tr"][data-arg="1"]', 300);
    if (!/Transposition : \+1/.test(await text())) U2.push('transposition');
    await click('[data-act="tab"][data-arg="home"]');
    if (!/Ma chanson/.test(await text())) U2.push('la chanson n’apparaît pas à l’accueil');
    await click('[data-act="tab"][data-arg="studio"]');
    await click('[data-act="st-add"][data-arg="vi"]', 300);
    await click('[data-act="st-save"]');
    if (!/Grille du/.test(await text())) U2.push('idée non gardée');
    await click('[data-act="tab"][data-arg="tools"]');
    await click('[data-act="tool"][data-arg="metro"]');
    await click('[data-act="m-toggle"]', 1200);
    const beats = await page.$$eval('#mDots i.on', x => x.length);
    await click('[data-act="m-toggle"]');
    if (beats < 1) U2.push('le métronome n’avance pas');
    await click('[data-act="tool-back"]');
    await click('[data-act="tool"][data-arg="dict"]');
    if ((await page.$$('.dict [data-act="dict-play"]')).length < 8) U2.push('dictionnaire vide');
    await click('[data-act="tool-back"]');
    // accordeur guidé : micro factice ouvert, aiguille, changement de corde, note de référence
    await click('[data-act="tool"][data-arg="tuner"]', 1500);
    if (!(await page.$('#toolTuner .gauge'))) U2.push('accordeur : pas d’aiguille');
    await click('[data-act="tt-string"][data-arg="5"]', 600);
    if (!/Corde 1 · Mi aigu/.test(await text())) U2.push('accordeur : corde choisie non affichée');
    await click('[data-act="tt-ref"]', 400);
    if (!/Note de référence…/.test(await text())) U2.push('accordeur : l’aiguille n’attend pas la fin de la note de référence');
    await click('[data-act="tool-back"]');
  } catch (e) { U2.push(e.message); }
  report('chanson collée (aperçu, capo, transposition), studio, métronome, dictionnaire, accordeur guidé', U2.concat(errors.splice(0)));

  /* --- séances : pilote qui répond à chaque écran (critères cochés, compte saisi, cordes « claires ») */
  async function drive(maxMs, o) {
    o = o || {};
    const t0 = Date.now(), seen = new Set(), used = {};
    while (Date.now() - t0 < maxMs) {
      const st = await page.evaluate(() => {
        const s = document.querySelector('.sess'); if (!s) return null;
        return { acts: [...s.querySelectorAll('[data-act]')].filter(b => !b.disabled && b.offsetParent).map(b => b.dataset.act), verdict: (s.querySelector('.verdict') || {}).textContent || '', h1: (s.querySelector('h1') || {}).textContent || '', fb: [...s.querySelectorAll('.fb')].map(x => x.textContent).join(' / ') };
      });
      if (!st) return seen;
      if (st.verdict) seen.add('verdict:' + st.verdict + ' — ' + st.fb);
      if (st.h1) seen.add(st.h1);
      if (o.quitAt && seen.has(o.quitAt)) { await click('.sess [data-act="sess-quit"]', 60); await click('.sess [data-act="sess-quit"]', 400); o.quitAt = null; continue; }
      if (st.acts.includes('chk-ok')) {
        // critères : tous cochés (ou aucun), puis valider
        // l'écran est redessiné à chaque critère coché : on relit la liste à chaque fois
        for (let guard = 0; o.crit !== 'none' && guard < 8 && (await page.locator('.sess .check:not(.on)').count()); guard++) { await page.locator('.sess .check:not(.on)').first().click({ timeout: 4000 }); await page.waitForTimeout(80); }
        seen.add('crit'); await click('.sess [data-act="chk-ok"]', 200); continue;
      }
      if (st.acts.includes('cnt-ok')) { await page.fill('#cntIn', String(o.count || 12)); seen.add('cnt'); await click('.sess [data-act="cnt-ok"]', 200); continue; }
      const order = ['audio-wake', 'go', 'show-ok', 'listen-ok', 'wait-ok', 'tn-next', 'guided-next', 'pred', 'q-ans', 'ch-ans', 'card-ans', 'card-next', 'str-ans', 'cue-set', 'cue-ok', 'res-next', 'self', 'cp-add', 'cp-save', 'song-rec', 'crit', 'song-stop', 'song-done', 'retake', 'sess-close'];
      const max = Object.assign({ 'cp-add': 3, crit: 3 }, o.max || {});
      const act = order.find(a => st.acts.includes(a) && (used[a] || 0) < (max[a] || Infinity));
      if (act) {
        seen.add(act); used[act] = (used[act] || 0) + 1;
        const arg = { self: '1', 'str-ans': 'ok', 'cue-ok': '1' }[act];
        const sel = '.sess [data-act="' + act + '"]' + (arg ? '[data-arg="' + arg + '"]' : '');
        const n = await page.locator(sel).count();
        try { await page.locator(sel).nth((used[act] - 1) % Math.max(1, n)).click({ timeout: 4000 }); } catch (e) { used[act]--; }
        await page.waitForTimeout(act === 'song-rec' ? 3600 : act === 'cue-set' ? 50 : 150);
      } else await page.waitForTimeout(250);
    }
    return seen;
  }
  const verdicts = seen => [...seen].filter(x => x.startsWith('verdict:'));
  /** Séance d'un exercice avec des paramètres choisis (comme « Exercices au choix », mais réglée pour le test). */
  const runPlan = items => page.evaluate(its => { AC.ui.startSession({ type: 'libre', title: 'Test', minutes: 5, block: 1, items: its, targetP: 0.8, notes: [], reasons: [] }); }, items);

  const U3 = [];
  try {
    // exercice d'oreille seul : bibliothèque → « Majeur ou mineur ? »
    await click('[data-act="tab"][data-arg="tools"]'); await click('[data-act="tool"][data-arg="lib"]');
    await click('[data-act="lib-start"][data-arg="qualite"]', 600);
    const seen = await drive(120000);
    if (!seen.has('q-ans') || !seen.has('Séance terminée')) U3.push('quiz : ' + [...seen].join(', '));
    const s = await page.evaluate(() => AC.ui.state());
    if (!s.sessions.length || s.sessions[s.sessions.length - 1].type !== 'libre') U3.push('séance libre non enregistrée');
  } catch (e) { U3.push(e.message); }
  report('exercice d’oreille complet, enregistré', U3.concat(errors.splice(0)));

  const U4 = [];
  try {
    // pulsation avec de VRAIES tapes : des appuis envoyés sur la zone de l'écran, calés sur les clics entendus
    await page.evaluate(() => {
      AC.ui.tapPadTest = events => {
        const A = AC.audio;
        events.forEach(e => {
          const ms = (e.t - A.now()) * 1000 + 30 + 8 * (Math.random() - 0.5);
          setTimeout(() => { const pad = document.getElementById('tapPad'); if (pad) pad.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); }, Math.max(0, ms));
        });
      };
    });
    await runPlan([{ ex: 'pulse', fixed: [{ tempo: 100, sub: 1, silent: 1, tol: 70 }, { tempo: 92, sub: 2, silent: 2, tol: 70 }], comp: 'pulsation' }]);
    const seen = await drive(90000);
    const v = verdicts(seen);
    if (v.length !== 2 || !v.every(x => /^verdict:Réussi/.test(x) && /tempo tenu/.test(x))) U4.push('pulsation : ' + v.join(' | '));
    const s = await page.evaluate(() => { const st = AC.ui.state(); return { off: st.profile.tapOffset, sd: st.series.tapSd, it: st.items.pulse }; });
    if (!Number.isFinite(s.off) || !s.sd || !s.sd.length || !s.it || s.it.n !== 2) U4.push('mesures non enregistrées : ' + JSON.stringify(s));
    await page.evaluate(() => { AC.ui.tapPadTest = null; });
  } catch (e) { U4.push(e.message); }
  report('pulsation avec de vraies tapes sur l’écran : réussie, tempo tenu sans le clic, délai et régularité enregistrés', U4.concat(errors.splice(0)));

  const U5 = [];
  try {
    // rythmique : motif tapé (tapes injectées : un tapeur qui oublie un coup sur quatre), puis joué avec le clic,
    // enregistré par le micro factice, réécouté et noté avec les critères
    await page.evaluate(() => { AC.ui.tapPadTest = (events, taps) => events.forEach((e, i) => { if (i % 4 !== 3) taps.push(e.t + 0.05); }); });
    await runPlan([{ ex: 'rythme', fixed: [{ p: 'r3', tempo: 96, seq: ['Em'], tol: 45 }], comp: 'rythmiques' }]);
    const seen = await drive(90000);
    const v = verdicts(seen).join(' | ');
    if (!/Motif tapé : presque/.test(v) || !/6\/24 coups sans tape/.test(v) || !/À la guitare : 3\/3 critères/.test(v) || !seen.has('crit')) U5.push('rythmique : ' + v);
    const parts = await page.evaluate(() => { const s = AC.ui.state(); const x = s.sessions[s.sessions.length - 1]; return x.takes[0] && x.takes[0].m; });
    if (!parts || parts.hit == null || parts.crit !== '3/3') U5.push('mesures de la prise : ' + JSON.stringify(parts));
    await page.evaluate(() => { AC.ui.tapPadTest = null; });
  } catch (e) { U5.push(e.message); }
  report('rythmique : tapée (coups oubliés repérés), puis jouée avec le clic, enregistrée et notée par critères', U5.concat(errors.splice(0)));

  const U6 = [];
  try {
    await runPlan([{ ex: 'propre', fixed: [{ v: 'C' }], comp: 'accords' }, { ex: 'forme', fixed: [{ chords: ['Em', 'C', 'G', 'D'], limit: 3 }], comp: 'accords' }, { ex: 'minute', fixed: [{ a: 'Em', b: 'C', sec: 12, target: 40 }], comp: 'changements' }, { ex: 'releve', fixed: [{ key: 7, chords: ['G', 'C', 'G'], set: ['G', 'C'] }], comp: 'oreille' }]);
    const seen = await drive(150000, { count: 9 });
    const v = verdicts(seen).join(' | ');
    if (!/Les 5 cordes sonnent/.test(v)) U6.push('corde par corde : ' + v);
    if (!/4\/4 accords posés à temps et propres/.test(v)) U6.push('chrono : ' + v);
    if (!/9 changements en 12 s, soit 45\/min/.test(v)) U6.push('une minute : ' + v);
    if (!/1\. G/.test(v)) U6.push('accord retrouvé : ' + v);
    const st = await page.evaluate(() => { const s = AC.ui.state(); return { c: s.chords.C, em: s.chords.Em, pair: s.pairs['C|Em'] || s.pairs['Em|C'] }; });
    if (!st.c || st.c.clean !== 1 || !st.c.strings || !st.em || !(st.em.form > 0) || !st.pair || st.pair.best !== 45) U6.push('enregistré : ' + JSON.stringify(st));
  } catch (e) { U6.push(e.message); }
  report('corde par corde, accords au chrono, changements comptés, accord retrouvé à l’oreille : verdicts et records', U6.concat(errors.splice(0)));

  // ateliers : cartes, composition (grille gardée), filage enregistré, section de la chanson (enregistrée et réécoutable)
  for (const [ex, want, label] of [['cartes', 'card-ans', 'cartes de théorie'], ['compo', 'cp-save', 'atelier de composition (idée gardée)'], ['filage', 'song-done', 'filage enregistré puis noté'], ['chanson', 'crit', 'section de ma chanson jouée avec le clic, enregistrée, notée']]) {
    const UX = [];
    try {
      const n0 = await page.evaluate(() => ({ s: AC.ui.state().sessions.length, i: AC.ui.state().ideas.length }));
      await click('[data-act="tab"][data-arg="tools"]'); await click('[data-act="tool"][data-arg="lib"]');
      await click('[data-act="lib-start"][data-arg="' + ex + '"]', 800);
      const seen = await drive(240000);
      if (!seen.has(want)) UX.push('étape « ' + want + ' » jamais atteinte : ' + [...seen].join(', '));
      const n1 = await page.evaluate(() => ({ s: AC.ui.state().sessions.length, i: AC.ui.state().ideas.length }));
      if (n1.s <= n0.s) UX.push('séance non enregistrée');
      if (ex === 'compo' && n1.i <= n0.i) UX.push('idée non gardée');
      if (ex === 'chanson') {
        const recs = await page.evaluate(async () => (await AC.store.listRecs(r => r.kind === 'song')).length);
        if (recs < 2) UX.push('prises de la chanson non enregistrées (' + recs + ')');
      }
    } catch (e) { UX.push(e.message); }
    report(label, UX.concat(errors.splice(0)));
  }

  const U7 = [];
  try {
    // bilan d'entrée : accordage guidé (corde par corde), puis interrompu et repris depuis l'accueil
    await click('[data-act="tab"][data-arg="home"]');
    await click('[data-act="start"]', 800);
    await drive(30000, { quitAt: 'go', max: { 'tn-next': 6 } });
    const tuned = await page.evaluate(() => { const s = AC.ui.state(); return s.current && s.current.sess.takes.some(t => t.ex === 'accordage'); });
    await page.waitForTimeout(300);
    const st = await page.evaluate(() => { const s = AC.ui.state(); return { cur: !!s.current }; });
    if (!st.cur) U7.push('séance non reprenable');
    if (!tuned) U7.push('accordage non fait');
    if (!/Séance en cours/.test(await text())) U7.push('pas de bouton « Reprendre » à l’accueil');
    await click('[data-act="resume"]', 600);
    if (!(await page.$('.sess'))) U7.push('la reprise n’ouvre pas la séance');
    await click('.sess [data-act="sess-quit"]', 60); await click('.sess [data-act="sess-quit"]', 500);
    await drive(5000);
  } catch (e) { U7.push(e.message); }
  report('bilan : accordage guidé corde par corde, interrompu puis repris depuis l’accueil', U7.concat(errors.splice(0)));

  const U8 = [];
  try {
    // export : un fichier JSON téléchargé, réimportable
    await click('[data-act="tab"][data-arg="home"]'); await click('[data-act="nav"][data-arg="settings"]');
    const [dl] = await Promise.all([page.waitForEvent('download'), click('[data-act="export"]')]);
    const p = await dl.path(), j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (j.app !== 'ACCORD' || !j.state || !j.state.songs.length || j.state.v !== 2) U8.push('fichier exporté incomplet');
    await page.setInputFiles('[data-change="import-file"]', p);
    await page.waitForTimeout(500);
    if (!/Sauvegarde importée/.test(await text())) U8.push('import non confirmé');
    await click('[data-act="nav"][data-arg="settings"]');
    await page.selectOption('[data-change="pf-theme"]', 'dark');
    if ((await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) !== 'dark') U8.push('thème sombre non appliqué');
  } catch (e) { U8.push(e.message); }
  report('sauvegarde exportée puis réimportée, thème', U8.concat(errors.splice(0)));

  await browser.close(); srv.close();
  console.log('\n' + (count - fails) + '/' + count + ' tests réussis');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
