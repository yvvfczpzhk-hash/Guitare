'use strict';
/*
 * Tests dans un vrai navigateur (Chromium, via Playwright) : node tests/browser.js
 *   (une fois : npm i -D playwright && npx playwright install chromium)
 * 1) Sons de l'app rendus par le vrai moteur Web Audio : notes justes, accords reconnus par l'analyse de l'app,
 *    rythmiques et clics placés au bon instant, pas de saturation.
 * 2) Interface : premier lancement, accueil et plan du jour, onglets, chanson collée, studio, outils, réglages,
 *    puis des séances complètes avec un micro factice (quiz d'oreille, prise au micro, reprise d'une séance).
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
  await page.waitForFunction(() => window.AC && AC.audio && AC.dsp && AC.ui && AC.ui.state);

  /* ------------------------------------------------------------ 1) sons */
  const snd = await page.evaluate(async () => {
    const A = AC.audio, D = AC.dsp, T = AC.theory, out = { notes: [], chords: [], rhythm: [], clicks: [], peak: 0 };
    const tune = (pcm, sr, t) => { const a = Math.round(t * sr); return D.tune(pcm.subarray(a, a + 4096), sr); };
    for (const m of [40, 45, 50, 55, 59, 64, 69, 76]) {
      const { pcm, sr } = await A.renderOffline({ kind: 'note', midi: m, dur: 1.6 }, 48000, 2);
      const r = tune(pcm, sr, 0.5);
      out.notes.push({ m, e: 100 * (r.midi - m) });
      for (let i = 0; i < pcm.length; i++) out.peak = Math.max(out.peak, Math.abs(pcm[i]));
    }
    const V = ['C', 'G', 'D', 'Am', 'Em', 'E', 'A', 'F', 'Cadd9', 'G-pop', 'Dsus4', 'Bm'].map(id => T.voicing(id));
    for (const v of V) {
      const { pcm, sr } = await A.renderOffline({ kind: 'strum', v: v.id }, 44100, 2.2);
      for (let i = 0; i < pcm.length; i++) out.peak = Math.max(out.peak, Math.abs(pcm[i]));
      const x = D.prepare(pcm, sr).x, on = D.onsets(x, {}).list[0], t = on ? on.t : 0.08;
      // candidats : les autres accords (pas les variantes du même accord, ex. Sol et « Sol pop », jugées équivalentes)
      const r = D.identify(D.observe(x, (t + 0.04) * 22050, (t + 0.9) * 22050), V.filter(w => w.id === v.id || w.sym !== v.sym));
      out.chords.push({ id: v.id, best: r.best });
    }
    // rythmique « Folk » à 90 BPM sur Sol : chaque coup au bon instant
    const tempo = 90, beat = 60 / tempo;
    const { pcm, sr } = await A.renderOffline({ kind: 'pattern', strum: 'r3', seq: ['G'], bpc: 4, tempo, bars: 2, withClicks: false }, 44100, 6.5);
    const evs = AC.catalog.rhythmScore({ strum: 'r3', seq: ['G'], bpc: 4, tempo, bars: 2 }).events;
    const ons = D.onsets(D.prepare(pcm, sr).x, {}).list.map(o => o.t);
    const t0 = ons[0];
    evs.forEach(e => { const exp = t0 + e.beat * beat; const near = ons.reduce((b, o) => (Math.abs(o - exp) < Math.abs(b - exp) ? o : b), Infinity); out.rhythm.push({ k: e.k, e: 1000 * (near - exp) }); });
    out.extra = ons.length - evs.length;
    // clics : instants retrouvés par la mesure de latence de l'app (latence nulle hors temps réel)
    const ck = await A.renderOffline({ kind: 'clicks', tempo: 100, n: 8 }, 48000, 6);
    const xc = D.prepare(ck.pcm, ck.sr).x, times = []; for (let i = 0; i < 8; i++) times.push(0.08 + i * 0.6);
    out.lat = D.measureLatency(xc, times);
    return out;
  });
  const P1 = [];
  snd.notes.forEach(n => { if (!(Math.abs(n.e) <= 1.5)) P1.push('note ' + n.m + ' : ' + n.e.toFixed(2) + ' c'); });
  report('notes de la guitare de l’app justes à ±1,5 cent dans le vrai moteur audio', P1);
  report('accords grattés par l’app reconnus par l’analyse de l’app (12 accords)', snd.chords.filter(c => c.best !== c.id).map(c => c.id + ' → ' + c.best));
  // la précision de la programmation est vérifiée par les clics (ci-dessous) ; ici, le contenu du motif : chaque coup
  // présent, à sa place à l'étalement d'un coup gratté près (~20 ms de la 1re à la dernière corde), aucun en trop
  const P3 = [], worst = Math.max(...snd.rhythm.map(r => Math.abs(r.e)));
  if (worst > 25) P3.push('écart max ' + worst.toFixed(1) + ' ms');
  if (snd.extra) P3.push((snd.extra > 0 ? snd.extra + ' attaque(s) en trop' : -snd.extra + ' coup(s) manquant(s)'));
  report('rythmique jouée par l’app : tous les coups du motif, chacun à sa place (±25 ms), aucun en trop', P3);
  // la chaîne de sortie (limiteur suréchantillonné) retarde tout le son de quelques ms : sans effet sur les mesures,
  // puisque la latence est mesurée sur les clics passés par la même chaîne ; on vérifie un retard faible et constant
  report('clics du métronome retrouvés dans le son, retard constant (< 5 ms, dispersion ≤ 1 ms)', snd.lat && snd.lat.latency >= 0 && snd.lat.latency <= 0.005 && snd.lat.spread <= 1 && snd.lat.n >= 7 ? [] : ['mesure : ' + JSON.stringify(snd.lat)]);
  report('pas de saturation (crête < 1)', snd.peak < 1 ? [] : ['crête ' + snd.peak.toFixed(3)]);

  /* ------------------------------------------------------------ 2) interface */
  const click = async (sel, wait) => { if (!(await page.locator(sel).count())) throw new Error('absent : ' + sel); await page.locator(sel).first().click({ timeout: 5000 }); await page.waitForTimeout(wait || 120); };
  const text = async () => page.$eval('body', b => b.innerText);
  const U1 = [];
  try {
    await click('[data-act="onb"][data-arg="1"]');
    await click('[data-act="onb-level"][data-arg="debut"]');
    await click('[data-act="onb-done"]');
    if (!/Comment ça va aujourd’hui/.test(await text())) U1.push('pas de question sur la forme du jour');
    await click('[data-act="ck-form"][data-arg="4"]'); await click('[data-act="ck-ok"]');
    if (!/Bilan d’entrée/.test(await text())) U1.push('le premier plan n’est pas le bilan d’entrée');
    for (const t of ['progress', 'songs', 'studio', 'tools', 'home']) { await click(`[data-act="tab"][data-arg="${t}"]`); if ((await text()).length < 200) U1.push('onglet ' + t + ' vide'); }
    await click('[data-act="nav"][data-arg="settings"]'); await click('[data-act="nav"][data-arg="science"]');
    if (!/Wilson/.test(await text())) U1.push('sources scientifiques absentes');
  } catch (e) { U1.push(e.message); }
  report('premier lancement, plan du jour, onglets, réglages et sources', U1.concat(errors.splice(0)));

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
    await click('[data-act="tool"][data-arg="tuner"]', 1500);
    await click('[data-act="tool-back"]');
  } catch (e) { U2.push(e.message); }
  report('chanson collée (aperçu, capo, transposition), studio, métronome, dictionnaire, accordeur', U2.concat(errors.splice(0)));

  /* --- séances : pilote qui répond à chaque écran */
  async function drive(maxMs, o) {
    o = o || {};
    const t0 = Date.now(), seen = new Set(), used = {};
    while (Date.now() - t0 < maxMs) {
      const st = await page.evaluate(() => {
        const s = document.querySelector('.sess'); if (!s) return null;
        return { acts: [...s.querySelectorAll('[data-act]')].filter(b => !b.disabled && b.offsetParent).map(b => b.dataset.act), verdict: (s.querySelector('.verdict') || {}).textContent || '', h1: (s.querySelector('h1') || {}).textContent || '' };
      });
      if (!st) return seen;
      if (st.verdict) seen.add('verdict:' + st.verdict);
      if (st.h1) seen.add(st.h1);
      if (o.quitAt && seen.has(o.quitAt)) { await click('.sess [data-act="sess-quit"]', 60); await click('.sess [data-act="sess-quit"]', 400); o.quitAt = null; continue; }
      const order = ['audio-wake', 'go', 'show-ok', 'listen-ok', 'wait-ok', 'tune-done', 'guided-next', 'pred', 'q-ans', 'card-ans', 'card-next', 'res-next', 'self', 'cp-add', 'cp-save', 'song-rec', 'crit', 'song-stop', 'song-done', 'retake', 'sess-close'];
      const max = Object.assign({ 'cp-add': 3, crit: 3 }, o.max || {});
      const act = order.find(a => st.acts.includes(a) && (used[a] || 0) < (max[a] || Infinity));
      if (act) {
        seen.add(act); used[act] = (used[act] || 0) + 1;
        // les boutons d'un même écran se ressemblent : on varie l'argument (accords, critères)
        const sel = '.sess [data-act="' + act + '"]' + (act === 'self' ? '[data-arg="1"]' : '');
        const n = await page.locator(sel).count();
        // localisateur relu au moment du clic : l'écran peut avoir été redessiné entre-temps
        try { await page.locator(sel).nth((used[act] - 1) % Math.max(1, n)).click({ timeout: 4000 }); } catch (e) { used[act]--; }
        await page.waitForTimeout(act === 'song-rec' ? 3600 : 150);
      } else await page.waitForTimeout(300);
    }
    return seen;
  }
  const U3 = [];
  try {
    // exercice d'oreille seul (pas de micro) : bibliothèque → « Majeur ou mineur ? »
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
    // prise au micro (micro factice de Chromium) : « Rythmique », jusqu'au verdict
    await click('[data-act="tab"][data-arg="tools"]'); await click('[data-act="tool"][data-arg="lib"]');
    await click('[data-act="lib-start"][data-arg="rythme"]', 800);
    const seen = await drive(180000);
    if (![...seen].some(x => x.startsWith('verdict:'))) U4.push('aucun verdict après la prise : ' + [...seen].join(', '));
    const s = await page.evaluate(() => ({ n: AC.ui.state().sessions.length, lat: AC.ui.state().profile.latency }));
    if (s.n < 2) U4.push('séance non enregistrée');
  } catch (e) { U4.push(e.message); }
  report('prise au micro (rythmique) : enregistrement, analyse, verdict, retour', U4.concat(errors.splice(0)));

  // ateliers sans prise rythmée : cartes, composition (grille gardée), filage enregistré, section de la chanson
  for (const [ex, want, label] of [['cartes', 'card-ans', 'cartes de théorie'], ['compo', 'cp-save', 'atelier de composition (idée gardée)'], ['filage', 'song-done', 'filage enregistré puis noté'], ['chanson', 'res-next', 'section de ma chanson au micro']]) {
    const UX = [];
    try {
      const n0 = await page.evaluate(() => ({ s: AC.ui.state().sessions.length, i: AC.ui.state().ideas.length }));
      await click('[data-act="tab"][data-arg="tools"]'); await click('[data-act="tool"][data-arg="lib"]');
      await click('[data-act="lib-start"][data-arg="' + ex + '"]', 800);
      const seen = await drive(200000);
      if (!seen.has(want)) UX.push('étape « ' + want + ' » jamais atteinte : ' + [...seen].join(', '));
      const n1 = await page.evaluate(() => ({ s: AC.ui.state().sessions.length, i: AC.ui.state().ideas.length }));
      if (n1.s <= n0.s) UX.push('séance non enregistrée');
      if (ex === 'compo' && n1.i <= n0.i) UX.push('idée non gardée');
    } catch (e) { UX.push(e.message); }
    report(label, UX.concat(errors.splice(0)));
  }

  const U5 = [];
  try {
    // bilan d'entrée interrompu après l'accordage, puis repris depuis l'accueil
    await click('[data-act="tab"][data-arg="home"]');
    await click('[data-act="start"]', 800);
    await drive(15000, { quitAt: 'go' });
    await page.waitForTimeout(300);
    const st = await page.evaluate(() => { const s = AC.ui.state(); return { cur: !!s.current, partial: s.sessions.filter(x => x.partial).length }; });
    if (!st.cur) U5.push('séance non reprenable');
    if (!/Séance en cours/.test(await text())) U5.push('pas de bouton « Reprendre » à l’accueil');
    await click('[data-act="resume"]', 600);
    if (!(await page.$('.sess'))) U5.push('la reprise n’ouvre pas la séance');
    await click('.sess [data-act="sess-quit"]', 60); await click('.sess [data-act="sess-quit"]', 500);
    await drive(5000);
  } catch (e) { U5.push(e.message); }
  report('séance interrompue puis reprise depuis l’accueil', U5.concat(errors.splice(0)));

  const U6 = [];
  try {
    // export : un fichier JSON téléchargé, réimportable
    await click('[data-act="tab"][data-arg="home"]'); await click('[data-act="nav"][data-arg="settings"]');
    const [dl] = await Promise.all([page.waitForEvent('download'), click('[data-act="export"]')]);
    const p = await dl.path(), j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (j.app !== 'ACCORD' || !j.state || !j.state.songs.length) U6.push('fichier exporté incomplet');
    await page.setInputFiles('[data-change="import-file"]', p);
    await page.waitForTimeout(500);
    if (!/Sauvegarde importée/.test(await text())) U6.push('import non confirmé');
    // thème clair/sombre
    await click('[data-act="nav"][data-arg="settings"]');
    await page.selectOption('[data-change="pf-theme"]', 'dark');
    if ((await page.evaluate(() => document.documentElement.getAttribute('data-theme'))) !== 'dark') U6.push('thème sombre non appliqué');
  } catch (e) { U6.push(e.message); }
  report('sauvegarde exportée puis réimportée, thème', U6.concat(errors.splice(0)));

  await browser.close(); srv.close();
  console.log('\n' + (count - fails) + '/' + count + ' tests réussis');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
