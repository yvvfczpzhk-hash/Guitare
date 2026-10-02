const path=__dirname+'/../../';
global.AC = {}; const T = require(path+'dev/src/theory.js'); global.AC.theory = T;
const D = require(path+'dev/src/dsp.js'); const { makeTake } = require('./evalOn.js');
const FS = 22050;
function dirFeatures(x, t, P) {
  const N = P.N || 256, hop = P.hop || 22, lag = P.lag || 4;
  const a = Math.round((t - 0.012) * FS), b = Math.round((t + (P.span||0.05)) * FS);
  const frames = [];
  for (let s = a - lag*hop; s + N < Math.min(x.length, b + N); s += hop) frames.push({ s, m: D.magSpectrum(x, s, N, N*2) });
  const df = FS / (N*2), k0 = Math.round((P.f0||70) / df), k1 = Math.round((P.f1||1200) / df);
  const cents = [], ws = [], ts = [];
  for (let i = lag; i < frames.length; i++) {
    let w = 0, c = 0;
    for (let k = k0; k <= k1; k++) {
      const ref = Math.max(frames[i-lag].m[k-1], frames[i-lag].m[k], frames[i-lag].m[k+1]);
      const d = Math.log10(1+100*frames[i].m[k]) - Math.log10(1+100*ref);
      if (d > 0) { w += d; c += d * Math.log2(k*df); }
    }
    if (w > 0) { cents.push(c / w); ws.push(w); ts.push((frames[i].s + N/2)/FS - t); }
  }
  const wmax = Math.max(...ws);
  const sel = ws.map((w,i)=>w >= (P.wsel||0.25)*wmax ? i : -1).filter(i=>i>=0);
  if (sel.length < 3) return { slope: NaN };
  let sw=0, sx=0, sy=0; sel.forEach(i=>{ sw+=ws[i]; sx+=ws[i]*ts[i]; sy+=ws[i]*cents[i]; });
  const mx=sx/sw, my=sy/sw; let sxy=0, sxx=0; sel.forEach(i=>{ sxy+=ws[i]*(ts[i]-mx)*(cents[i]-my); sxx+=ws[i]*(ts[i]-mx)**2; });
  return { slope: sxy/sxx/1000 }; // octaves per ms
}
const configs = [ {}, {f1:600}, {f1:2500}, {lag:2}, {N:512, hop:22}, {wsel:0.1}, {span:0.035} ];
for (const P of configs) {
  let ok=0, n=0, nul=0; const sl={D:[],U:[]};
  for (let s=1;s<=14;s++){
    const tk = makeTake(s, {pats:['r2','r4','r11','r8','r3']}); const x = D.prepare(tk.pcm, 44100).x;
    tk.times.forEach((t,i)=>{ const k=tk.kinds[i]; if (k!=='D'&&k!=='U') return; const f=dirFeatures(x, t, P); if (!isFinite(f.slope)) {nul++; return;} sl[k].push(f.slope); n++; if ((f.slope>0?'D':'U')===k) ok++; });
  }
  console.log(JSON.stringify(P).padEnd(28), 'acc', (ok/n).toFixed(3), 'n', n, 'null', nul, 'D med', D.median(sl.D).toFixed(4), 'U med', D.median(sl.U).toFixed(4), 'D p10', D.percentile(sl.D,0.1).toFixed(4), 'U p90', D.percentile(sl.U,0.9).toFixed(4));
}
