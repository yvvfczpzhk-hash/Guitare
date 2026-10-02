const path=__dirname+'/../../';
global.AC = {}; const T = require(path+'dev/src/theory.js'); global.AC.theory = T;
const D = require(path+'dev/src/dsp.js'); const S = require(path+'tests/synth.js');
function plucks(v, seed, err) {
  err = err || {};
  const r = S.rng(seed*7+3);
  const strings = T.sounding(v);
  const gap = 0.55 + 0.35*r();
  const y = new Float32Array(Math.ceil((0.5 + strings.length*gap + 1.2)*S.FS));
  let t = 0.5; const times=[];
  strings.forEach((s,k) => {
    if (err.skip === s) { t += gap; return; }
    const midi = T.OPEN[s] + v.frets[s] + ((err.wrong && err.wrong[s]) || 0);
    S.addString(y, {t, midi, amp: 0.12+0.08*r(), muted: err.muted===s, buzz: err.buzz===s ? 1.0 : 0, seed: seed*31+s});
    times.push(t);
    if (err.extra === s) { S.addString(y, {t: t+0.25, midi: T.OPEN[s]+v.frets[s], amp: 0.1, seed: seed*37+s}); }
    t += gap*(0.85+0.3*r());
  });
  return D.prepare(S.room(y, {snr: 34, seed}), 44100).x;
}
const ids = ['C','G','D','A','E','Am','Em','Dm','F-mini','Cadd9','G-pop','B7','F','Bm'];
let clean=0, n=0; const fails={};
for (const id of ids) { const v=T.voicing(id); for (let seed=1; seed<=3; seed++) { const res = D.analyzePlucks(plucks(v,seed), 22050, {v:id}); n++; if (res.clean) clean++; else { fails[id]=(fails[id]||[]).concat([res.strings.filter(s=>s.status!=='ok').map(s=>s.status+'@s'+s.s+(s.got!=null?'('+T.noteName(s.got)+')':'')).join(',')]); } } }
console.log('clean recognized', clean+'/'+n, JSON.stringify(fails));
const cases = [['C',{muted:2}],['C',{muted:4}],['G',{muted:3}],['D',{muted:5}],['Am',{muted:3}],['C',{wrong:{4:-1}}],['C',{wrong:{1:1}}],['G',{wrong:{5:-1}}],['E',{wrong:{3:1}}],['C',{skip:2}],['G',{extra:3}],['C',{buzz:4}],['G',{buzz:0}],['A',{buzz:3}]];
for (const [id, err] of cases) { const v=T.voicing(id); const out=[]; for (let seed=1; seed<=3; seed++) { const res=D.analyzePlucks(plucks(v,seed,err), 22050, {v:id}); out.push(res.strings.filter(s=>s.status!=='ok').map(s=>s.status+'@s'+s.s+(s.got!=null&&s.status==='wrong'?'('+T.noteName(s.got)+')':'')).join(',')||'clean'); } console.log((id+' '+JSON.stringify(err)).padEnd(26), out.join(' | ')); }
