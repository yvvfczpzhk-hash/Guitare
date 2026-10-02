const path=__dirname+'/../../';
global.AC = {}; const T = require(path+'dev/src/theory.js'); global.AC.theory = T;
const D = require(path+'dev/src/dsp.js'); const { makeTake, evaluate } = require('./evalOn.js');
console.log(JSON.stringify(evaluate(24, {}, x => D.onsets(x, {}).list.map(o=>o.t))));
for (let s=1;s<=24;s++){
  const tk=makeTake(s,{}); const x=D.prepare(tk.pcm,44100).x;
  const ons=D.onsets(x,{}).list;
  const fps=[]; const used=new Set();
  tk.times.forEach(t=>{ let bj=-1,bd=1; ons.forEach((o,j)=>{ if(used.has(j))return; const d=o.t-t; if(Math.abs(d)<0.06&&Math.abs(d)<Math.abs(bd)){bd=d;bj=j;} }); if(bj>=0) used.add(bj); });
  const t0=tk.times[0]-0.1, t1=tk.times[tk.times.length-1]+0.3;
  ons.forEach((o,j)=>{ if(!used.has(j)&&o.t>t0&&o.t<t1){ const nearT = tk.times.reduce((a,t)=>Math.abs(t-o.t)<Math.abs(a-o.t)?t:a, 1e9); const nearC = tk.clicks.map(c=>c+tk.lat).reduce((a,t)=>Math.abs(t-o.t)<Math.abs(a-o.t)?t:a,1e9); fps.push(o.t.toFixed(3)+' v'+o.v.toFixed(2)+' (strum '+(1000*(o.t-nearT)).toFixed(0)+'ms, click '+(1000*(o.t-nearC)).toFixed(0)+'ms)'); } });
  if (fps.length) console.log(s, tk.pid, tk.tempo, tk.ch, 'medV', D.median(ons.map(o=>o.v)).toFixed(2), fps.join(' | '));
}
