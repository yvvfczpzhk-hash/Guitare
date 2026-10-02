const path=__dirname+'/../../';
global.AC = {}; const T = require(path+'dev/src/theory.js'); global.AC.theory = T;
const D = require(path+'dev/src/dsp.js'); const S = require(path+'tests/synth.js');
const FS=22050, MLO=36, NS=65;
const VOC = ['C','G','D','A','E','Am','Em','Dm','E7','A7','D7','G7','Am7','Em7','Cmaj7','Fmaj7','F-mini','Asus2','Dsus2','Dsus4','Cadd9','G-pop','Em7-pop','B7','Bm','F'].map(id=>T.voicing(id));
const hz = m => 440*Math.pow(2,(m-69)/12);
function voicingSpec(v, P) {
  const out = new Float64Array(NS);
  T.voicingNotes(v).forEach(n => { if (n==null) return;
    for (let h=1; h<=P.H; h++) { const m = n + 12*Math.log2(h), i = m - MLO; if (i > NS-1) break; const f=hz(n)*h; const mic = f<110?0.45:f<160?0.75:1; const a = mic/Math.pow(h,P.pw); const lo=Math.floor(i), fr=i-lo; if (lo>=0) out[lo]+=a*(1-fr); if (lo+1<NS) out[lo+1]+=a*fr; }
  });
  return out;
}
function obsSpec(x, a, b, P) {
  const spec = D.avgSpectrum(x, a, b, 2048, 8192);
  const st = D.semitoneSpectrum(spec, 8192);
  const fl = D.percentile(st, P.flq);
  return st.map(v => Math.max(0, v - fl));
}
function sim(o, e, P) { let ab=0, aa=0, bb=0; for (let i=0;i<NS;i++){ const x=Math.pow(o[i],P.c), y=Math.pow(e[i],P.c); ab+=x*y; aa+=x*x; bb+=y*y; } return ab/Math.sqrt(aa*bb+1e-30); }
function run(P) {
  let ok=0, n=0; const conf={}; const margins=[];
  const exps = VOC.map(v=>({v, e: voicingSpec(v,P)}));
  for (let seed=1; seed<=5; seed++) for (const v of VOC) {
    const y = new Float32Array(Math.ceil(1.4*S.FS));
    S.addStrum(y, {t:0.3, frets:v.frets, dir:'D', amp:0.15+0.05*S.rng(seed)(), seed: seed*13+v.id.length});
    const out = S.room(y, {snr: 32, seed});
    const x = D.prepare(out, 44100).x;
    const o = D.onsets(x, {}).list[0]; const t = o ? o.t : 0.3;
    const ob = obsSpec(x, (t+0.04)*FS, (t+0.55)*FS, P);
    let best=null, bs=-1, s2=-1, sv=0;
    for (const c of exps) { const s = sim(ob, c.e, P); if (c.v.id===v.id) sv=s; if (s>bs){s2=bs;bs=s;best=c.v.id;} else if (s>s2) s2=s; }
    n++; if (best===v.id) { ok++; margins.push(bs-s2); } else { const k=v.id+'→'+best; conf[k]=(conf[k]||0)+1; }
  }
  return {acc:(ok/n).toFixed(3), medMargin: D.median(margins).toFixed(3), conf};
}
for (const P of [{H:8,pw:0.8,c:0.5,flq:0.3},{H:8,pw:1.0,c:0.5,flq:0.3},{H:12,pw:1.0,c:0.5,flq:0.3},{H:8,pw:1.2,c:0.5,flq:0.3},{H:8,pw:1.0,c:0.33,flq:0.3},{H:8,pw:1.0,c:0.7,flq:0.3},{H:8,pw:1.0,c:0.5,flq:0.5}]) {
  const t0=Date.now(); const r=run(P); console.log(JSON.stringify(P), r.acc, 'margin', r.medMargin, JSON.stringify(r.conf), (Date.now()-t0)+'ms');
}
