const path=__dirname+'/../../';
global.AC = {}; const T = require(path+'dev/src/theory.js'); global.AC.theory = T;
const D = require(path+'dev/src/dsp.js'); const { makeTake } = require('./evalOn.js');
for (const snr of [40, 25, 18, 12]) {
  for (const seed of [1,2,3]) {
    const tk = makeTake(seed, {snr, pats:['r4']}); const x = D.prepare(tk.pcm, 44100).x;
    const on = D.onsets(x, {}); const f = on.odf;
    const vs = on.list.map(o=>o.v);
    // true-matched v
    const tv = tk.times.map(t => { const o = on.list.reduce((a,b)=>Math.abs(b.t-t)<Math.abs(a.t-t)?b:a); return Math.abs(o.t-t)<0.05 ? o.v : NaN; });
    console.log('snr', snr, 'seed', seed, 'odf p50', D.percentile(f,0.5).toFixed(4), 'p90', D.percentile(f,0.9).toFixed(4), 'p995', D.percentile(f,0.995).toFixed(3), '| n onsets', on.list.length, 'true', tk.times.length, '| true v min', Math.min(...tv.filter(isFinite)).toFixed(3), 'med', D.median(tv).toFixed(3), '| other v max', Math.max(0,...on.list.filter(o=>!tk.times.some(t=>Math.abs(t-o.t)<0.05)).map(o=>o.v)).toFixed(3));
  }
}
