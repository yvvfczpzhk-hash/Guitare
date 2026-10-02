const path = __dirname + '/../src/';
global.AC = {}; for (const m of ['theory','dsp','gsynth']) require(path + m + '.js');
const { theory: T, dsp: D, gsynth: G } = AC;
// justesse de chaque note de guitare de synthèse (mesurée par l'accordeur de l'app)
const errs = [];
for (const m of [40, 45, 47, 50, 52, 55, 57, 59, 62, 64, 67, 69, 72, 76]) for (const c of [0, 13]) {
  const y = G.note(m + c / 100, { sr: 32000, vel: 0.8 });
  for (const t of [0.3, 0.8, 1.4]) { const a = Math.round(t * 32000); const r = D.tune(y.subarray(a, a + 4096), 32000); errs.push({ m, c, e: 100 * (r.midi - m) - c }); }
}
const bad = errs.filter(x => !isFinite(x.e) || Math.abs(x.e) > 3);
console.log('notes : |erreur| max', Math.max(...errs.map(x => Math.abs(x.e)).filter(isFinite)).toFixed(2), 'c ; hors ±3 c :', bad.length, bad.slice(0, 6).map(x => x.m + '+' + x.c + ':' + (isFinite(x.e) ? x.e.toFixed(1) : 'NaN')).join(' '));
// le clic aigu : énergie concentrée au-dessus de 6,5 kHz (l'analyse de la guitare s'arrête à 6 kHz)
for (const sr of [44100, 48000]) {
  const c = G.click('aigu', true, sr); const N = 4096, re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < c.length; i++) re[i] = c[i]; D.fft(re, im);
  let lo = 0, hi = 0; for (let k = 1; k < N / 2; k++) { const f = k * sr / N, p = re[k] * re[k] + im[k] * im[k]; if (f < 6000) lo += p; else hi += p; }
  console.log('clic', sr, 'part < 6 kHz :', (100 * lo / (lo + hi)).toFixed(2), '%');
}
// accord de synthèse reconnu par l'analyse (empreintes) parmi des accords proches
const V = ['C', 'G', 'D', 'Am', 'Em', 'E', 'A', 'Cadd9', 'G-pop', 'Dsus4'].map(id => T.voicing(id));
let ok = 0;
for (const v of V) {
  const evs = T.voicingNotes(v).map((n, s) => n == null ? null : { t: 0.2 + s * 0.006, midi: n, vel: 0.8, string: s }).filter(Boolean);
  const y = G.render(evs, 1.6, 32000);
  const x = D.prepare(y, 32000).x;
  const obs = D.observe(x, 0.3 * 22050, 1.2 * 22050);
  const r = D.identify(obs, V); if (r.best === v.id) ok++; else console.log('confusion', v.id, '→', r.best);
}
console.log('accords de synthèse reconnus', ok + '/' + V.length);
