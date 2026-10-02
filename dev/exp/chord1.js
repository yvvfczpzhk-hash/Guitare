const path=__dirname+'/../../';
global.AC = {}; const T = require(path+'dev/src/theory.js'); global.AC.theory = T;
const D = require(path+'dev/src/dsp.js'); const S = require(path+'tests/synth.js');
const VOC = ['C','G','D','A','E','Am','Em','Dm','E7','A7','D7','G7','Am7','Em7','Cmaj7','Fmaj7','F-mini','Asus2','Dsus2','Dsus4','Cadd9','G-pop','Em7-pop','B7','Bm','F'].map(id=>T.voicing(id));
let ok=0, n=0; const conf = {};
const t0=Date.now();
for (let seed=1; seed<=6; seed++) for (const v of VOC) {
  const y = new Float32Array(Math.ceil(1.4*S.FS));
  S.addStrum(y, {t:0.3, frets:v.frets, dir:'D', amp:0.15+0.05*S.rng(seed)(), seed: seed*13+v.id.length});
  const out = S.room(y, {snr: 32, seed});
  const x = D.prepare(out, 44100).x;
  const on = D.onsets(x, {}).list; const o = on[0] ? on[0].t : 0.3;
  const notes = D.notesIn(x, (o+0.04)*22050, (o+0.55)*22050, {len:2048, nfft:8192});
  const m = D.matchChord(notes, VOC);
  n++; const good = m.best === v.id || (m.sim[v.id] >= m.score - 0.015 && m.sim[v.id] >= 0.78);
  if (good) ok++; else { const k = v.id+'→'+m.best; conf[k]=(conf[k]||0)+1; }
}
console.log('single strum (550 ms) acc', (ok/n).toFixed(3), n, (Date.now()-t0)+'ms');
console.log(JSON.stringify(conf));
// similarity margins for a few pairs
for (const [a,b] of [['C','Cmaj7'],['C','Am'],['Em','G'],['D','Dsus2'],['G','G-pop'],['Em7','Em'],['A','Asus2'],['C','Cadd9']]) {
  const va=T.voicing(a), vb=T.voicing(b); console.log(a,b,'chroma cos', D.cosine(D.voicingChroma(va), D.voicingChroma(vb)).toFixed(3));
}
