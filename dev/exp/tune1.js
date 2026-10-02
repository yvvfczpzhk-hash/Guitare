const path=__dirname+'/../../';
global.AC = {}; const T = require(path+'dev/src/theory.js'); global.AC.theory = T;
const D = require(path+'dev/src/dsp.js'); const S = require(path+'tests/synth.js');
// mono : trames de 4096 à 44,1 kHz (≈ 93 ms), 0,2 à 2 s après l'attaque
const errs=[]; let fails=0;
for (let seed=1; seed<=4; seed++) for (let s=0; s<6; s++) for (const det of [-30,-8,0,5,20]) {
  const y=new Float32Array(Math.ceil(3*S.FS)); S.addString(y,{t:0.2, midi:T.OPEN[s], cents:det, amp:0.15, seed:seed*17+s});
  const x=S.room(y,{snr:35,seed});
  for (const tt of [0.4, 0.9, 1.6]) { const a=Math.round(tt*S.FS); const fr=x.subarray(a, a+4096); const r=D.tune(fr, S.FS); if (!isFinite(r.cents) || r.string!==s) { fails++; continue; } errs.push(r.cents-det); }
}
console.log('mono tuner: fails', fails, 'median |err|', D.median(errs.map(Math.abs)).toFixed(2), 'p95', D.percentile(errs.map(Math.abs),0.95).toFixed(2), 'max', Math.max(...errs.map(Math.abs)).toFixed(2));
// poly
const perr=[]; let pnull=0;
for (let seed=1; seed<=8; seed++) {
  const r=S.rng(seed*7919+13); r(); const dets=[0,1,2,3,4,5].map(()=>Math.round((r()-0.5)*50));
  const y=new Float32Array(Math.ceil(3*S.FS)); S.addStrum(y,{t:0.3, frets:[0,0,0,0,0,0], dir:'D', amp:0.15, seed, cents: Object.fromEntries(dets.map((d,i)=>[i,d]))});
  const x=S.room(y,{snr:35,seed}); const res=D.polyTune(x, S.FS);
  res.forEach((o,i)=>{ if (o.cents==null) pnull++; else perr.push(o.cents-dets[i]); });
  console.log('true', dets.join(' '), '| est', res.map(o=>o.cents==null?'?':o.cents.toFixed(0)).join(' '));
}
console.log('poly tuner: null', pnull, 'median |err|', D.median(perr.map(Math.abs)).toFixed(2), 'p90', D.percentile(perr.map(Math.abs),0.9).toFixed(2), 'max', Math.max(...perr.map(Math.abs)).toFixed(1));
