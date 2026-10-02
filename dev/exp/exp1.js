const path=__dirname+'/../../';
global.AC = {}; 
const T = require(path+'dev/src/theory.js'); global.AC.theory = T;
const D = require(path+'dev/src/dsp.js');
const S = require(path+'tests/synth.js');
function take(o) {
  const tempo = o.tempo || 90, beat = 60/tempo, bars = o.bars || 2, lead = 0.4, countIn = 4;
  const pat = T.strum(o.pattern || 'r4');
  const dur = lead + (countIn + bars*pat.sig)*beat + 1.5;
  const y = new Float32Array(Math.ceil(dur*S.FS));
  const clicks = []; for (let i=0;i<countIn+bars*pat.sig;i++) clicks.push(lead + i*beat);
  const lat = o.lat != null ? o.lat : 0.137;
  if (o.speaker !== false) clicks.forEach((t,i)=>S.addClick(y, t+lat, o.clickAmp||0.12, 50+i));
  const evs=[]; for (let b=0;b<bars;b++) for (const e of T.strumEvents(pat)) evs.push({beat: countIn + b*pat.sig + e.beat, k:e.k, frets: T.voicing(o.chord||'G').frets, late: (o.lateIdx===evs.length? o.late:0)});
  const times = S.playGrid(y, evs, tempo, lead + lat, Object.assign({sd:0.012, seed: o.seed||3}, o.human||{}));
  const out = S.room(y, {snr: o.snr!=null?o.snr:35, seed: o.seed||3});
  const events = evs.map(e => ({ t: lead + e.beat*beat, k: e.k }));
  return {pcm: out, clicks, events, times, lat, slot: beat/pat.sub};
}
for (const cfg of [{pattern:'r1'},{pattern:'r2'},{pattern:'r4'},{pattern:'r4', tempo:120},{pattern:'r8'},{pattern:'r9'},{pattern:'r11', tempo: 80},{pattern:'r13', tempo:85},{pattern:'r4', snr:18},{pattern:'r4', speaker:false},{pattern:'r2', tempo:140}]) {
  const tk = take(cfg);
  const t0=Date.now();
  const res = D.analyzeRhythm(tk.pcm, S.FS, {clicks: tk.clicks, cleanClicks: 4, latency: 0.12, events: tk.events, slot: tk.slot});
  const errs = res.events.filter(e=>e.hit).map(e=>e.err);
  // true error: times - (event.t + lat)
  const trueErr = tk.times.map((t,i)=> 1000*(t - (tk.events[i].t + tk.lat)));
  const diff = res.events.map((e,i)=> e.hit ? e.err - trueErr[i] : NaN).filter(isFinite);
  const dirs = res.events.filter(e=>e.hit && (e.k==='D'||e.k==='U'));
  const dirOk = dirs.filter(e=>e.dir===e.k).length, dirNull = dirs.filter(e=>!e.dir).length;
  const xs = res.events.filter(e=>e.hit && e.k==='X');
  console.log(JSON.stringify(cfg).padEnd(40), 'lat', res.latency.toFixed(4), res.latencySrc, 'hit', res.hitRate.toFixed(2), 'extras', res.extras.length, 'meas-true err: med', D.median(diff).toFixed(1), 'mad', D.mad(diff).toFixed(1), 'max', Math.max(...diff.map(Math.abs)).toFixed(1), '| dir ok', dirOk+'/'+dirs.length, 'null', dirNull, '| chuck', xs.map(e=>e.chuck).join(','), 'D/U chuck', dirs.map(e=>e.chuck).filter(c=>c>=0.5).length, (Date.now()-t0)+'ms');
}
