const T = require(__dirname+'/../src/theory.js');
const show = (x) => console.log(JSON.stringify(x));
for (const s of ['Am','Am7','F#m','Bb/D','Cadd9','Lam','Ré7','Do7M','Sol','Si7','C#m7b5','Dsus4','A2','E5','G/B','D/F#','Fmaj7','Ebmaj7','Hm','the','am','La','Si','Mi','x2','N.C.','C(add9)','Gsus','Asus2','B7','Abm','Solm','Fa#m','Réb','Bbm7']) {
  const c = T.parseChord(s); console.log(s.padEnd(8), c ? c.sym + ' ' + T.chordFr(c) + ' | ' + T.chordLong(c) + ' | ' + T.chordPcs(c).join(',') : null);
}
console.log('--- voicings');
for (const s of ['C','G','Bb','Bbm7','C#','F#','Abm','Eb','Ebmaj7','C#add9','Gdim','Faug']) { const p = T.playable(s); console.log(s, p ? p.v.id + ' ' + p.v.frets.join(',') + ' d=' + p.v.d + (p.simplified?' simplifié→'+p.as:'') : null); }
console.log('--- transitions');
const pairs = [['Am','C'],['Em','G'],['C','G'],['G','D'],['D','A'],['Em','Am'],['G-pop','Cadd9'],['G','C'],['C','F'],['Am','F'],['Am','Dm'],['E','A'],['D','Em'],['G','Em'],['Em7-pop','G-pop'],['Cadd9','Dsus4'],['C','D'],['F','Bb'],['D','Bm'],['A','E'],['A','D'],['Em','C'],['Am','E'],['Dm','G7']];
for (const [a,b] of pairs) console.log(a.padEnd(8), b.padEnd(8), T.transitionCost(a,b));
console.log('--- capo');
for (const prog of [['Bb','F','Gm','Eb'],['Ab','Fm','Db','Eb'],['C#m','F#m','A','B'],['E','B','C#m','A'],['F','C','Dm','Bb']]) { const o = T.capoOptions(prog); console.log(prog.join(' '), '->', o.slice(0,3).map(x => 'capo'+x.capo+':'+x.shapes.join(' ')+' ('+x.cost+')').join(' | ')); }
console.log('--- key');
for (const prog of [['C','G','Am','F'],['Am','F','C','G'],['G','Em','C','D'],['Em','C','G','D'],['D','A','Bm','G'],['Am','G','F','E'],['D','C','G','D'],['C#m','F#m','A','B'],['Bm','G','D','A'],['A','D','E','D'],['E','A','B7','E']]) { const k = T.detectKey(prog); console.log(prog.join(' '), '->', T.keyName(k.tonic, k.minor), k.score.toFixed(1), 'alt', T.keyName(k.alt.tonic, k.alt.minor), k.alt.score.toFixed(1), '|', prog.map(s => T.roman(s, k.tonic, k.minor)).join(' ')); }
console.log('--- diatonic');
console.log(T.diatonic(7,false).map(d=>d.rn+':'+d.sym).join(' '));
console.log(T.diatonic(5,false).map(d=>d.rn+':'+d.sym).join(' '));
console.log(T.diatonic(9,true).map(d=>d.rn+':'+d.sym).join(' '));
console.log(T.diatonic(2,true).map(d=>d.rn+':'+d.sym).join(' '));
console.log('--- strums');
for (const p of T.STRUMS) console.log(p.id, p.name.padEnd(22), p.slots.padEnd(17), T.strumCost(p));
for (const p of T.PICKS) console.log(p.id, p.name.padEnd(22), p.toks.join(' ').padEnd(24), T.pickCost(p));
console.log('--- suggest', JSON.stringify(T.suggestNext(['I','V','vi'])), JSON.stringify(T.suggestNext(['vi'])));
console.log(['I','V','vi','IV','I/3','♭VII','ii','V7'].map(r => T.degreeChord(r, 2)).join(' '));
console.log('bass', ['C','G','D','Am','Em','F','Fmaj7','B7','Bm'].map(s => { const v = T.playable(s).v; const b = T.bassStrings(v); return s+':'+b.root+'/'+b.alt; }).join(' '));
