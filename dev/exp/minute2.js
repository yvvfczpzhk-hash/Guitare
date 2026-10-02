const path=__dirname+'/../../';
global.AC = {}; const T = require(path+'dev/src/theory.js'); global.AC.theory = T;
const D = require(path+'dev/src/dsp.js'); const S = require(path+'tests/synth.js');
for (const [a,b,cpm] of [['C','G',40],['Am','C',50],['Em','G',45],['D','A',50],['G-pop','Cadd9',60]]) {
  const va=T.voicing(a), vb=T.voicing(b), dur=16, gap=60/cpm, r=S.rng(cpm);
  const y=new Float32Array(Math.ceil((dur+1.5)*S.FS)); let t=0.6, k=0; const truth=[];
  const bad = [2,5,9,12];
  while (t < dur) { const v = k%2? vb: va; let frets=v.frets.slice(); let lab=k%2?'b':'a';
    if (bad.includes(k)) { const kind = k%4; if (kind===2) frets = frets.map((f,s)=> s===3||s===4 ? -1 : f); else frets = frets.map((f,s)=> f>0 && s===T.sounding(v)[1] ? 0 : f); lab='x'+kind; }
    S.addStrum(y,{t, frets, dir:'D', amp:0.14+0.06*r(), seed: 300+k}); truth.push(lab); t += gap*(0.85+0.3*r()); k++; }
  const res = D.analyzeChanges(S.room(y,{snr:32,seed:3}), S.FS, {a: va.id, b: vb.id, t0: 0.3, t1: dur+0.5});
  console.log(a+'/'+b, res.strums.map((s,i)=>truth[i]+':'+Math.max(s.sa,s.sb).toFixed(3)).join(' '));
}
