const path=__dirname+'/../../';
global.AC = {}; const T = require(path+'dev/src/theory.js'); global.AC.theory = T;
const D = require(path+'dev/src/dsp.js'); const { evaluate } = require('./evalOn.js');
const FS=22050;
function odfBand(xb, n, hop, f0, f1, lam, mu0) {
  const S = D.stft(xb, n, hop, f1+200);
  const k0 = Math.max(1, Math.floor(f0/S.df)), k1 = Math.min(S.nb-2, Math.ceil(f1/S.df));
  const L = S.mags.map(m=>{ const o=new Float32Array(k1+2); for(let k=k0-1;k<=k1+1;k++) o[k]=Math.log10(1+lam*m[k]); return o; });
  const mu = mu0 || Math.max(1, Math.round((n/4)/hop));
  const f = new Float32Array(S.frames);
  for (let t=mu;t<S.frames;t++){ const a=L[t], b=L[t-mu]; let s=0; for(let k=k0;k<=k1;k++){ const r=Math.max(b[k-1],b[k],b[k+1]); const d=a[k]-r; if(d>0) s+=d; } f[t]=s/(k1-k0+1); }
  return f;
}
function detect(x, P) {
  const hop = Math.round(P.hop*FS), n = P.n;
  const band = D.filtfilt(D.filtfilt(x, FS, 'hp', 75), FS, 'lp', 6000);
  const absS=[]; for (let i=0;i<band.length;i+=7) absS.push(Math.abs(band[i]));
  const ref = D.percentile(absS, 0.995)||1e-6, g=0.5/ref;
  const xb = new Float32Array(band.length); for (let i=0;i<band.length;i++) xb[i]=band[i]*g;
  let f;
  if (P.mix) { const a = odfBand(xb,n,hop,70,1500,P.lam), b = odfBand(xb,n,hop,1500,6000,P.lam); const ma=D.percentile(a,0.99)||1, mb=D.percentile(b,0.99)||1; f=a.map((v,i)=>v/ma + P.mix*b[i]/mb); }
  else f = odfBand(xb, n, hop, P.f0, P.f1, P.lam);
  const pk = D.peaks(f, hop/FS, {minDelta: P.minDelta, rel: P.rel, combine: P.combine});
  const env = D.energyEnv(xb, FS, 1);
  return pk.map(p => refine(env, (p.t*hop+n/2)/FS, -0.035, 0.035));
}
function refine(env, tg, lo, hi) {
  const a = Math.max(2, Math.floor((tg+lo)*1000)), b=Math.min(env.length-3, Math.ceil((tg+hi)*1000));
  const le = i => Math.log10(1e-12 + (env[i-1]+2*env[i]+env[i+1])/4);
  let tot=0; const inc=[]; for(let i=a;i<=b;i++){ const d=Math.max(0, le(i+1)-le(i)); inc.push(d); tot+=d; }
  let c=0; for (let i=0;i<inc.length;i++){ c+=inc[i]; if (c>=0.3*tot) return (a+i)/1000; }
  return tg;
}
const base = {hop:0.005, n:1024, lam:100, rel:0.1, minDelta:0.0, combine:0.05};
const configs = [
  {f0:70,f1:5000},
  {f0:1500,f1:6000},{f0:1500,f1:6000,n:512},{f0:1500,f1:6000,rel:0.06},{f0:2000,f1:6000,n:512,rel:0.06},
  {mix:1},{mix:2},{mix:1,rel:0.06},{mix:2, n:512, rel:0.06},
];
const N=+process.argv[2]||16;
for (const c of configs) { const P=Object.assign({},base,c); const t0=Date.now(); const r = evaluate(N, {}, x=>detect(x,P)); console.log(JSON.stringify(c).padEnd(48), JSON.stringify(r), (Date.now()-t0)+'ms'); }
