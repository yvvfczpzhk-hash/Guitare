// Évaluation des attaques : rappel/précision et précision temporelle sur de nombreuses prises synthétiques
const path=__dirname+'/../../';
global.AC = {}; const T = require(path+'dev/src/theory.js'); global.AC.theory = T;
const D = require(path+'dev/src/dsp.js'); const S = require(path+'tests/synth.js');
function makeTake(seed, o) {
  const r = S.rng(seed*977+1);
  const pats = o.pats || ['r1','r2','r3','r4','r6','r7','r8','r9','r11','r12','r13','r14'];
  const pid = pats[Math.floor(r()*pats.length)];
  const pat = T.strum(pid);
  const tempo = o.tempo || Math.round(65 + r()*65 / (pat.sub===4?1.6:1));
  const beat = 60/tempo, lead=0.4, countIn=4, lat = 0.08 + r()*0.12, bars=2;
  const chords = ['G','C','D','Em','Am','A','E','F','Cadd9','G-pop'];
  const ch = chords[Math.floor(r()*chords.length)];
  const dur = lead + (countIn + bars*pat.sig)*beat + 1.2;
  const y = new Float32Array(Math.ceil(dur*S.FS));
  const clicks=[]; for(let i=0;i<countIn+bars*pat.sig;i++) clicks.push(lead+i*beat);
  if (o.speaker !== false) clicks.forEach((t,i)=>S.addClick(y,t+lat,(o.clickAmp||0.1)*(0.5+r()),seed*50+i));
  const evs=[]; for(let b=0;b<bars;b++) for(const e of T.strumEvents(pat)) evs.push({beat:countIn+b*pat.sig+e.beat,k:e.k,frets:T.voicing(ch).frets});
  const times=S.playGrid(y,evs,tempo,lead+lat,{sd:o.sd!=null?o.sd:0.012,seed,spread:o.spread, amp: 0.12+0.12*r()});
  const out=S.room(y,{snr:o.snr!=null?o.snr:30+r()*15,seed, reverb: 0.08+0.1*r()});
  return {pcm: out, times, kinds: evs.map(e=>e.k), clicks, lat, tempo, pid, ch, beat, slot: beat/pat.sub, events: evs.map(e=>({t: lead + e.beat*beat, k: e.k}))};
}
function evaluate(N, o, detect) {
  let tp=0, fn=0, fp=0; const errs=[]; const byK={};
  for (let s=1; s<=N; s++) {
    const tk = makeTake(s, o);
    const x = D.prepare(tk.pcm, S.FS).x;
    const ons = detect(x, tk);
    const used = new Set();
    tk.times.forEach((t,i) => {
      let bj=-1, bd=1; ons.forEach((on,j)=>{ if(used.has(j))return; const d=on-t; if (Math.abs(d)<0.06 && Math.abs(d)<Math.abs(bd)){bd=d;bj=j;} });
      const k = tk.kinds[i]; byK[k] = byK[k]||{tp:0,fn:0};
      if (bj>=0) { used.add(bj); tp++; byK[k].tp++; errs.push(1000*bd); } else { fn++; byK[k].fn++; }
    });
    const t0 = tk.times[0]-0.1, t1 = tk.times[tk.times.length-1]+0.3;
    ons.forEach((on,j)=>{ if(!used.has(j) && on>t0 && on<t1) fp++; });
  }
  const ae = errs.map(Math.abs).sort((a,b)=>a-b);
  return { recall: (tp/(tp+fn)).toFixed(3), prec: (tp/(tp+fp)).toFixed(3), bias: D.median(errs).toFixed(1), mad: D.mad(errs).toFixed(1), p90: ae[Math.floor(0.9*ae.length)].toFixed(1), p98: ae[Math.floor(0.98*ae.length)].toFixed(1), byK: Object.entries(byK).map(([k,v])=>k+':'+(v.tp/(v.tp+v.fn)).toFixed(2)).join(' ') };
}
module.exports = { makeTake, evaluate };
if (require.main === module) {
  const N = +process.argv[2] || 30;
  console.log('current', JSON.stringify(evaluate(N, {}, (x)=>D.onsets(x,{}).list.map(o=>o.t))));
}
