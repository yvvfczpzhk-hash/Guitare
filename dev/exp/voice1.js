const path=__dirname+'/../../';
global.AC = {}; const T = require(path+'dev/src/theory.js'); global.AC.theory = T;
const D = require(path+'dev/src/dsp.js'); const S = require(path+'tests/synth.js');
// mélodie chantée sur une grille C G Am F (2 temps par accord... ici 1 mesure = 2 s par accord)
const melody = [[0.5,1.0,64],[1.0,1.5,67],[1.5,2.4,72],[2.5,3.0,71],[3.0,3.5,67],[3.5,4.4,62],[4.5,5.0,69],[5.0,5.5,72],[5.5,6.4,76],[6.5,7.0,77],[7.0,7.5,72],[7.5,8.4,69]];
const y = new Float32Array(Math.ceil(9.5*S.FS));
S.addVoice(y, melody.map(([t0,t1,m])=>({t0,t1,midi:m-12})), 0.2, 3);   // voix d'homme une octave plus bas
// guitare d'accompagnement faible en fond (haut-parleur)
const prog = ['C','G','Am','F-mini'];
prog.forEach((id,i)=>{ for (let b=0;b<2;b++) S.addStrum(y,{t:0.5+i*2+b, frets:T.voicing(id).frets, dir:'D', amp:0.03, seed:10+i*2+b}); });
const out = S.room(y,{snr:35, seed:2});
const t0=Date.now(); const tr = D.trackVoice(out, S.FS); const notes = D.segmentNotes(tr);
console.log('notes', notes.length, notes.map(n=>T.noteName(n.midi)+'@'+n.t0.toFixed(2)).join(' '), (Date.now()-t0)+'ms');
const timeline = prog.map((sym,i)=>({t0: 0.5+i*2, t1: 2.5+i*2, sym: sym==='F-mini'?'F':sym}));
const strong = []; for (let i=0;i<8;i+=1) strong.push(0.5+i*1.0);
console.log(JSON.stringify(D.melodyVsChords(notes, timeline, strong)));
{
  const x = D.resample(out, 44100, 22050); const W=1024, hop=220; let n=0, v=0; const aps=[];
  for (let i=0;i+W<x.length;i+=hop){ const fr=x.subarray(i,i+W); const r=D.yin(fr, 22050, 75, 900, 0.15); n++; if (isFinite(r.f0)) { v++; aps.push(r.ap); } }
  console.log('frames', n, 'yin voiced', v, 'ap median', D.median(aps));
  console.log('voiced flags', tr.voiced.reduce((a,b)=>a+b,0), 'of', tr.voiced.length, 'midi sample', Array.from(tr.midi.slice(100,110)).map(x=>x.toFixed(1)).join(','));
}
{ const out2=[]; for (let i=0;i<tr.t.length;i++) if (tr.t[i]>1.8 && tr.t[i]<2.2) out2.push(tr.t[i].toFixed(2)+':'+(tr.voiced[i]?tr.midi[i].toFixed(2):'-')); console.log(out2.join(' ')); }
