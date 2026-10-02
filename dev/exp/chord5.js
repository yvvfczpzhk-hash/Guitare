const path=__dirname+'/../../';
global.AC = {}; const T = require(path+'dev/src/theory.js'); global.AC.theory = T;
const D = require(path+'dev/src/dsp.js'); const S = require(path+'tests/synth.js');
const FS=22050;
function render(v, seed, o) { const y = new Float32Array(Math.ceil(1.4*S.FS)); S.addStrum(y, Object.assign({t:0.3, frets:v.frets, dir:'D', amp:0.15+0.05*S.rng(seed)(), seed: seed*13+v.id.length}, o||{})); return D.prepare(S.room(y, {snr: 32, seed}), 44100).x; }
function obsOf(x) { const t=(D.onsets(x,{}).list[0]||{t:0.3}).t; return D.observe(x,(t+0.04)*FS,(t+0.9)*FS, {len: +process.env.LEN||2048}); }
const fmt = dg => dg.foreign.map(f=>f.kind+'@s'+f.s+'(g'+f.gain+',sh'+f.share+')').join(' ');
console.log('--- true errors');
for (const [id, o, label] of [['C', {wrong:{4:-1}}, 'C open s4'], ['E', {wrong:{2:-2}}, 'E open s2'], ['Am', {wrong:{4:-1}}, 'Am open s4'], ['C', {wrong:{1:+1}}, 'C fret+1 s1'], ['G', {wrong:{5:-3}}, 'G open s5'], ['D', {wrong:{5:-2}}, 'D open s5']]) {
  const v=T.voicing(id); for (let seed=1;seed<=3;seed++) console.log(label.padEnd(12), fmt(D.chordDiagnosis(obsOf(render(v,seed,o)), v)));
}
console.log('--- clean');
for (const id of ['C','G','D','A','E','Am','Em','F-mini','Cadd9','Bm']) { const v=T.voicing(id); for (let seed=1;seed<=2;seed++) console.log(id.padEnd(12), fmt(D.chordDiagnosis(obsOf(render(v,seed)), v))); }
