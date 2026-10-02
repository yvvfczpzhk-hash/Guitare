const path=__dirname+'/../../';
global.AC = {}; const T = require(path+'dev/src/theory.js'); global.AC.theory = T;
const D = require(path+'dev/src/dsp.js'); const S = require(path+'tests/synth.js');
const FS=22050;
function render(v, seed, o) { const y = new Float32Array(Math.ceil(1.4*S.FS)); S.addStrum(y, Object.assign({t:0.3, frets:v.frets, dir:'D', amp:0.15+0.05*S.rng(seed)(), seed: seed*13+v.id.length}, o||{})); return D.prepare(S.room(y, {snr: (o&&o.snr)||32, seed}), 44100).x; }
function obsOf(x) { const t=(D.onsets(x,{}).list[0]||{t:0.3}).t; return D.observe(x,(t+0.04)*FS,(t+0.9)*FS); }
// (a) identity in small sets
const SETS = [['C','G'],['G','D'],['Am','C'],['Em','G'],['D','A'],['E','A'],['Am','F'],['Am','Dm'],['C','Cmaj7'],['G-pop','Cadd9'],['Em7-pop','G-pop'],['D','Dsus4'],['Cadd9','Dsus4'],['G','C','D','Em','Am','F-mini','A','E']];
let ok=0, n=0; const bad={};
for (const set of SETS) { const vs=set.map(id=>T.voicing(id)); for (let seed=1; seed<=6; seed++) for (const v of vs) { const r=D.identify(obsOf(render(v,seed)), vs); n++; if (r.best===v.id) ok++; else { const k=set.join('/')+':'+v.id+'→'+r.best; bad[k]=(bad[k]||0)+1; } } }
console.log('identity small sets', (ok/n).toFixed(3), n, JSON.stringify(bad));
// (b) errors
const ERR = [
 ['C', {wrong:{4:-1}}, 'open s4 (B open)'], ['C', {wrong:{2:-2}}, 'open s2 (D open)'], ['G', {wrong:{5:-3}}, 'open s5'], ['E', {wrong:{2:-2}}, 'open s2 (E7)'],
 ['D', {wrong:{5:-2}}, 'open s5 (Dsus2)'], ['Am', {wrong:{4:-1}}, 'open s4'], ['C', {wrong:{1:+1}}, 'fret+1 s1'], ['A', {wrong:{3:+1}}, 'fret+1 s3'],
 ['C', {muted:[2]}, 'muted s2'], ['C', {muted:[4]}, 'muted s4'], ['D', {muted:[5]}, 'muted s5'], ['Am', {muted:[3]}, 'muted s3'], ['G', {muted:[1]}, 'muted s1'],
 ['C', {strings:[0,1,2,3,4,5]}, 'low E sounding (C)'], ['D', {strings:[1,2,3,4,5]}, 'A sounding (D)']
];
for (const [id, o, label] of ERR) {
  const v = T.voicing(id); let hits=[]; let clean=0;
  for (let seed=1; seed<=5; seed++) {
    let frets = v.frets.slice(); if (o.strings) frets = frets.map((f,s)=> f<0 && o.strings.includes(s) ? 0 : f);
    const x = render({id:v.id+'x', frets}, seed, {wrong:o.wrong, muted:o.muted});
    const dg = D.chordDiagnosis(obsOf(x), v);
    hits.push(dg.foreign.map(f=>f.kind+'@s'+f.s).concat(dg.missing.map(m=>'miss@s'+m.s)).join(',')||'-');
  }
  console.log(label.padEnd(22), hits.join(' | '));
}
// (c) clean false alarms
const fa={}; let nfa=0, tot=0;
for (const id of ['C','G','D','A','E','Am','Em','Dm','E7','A7','D7','G7','Am7','Cmaj7','Fmaj7','F-mini','Asus2','Dsus2','Dsus4','Cadd9','G-pop','Em7-pop','B7','Bm','F']) { const v=T.voicing(id); for (let seed=1; seed<=4; seed++) { const dg=D.chordDiagnosis(obsOf(render(v,seed)), v); tot++; if (dg.foreign.length||dg.missing.length) { nfa++; fa[id]=(fa[id]||[]).concat([dg.foreign.map(f=>f.kind+'@s'+f.s).concat(dg.missing.map(m=>'miss@s'+m.s)).join(',')]); } } }
console.log('false alarms on clean chords', nfa+'/'+tot, JSON.stringify(fa));
