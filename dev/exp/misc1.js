const path=__dirname+'/../../';
global.AC = {}; const T = require(path+'dev/src/theory.js'); global.AC.theory = T;
const D = require(path+'dev/src/dsp.js'); const S = require(path+'tests/synth.js');
// --- minute changes: alternance A/B à ~cpm, avec erreurs (accord raté = coup avec une forme intermédiaire/étouffée)
for (const [a,b,cpm,errs] of [['C','G',30,[]],['C','G',48,[5,11]],['Am','C',60,[3]],['G-pop','Cadd9',70,[]],['Em','G',40,[2,7,8]],['D','A',55,[]]]) {
  for (const seed of [1,2]) {
    const va=T.voicing(a), vb=T.voicing(b), dur=20, gap=60/cpm, r=S.rng(seed*5+cpm);
    const y=new Float32Array(Math.ceil((dur+1.5)*S.FS)); let t=0.6, k=0; const truth=[];
    while (t < dur) { const v = k%2? vb: va; let frets=v.frets.slice(); let lab = k%2?'b':'a';
      if (errs.includes(k)) { frets = frets.map((f,s)=> s===3||s===4 ? -1 : f); lab='x'; } // accord à moitié formé : cordes étouffées
      const nt = t + gap*(0.85+0.3*r()); S.addStrum(y,{t, frets, dir:'D', amp:0.14+0.06*r(), seed: seed*100+k, ends:[nt,nt,nt,nt,nt,nt]}); truth.push(lab); t = nt; k++; }
    const res = D.analyzeChanges(S.room(y,{snr:32,seed}), S.FS, {a: va.id, b: vb.id, t0: 0.3, t1: dur+0.5});
    let trueChanges=0, last=null; truth.forEach(l=>{ if(l==='x') return; if(last && l!==last) trueChanges++; last=l; });
    const seq = res.strums.map(s=>s.chord||'?').join('');
    console.log(a+'/'+b, cpm, 'seed', seed, 'true changes', trueChanges, 'measured', res.changes, 'unclear', res.unclear, 'n strums', res.strums.length, '/', truth.length, '|', seq.slice(0,40), '|', truth.join('').slice(0,40));
  }
}
// --- cues (forme) : signal → accord joué après un temps de réaction
{
  const vocab = ['C','G','D','Am','Em','E','A'].map(id=>T.voicing(id));
  const cues=[], y=new Float32Array(Math.ceil(16*S.FS)); let t=1.0; const truthRt=[];
  const seqIds=['G','Am','D','C','Em','A']; const lat=0.13;
  seqIds.forEach((id,i)=>{ const v=T.voicing(id); const rt=0.9+0.4*i/5; const played = i===3 ? T.voicing('Am') : v; S.addStrum(y,{t: t+lat+rt, frets: played.frets, dir:'D', amp:0.16, seed: 40+i}); S.addClick(y, t+lat, 0.1, 70+i); cues.push({t, v: v.id, limit: 2}); truthRt.push(rt); t += 2.4; });
  const res = D.analyzeCues(S.room(y,{snr:33,seed:4}), S.FS, {cues, clicks: cues.map(c=>c.t), latency: 0.1, vocab});
  console.log('cues', res.cues.map((c,i)=>c.v+':'+(c.ok?'ok':'NO('+c.heard+')')+' rt '+c.rt+' (true '+truthRt[i].toFixed(2)+')').join(' | '));
}
// --- pulse : 2 mesures avec clic, 4 sans (le joueur accélère), puis 1 avec
{
  const tempo=80, beat=60/tempo, lead=0.4, lat=0.12, countIn=4; const nBeats = 4*7;
  const y=new Float32Array(Math.ceil((lead+(countIn+nBeats)*beat+2)*S.FS));
  const clicks=[]; for (let i=0;i<countIn+nBeats;i++){ const bar=Math.floor((i-countIn)/4); const silent = i>=countIn && bar>=2 && bar<6; if(!silent) clicks.push(lead+i*beat); }
  clicks.forEach((c,i)=>S.addClick(y,c+lat,0.1,90+i));
  const evs=[]; for (let i=0;i<nBeats;i++) evs.push({beat: countIn+i, k:'D', frets:T.voicing('Em').frets});
  // accélération pendant le silence : drift -0.03 (3 % plus rapide)
  const times = S.playGrid(y, evs, tempo, lead+lat, {sd:0.01, seed:5, drift:-0.02});
  const events = evs.map((e,i)=>{ const bar=Math.floor(i/4); return {t: lead+e.beat*beat, k:'D', free: bar>=2 && bar<6}; });
  const res = D.analyzeRhythm(S.room(y,{snr:33,seed:5}), S.FS, {clicks, cleanClicks: 4, latency: 0.1, events, slot: beat});
  console.log('pulse: hit', res.hitRate.toFixed(2), 'mean', res.mean.toFixed(1), 'sd', res.sd.toFixed(1), 'drift', JSON.stringify(res.drift), 'latency', res.latency.toFixed(3));
}
