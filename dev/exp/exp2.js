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
console.log('onsets', on.list.map(o=>o.t.toFixed(3)).join(' '));
console.log('true  ', times.map(t=>t.toFixed(3)).join(' '));
console.log('clicks+lat', clicks.map(t=>(t+lat).toFixed(3)).join(' '));
// chuck features for each true event
const env=on.env;
evs.forEach((e,i)=>{ const f=D.chuckFeatures(on.xb, env, times[i], times[i+1]); console.log(e.k, 'decay', f.decay.toFixed(1), 'flat', f.flat.toFixed(3), 'p', f.chuck.toFixed(2)); });
