const path=__dirname+'/../../';
global.AC = {}; const T = require(path+'dev/src/theory.js'); global.AC.theory = T;
const D = require(path+'dev/src/dsp.js'); const { evaluate, makeTake } = require('./evalOn.js');
const FS=22050;
function odfBand(xb, n, hop, f0, f1, lam) {
  const S = D.stft(xb, n, hop, f1+200);
  const k0 = Math.max(1, Math.floor(f0/S.df)), k1 = Math.min(S.nb-2, Math.ceil(f1/S.df));
  const L = S.mags.map(m=>{ const o=new Float32Array(k1+2); for(let k=k0-1;k<=k1+1;k++) o[k]=Math.log10(1+lam*m[k]); return o; });
  const mu = Math.max(1, Math.round((n/4)/hop));
  const f = new Float32Array(S.frames);
  for (let t=mu;t<S.frames;t++){ const a=L[t], b=L[t-mu]; let s=0; for(let k=k0;k<=k1;k++){ const r=Math.max(b[k-1],b[k],b[k+1]); const d=a[k]-r; if(d>0) s+=d; } f[t]=s/(k1-k0+1); }
  return f;
}
function prepare(x) {
  const band = D.filtfilt(D.filtfilt(x, FS, 'hp', 75), FS, 'lp', 6000);
  const absS=[]; for (let i=0;i<band.length;i+=7) absS.push(Math.abs(band[i]));
  const ref = D.percentile(absS, 0.995)||1e-6, g=0.5/ref;
  const xb = new Float32Array(band.length); for (let i=0;i<band.length;i++) xb[i]=band[i]*g;
  return xb;
}
function refine3(le, tg, frac) {
  const a = Math.max(45, Math.floor((tg-0.035)*1000)), b=Math.min(le.length-3, Math.ceil((tg+0.035)*1000));
  let p=a; for (let i=a;i<=b;i++) if (le[i]>le[p]) p=i;
  const base = []; for (let i=Math.max(0,p-45); i<=p-12; i++) base.push(le[i]);
  const bl = D.percentile(base, 0.5);
  const thr = bl + frac*(le[p]-bl);
  let i=p; while (i>p-40 && le[i-1] >= thr) i--;
  const d = le[i]-le[i-1]; const fr = d>0 ? (le[i]-thr)/d : 0;
  return (i - fr)/1000;
}
function detect(x, P) {
  const hop = Math.round(P.hop*FS), n = P.n;
  const xb = prepare(x);
  const f = odfBand(xb, n, hop, 1500, 6000, 100);
  const pk = D.peaks(f, hop/FS, {minDelta: 0, rel: P.rel, combine: 0.05});
  const envB = D.energyEnv(P.envHF ? D.filtfilt(xb, FS, 'hp', 1500) : xb, FS, 1);
  const le = new Float32Array(envB.length); for (let i=1;i<envB.length-1;i++) le[i]=Math.log10(1e-12+(envB[i-1]+2*envB[i]+envB[i+1])/4);
  return pk.map(p => refine3(le, (p.t*hop+n/2)/FS, P.frac));
}
const base = {hop:0.005, n:1024, rel:0.06, frac:0.3};
const configs = [ {}, {envHF:true}, {frac:0.2}, {frac:0.2, envHF:true}, {frac:0.1, envHF:true}, {frac:0.4, envHF:true} ];
const N=+process.argv[2]||16;
for (const c of configs) { const P=Object.assign({},base,c); const t0=Date.now(); const r = evaluate(N, {}, x=>detect(x,P)); console.log(JSON.stringify(c).padEnd(48), JSON.stringify(r), (Date.now()-t0)+'ms'); }
