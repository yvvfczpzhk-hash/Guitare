const path=__dirname+'/../../';
global.AC = {}; const T = require(path+'dev/src/theory.js'); global.AC.theory = T;
const D = require(path+'dev/src/dsp.js'); const S = require(path+'tests/synth.js');
const FS=22050, MLO=36, NS=65;
const IDS = ['C','G','D','A','E','Am','Em','Dm','E7','A7','D7','G7','Am7','Em7','Cmaj7','Fmaj7','F-mini','Asus2','Dsus2','Dsus4','Cadd9','G-pop','Em7-pop','B7','Bm','F'];
const VOC = IDS.map(id=>T.voicing(id));
const hz = m => 440*Math.pow(2,(m-69)/12);
function noteAtom(n, P) { const out = new Float64Array(NS); for (let h=1; h<=P.H; h++) { const m = n + 12*Math.log2(h), i = m - MLO; if (i > NS-1) break; const f=hz(n)*h; const mic = f<110?0.45:f<160?0.75:1; const a = mic/Math.pow(h,P.pw); const lo=Math.floor(i), fr=i-lo; if (lo>=0) out[lo]+=a*(1-fr); if (lo+1<NS) out[lo+1]+=a*fr; } return out; }
function nnlsSmall(W, o, iters) { // W: array of atoms (Float64Array NS); coordinate descent
  const K = W.length, a = new Float64Array(K);
  const G = []; for (let p=0;p<K;p++){ G.push([]); for (let q=0;q<K;q++){ let v=0; for(let i=0;i<NS;i++) v+=W[p][i]*W[q][i]; G[p].push(v);} }
  const b = W.map(w=>{ let v=0; for(let i=0;i<NS;i++) v+=w[i]*o[i]; return v; });
  for (let it=0; it<iters; it++) for (let k=0;k<K;k++){ let r=b[k]; for(let q=0;q<K;q++) if(q!==k) r-=G[k][q]*a[q]; a[k]=Math.max(0, r/G[k][k]); }
  const fit = new Float64Array(NS); for (let k=0;k<K;k++) for (let i=0;i<NS;i++) fit[i]+=a[k]*W[k][i];
  let res=0, tot=0; for (let i=0;i<NS;i++){ const d=o[i]-fit[i]; res+=d*d; tot+=o[i]*o[i]; }
  return { a, fit, rel: res/tot };
}
function obsSpec(x, a, b, P) { const spec = D.avgSpectrum(x, a, b, 2048, 8192); const st = D.semitoneSpectrum(spec, 8192); const fl = D.percentile(st, 0.3); return st.map(v => Math.pow(Math.max(0, v - fl), P.c)); }
function classify(ob, cands, P) {
  let best=null, br=Infinity, r2=Infinity; const rs={};
  for (const v of cands) { const W = T.voicingNotes(v).filter(n=>n!=null).map(n=>noteAtom(n,P).map(x=>Math.pow(x,P.c))); const f = nnlsSmall(W, ob, 30); rs[v.id]=f.rel; if (f.rel<br){r2=br;br=f.rel;best=v.id;} else if (f.rel<r2) r2=f.rel; }
  return {best, margin: r2-br, rs};
}
function render(v, seed, o) { const y = new Float32Array(Math.ceil(1.4*S.FS)); S.addStrum(y, Object.assign({t:0.3, frets:v.frets, dir:'D', amp:0.15+0.05*S.rng(seed)(), seed: seed*13+v.id.length}, o||{})); return D.prepare(S.room(y, {snr: 32, seed}), 44100).x; }
for (const P of [{H:8,pw:1,c:0.5},{H:10,pw:0.8,c:0.5},{H:8,pw:1,c:0.7},{H:8,pw:1.2,c:0.6}]) {
  let ok=0,n=0; const conf={};
  for (let seed=1; seed<=4; seed++) for (const v of VOC) {
    const x = render(v, seed); const t = (D.onsets(x,{}).list[0]||{t:0.3}).t;
    const ob = obsSpec(x, (t+0.04)*FS, (t+0.55)*FS, P);
    const r = classify(ob, VOC, P); n++; if (r.best===v.id) ok++; else { const k=v.id+'→'+r.best; conf[k]=(conf[k]||0)+1; }
  }
  console.log('NNLS-residual', JSON.stringify(P), (ok/n).toFixed(3), JSON.stringify(conf));
}
