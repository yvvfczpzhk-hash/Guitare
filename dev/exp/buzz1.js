const path=__dirname+'/../../';
global.AC = {}; const T = require(path+'dev/src/theory.js'); global.AC.theory = T;
const D = require(path+'dev/src/dsp.js'); const S = require(path+'tests/synth.js');
const src = require('fs').readFileSync(path+'dev/src/dsp.js','utf8');
// réutilise buzzIndex via une copie locale
const FS=22050;
function buzzIndex(x, t, f) {
  const a = Math.round((t + 0.05) * FS), len = 2048;
  const m = D.magSpectrum(x, a, len, 4096), df = FS / 4096;
  let harm = 0, res = 0;
  for (let k = Math.round(1500 / df); k <= Math.round(5000 / df); k++) { const h = k * df / f, dist = Math.abs(h - Math.round(h)) * f / df; if (dist <= 2.5) harm += m[k] * m[k]; else res += m[k] * m[k]; }
  let low = 0; for (let k = Math.round(f * 0.8 / df); k <= Math.round(f * 4.2 / df); k++) low += m[k] * m[k];
  return res / Math.max(1e-12, harm + low);
}
for (const lvl of [0, 0.3, 0.6, 1.0, 2.0]) {
  const vals=[];
  for (let seed=1; seed<=4; seed++) for (const midi of [43, 48, 52, 57, 60, 64]) {
    const y = new Float32Array(Math.ceil(1.5*S.FS)); S.addString(y, {t:0.3, midi, amp:0.15, buzz: lvl, seed: seed*11+midi});
    const x = D.prepare(S.room(y,{snr:34, seed}), 44100).x; vals.push(buzzIndex(x, 0.3, 440*Math.pow(2,(midi-69)/12)));
  }
  console.log('buzz', lvl, 'median', D.median(vals).toFixed(4), 'min', Math.min(...vals).toFixed(4), 'max', Math.max(...vals).toFixed(4));
}
