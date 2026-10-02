const path=__dirname+'/../../';
global.AC = {}; const T = require(path+'dev/src/theory.js'); global.AC.theory = T;
const D = require(path+'dev/src/dsp.js'); const { makeTake, evaluate } = require('./evalOn.js');
const FS=22050;
function detect(x, P) {
  const hop = Math.round(0.005*FS), n=1024;
  const band = D.filtfilt(D.filtfilt(x, FS, 'hp', 75), FS, 'lp', 6000);
  const absS=[]; for (let i=0;i<band.length;i+=7) absS.push(Math.abs(band[i]));
  const ref = D.percentile(absS, 0.995)||1e-6, g=0.5/ref;
  const xb = new Float32Array(band.length); for (let i=0;i<band.length;i++) xb[i]=band[i]*g;
  const S = D.stft(xb, n, hop, 6200);
  const k0 = Math.floor(1500/S.df), k1 = Math.ceil(6000/S.df);
  const nf = new Float32Array(k1+2);
  for (let k=k0-1;k<=k1+1;k++){ const v=[]; for (let t=0;t<S.frames;t+=2) v.push(S.mags[t][k]); nf[k]=D.percentile(v, P.nfp||0.2); }
  const L = S.mags.map(m=>{ const o=new Float32Array(k1+2); for(let k=k0-1;k<=k1+1;k++) o[k]=Math.log10(1+P.lam*Math.max(0, m[k]-P.sub*nf[k])); return o; });
  const mu=2; const f=new Float32Array(S.frames);
  for (let t=mu;t<S.frames;t++){ const a=L[t], b=L[t-mu]; let s=0; for(let k=k0;k<=k1;k++){ const r=Math.max(b[k-1],b[k],b[k+1]); const d=a[k]-r; if(d>0) s+=d; } f[t]=s/(k1-k0+1); }
  const med = D.median(f), md = D.mad(f);
  const pk = D.peaks(f, hop/FS, {minDelta: P.kmad!=null ? med + P.kmad*md*1.48 : 0, rel: P.rel, combine: 0.05});
  return pk.map(p=>(p.t*hop+n/2)/FS);
}
const configs = [ {lam:100, sub:0, rel:0.06}, {lam:100, sub:2, rel:0.06}, {lam:30, sub:2, rel:0.06}, {lam:100, sub:3, rel:0.06}, {lam:100, sub:2, rel:0.06, kmad:6}, {lam:100, sub:2, rel:0.04, kmad:8}, {lam:300, sub:2.5, rel:0.05, kmad:8} ];
for (const P of configs) {
  const out = [40, 25, 18].map(snr => { const r = evaluate(10, {snr}, x => detect(x, P)); return 'snr'+snr+' R'+r.recall+' P'+r.prec+' ('+r.byK+')'; });
  console.log(JSON.stringify(P).padEnd(44), out.join(' | '));
}
