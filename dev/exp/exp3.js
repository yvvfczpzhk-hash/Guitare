const path=__dirname+'/../../';
global.AC = {}; const T = require(path+'dev/src/theory.js'); global.AC.theory = T;
const D = require(path+'dev/src/dsp.js'); const S = require(path+'tests/synth.js');
const tempo=90, beat=60/tempo, lead=0.4, countIn=4, lat=0.137;
const pat=T.strum('r8'); const bars=2;
const dur = lead+(countIn+bars*4)*beat+1.5; const y=new Float32Array(Math.ceil(dur*S.FS));
const clicks=[]; for(let i=0;i<countIn+bars*4;i++) clicks.push(lead+i*beat);
clicks.forEach((t,i)=>S.addClick(y,t+lat,0.12,50+i));
const evs=[]; for(let b=0;b<bars;b++) for(const e of T.strumEvents(pat)) evs.push({beat:countIn+b*4+e.beat,k:e.k,frets:T.voicing('G').frets});
const times=S.playGrid(y,evs,tempo,lead+lat,{sd:0.012,seed:3});
const out=S.room(y,{snr:35,seed:3});
const prep=D.prepare(out,S.FS); const x=prep.x;
const on=D.onsets(x,{});
const hop=on.hop; const f=on.odf;
const top = D.percentile(f, 0.995);
console.log('top', top.toFixed(2), 'p50', D.percentile(f,0.5).toFixed(2), 'p90', D.percentile(f,0.9).toFixed(2));
for (const t of times) { const c = Math.round((t - 1024/2/22050)/hop); let mx=0, mi=0; for (let i=c-8;i<=c+12;i++) if (f[i]>mx){mx=f[i];mi=i;} console.log('true', t.toFixed(3), 'odf max', mx.toFixed(2), 'at', ((mi*hop*22050+512)/22050).toFixed(3)); }
