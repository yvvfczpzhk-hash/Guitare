/* ==== audio.js ==== */
/* ACCORD — moteur audio (navigateur).
   Modèles sonores : guitare de synthèse (accords grattés, rythmiques, arpèges, grilles, cadences), métronome
   (clic aigu repérable dans la prise, ou « bois » au casque), capture micro sans traitements (pas d'annulation
   d'écho, de réduction de bruit ni de gain automatique : ils déforment les attaques et faussent les mesures),
   horodatée sur l'horloge audio pour comparer chaque coup au clic. */
(function (root) {
  'use strict';
  const AC = root.AC || (root.AC = {});
  const T = AC.theory, G = AC.gsynth;
  const A = {};
  let ctx = null, master = null, bus = null, mic = null, micSrc = null, analyser = null, recNode = null, sink = null;
  let recording = false, chunks = [], recLen = 0, recT0 = null;
  const active = new Set();
  A.tuning = 440;
  A.clickKind = 'aigu';

  A.ensure = async function () {
    try { if (navigator.audioSession && !mic) navigator.audioSession.type = 'playback'; } catch (e) { /* Safari ancien */ }
    if (!ctx) {
      const AC0 = root.AudioContext || root.webkitAudioContext;
      if (!AC0) throw new Error('Web Audio indisponible');
      ctx = new AC0({ latencyHint: 'interactive' });
      ({ master, bus } = buildOutput(ctx));
      const b = ctx.createBuffer(1, 1, ctx.sampleRate), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); try { s.start(0); } catch (e) { /* rien */ }
    }
    if (ctx.state !== 'running') { try { await Promise.race([ctx.resume(), new Promise(r => setTimeout(r, 1200))]); } catch (e) { /* rien */ } }
    return ctx;
  };
  A.ctx = () => ctx;
  A.running = () => !!ctx && ctx.state === 'running';
  A.now = () => (ctx ? ctx.currentTime : 0);
  if (root.document) {
    const kick = () => { if (ctx && ctx.state !== 'running') { try { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* rien */ } } };
    ['touchend', 'click'].forEach(ev => root.document.addEventListener(ev, kick, true));
  }
  /** Latence de sortie connue du navigateur (s) : point de départ avant la première mesure réelle. */
  A.outputLatency = () => (ctx ? (ctx.outputLatency || 0) + (ctx.baseLatency || 0) : 0);

  /* ------------------------------------------------------------ sortie et volume */
  A.userVolume = 1;
  const OUT_GAIN = 2.2;
  let shaperCurve = null;
  function buildOutput(c) {
    const m = c.createGain(); m.gain.value = OUT_GAIN * A.userVolume;
    const b = c.createGain(); b.gain.value = 0.25;
    const sh = c.createWaveShaper(), post = c.createGain();
    if (!shaperCurve) { shaperCurve = new Float32Array(2049); for (let i = 0; i < 2049; i++) shaperCurve[i] = Math.tanh(4 * (i / 1024 - 1)); }
    sh.curve = shaperCurve; sh.oversample = '4x'; post.gain.value = 0.95;
    m.connect(b); b.connect(sh); sh.connect(post); post.connect(c.destination);
    return { master: m, bus: b };
  }
  A.setUserVolume = function (v) {
    A.userVolume = Math.max(0.5, Math.min(2, +v || 1));
    if (master && ctx) { try { master.gain.setTargetAtTime(OUT_GAIN * A.userVolume, ctx.currentTime, 0.02); } catch (e) { master.gain.value = OUT_GAIN * A.userVolume; } }
  };

  /* ------------------------------------------------------------ tampons de guitare */
  const SR = 32000;
  const noteCache = new Map();
  function noteBuffer(midi, vel, mute) {
    const vb = vel >= 0.85 ? 0.95 : vel >= 0.6 ? 0.75 : 0.5;
    const key = ctx.sampleRate + '|' + midi.toFixed(2) + '|' + vb + '|' + (mute ? 1 : 0) + '|' + A.tuning;
    let b = noteCache.get(key); if (b) return b;
    const y = G.note(midi, { sr: SR, vel: vb, mute, a4: A.tuning, dur: mute ? 0.4 : 3 });
    b = ctx.createBuffer(1, y.length, SR); b.getChannelData(0).set(y);
    noteCache.set(key, b); if (noteCache.size > 400) noteCache.delete(noteCache.keys().next().value);
    return b;
  }
  let chuckBuf = null, clickBufs = {};
  const chuckBuffer = () => { if (!chuckBuf || chuckBuf.ctx !== ctx) { const y = G.chuck({ sr: SR }); chuckBuf = ctx.createBuffer(1, y.length, SR); chuckBuf.getChannelData(0).set(y); chuckBuf.ctx = ctx; } return chuckBuf; };
  function clickBuffer(kind, accent) {
    const key = kind + (accent ? 'A' : 'b') + ctx.sampleRate;
    let b = clickBufs[key]; if (b && b.ctx === ctx) return b;
    const y = G.click(kind, accent, ctx.sampleRate);
    b = ctx.createBuffer(1, y.length, ctx.sampleRate); b.getChannelData(0).set(y); b.ctx = ctx;
    clickBufs[key] = b; return b;
  }
  /* voix par corde : un nouveau coup sur une corde arrête le son précédent de cette corde */
  const strings = new Array(6).fill(null);
  function play(buf, t, gain, out) {
    const s = ctx.createBufferSource(), g = ctx.createGain();
    s.buffer = buf; g.gain.value = gain;
    s.connect(g); g.connect(out || master);
    s.start(t);
    track([s], t + buf.duration);
    return { s, g };
  }
  function damp(i, t) {
    const v = strings[i]; if (!v) return;
    try { v.g.gain.setValueAtTime(v.g.gain.value, t); v.g.gain.linearRampToValueAtTime(0.0001, t + 0.012); v.s.stop(t + 0.03); } catch (e) { /* déjà arrêté */ }
    strings[i] = null;
  }
  function pluckString(i, midi, t, vel, o) {
    damp(i, t);
    strings[i] = play(noteBuffer(midi, vel, o && o.mute), t, 0.32 * (o && o.gain || 1), o && o.out);
  }
  /** Coup sur un accord : D vers le bas (grave → aigu), U vers le haut (aigu → grave, sans les basses). */
  A.strumAt = function (vid, t, dir, vel, o) {
    o = o || {};
    const v = typeof vid === 'string' ? T.voicing(vid) : vid;
    if (!v) return;
    let ss = T.sounding(v);
    if (dir === 'U') ss = ss.filter(s => s >= 2).reverse();
    const spread = o.spread != null ? o.spread : dir === 'U' ? 0.018 : 0.024;
    ss.forEach((s, k) => pluckString(s, T.OPEN[s] + v.frets[s], t + (ss.length > 1 ? k * spread / (ss.length - 1) : 0), (vel || 0.8) * (dir === 'U' ? 0.8 : 1), o));
  };
  A.chuckAt = function (t, vel) { for (let i = 0; i < 6; i++) damp(i, t); play(chuckBuffer(), t, 0.4 * (vel || 0.8)); };
  A.clickAt = function (t, accent, kind) { play(clickBuffer(kind || A.clickKind, accent), t, accent ? 0.5 : 0.42); };
  A.noteAt = function (midi, t, vel, string) { if (string != null) pluckString(string, midi, t, vel || 0.8); else play(noteBuffer(midi, vel || 0.8), t, 0.32); };

  function track(nodes, end) {
    if (root.OfflineAudioContext && ctx instanceof root.OfflineAudioContext) return;
    const rec = { nodes, end };
    active.add(rec);
    setTimeout(() => active.delete(rec), Math.max(0, (end - ctx.currentTime) * 1000 + 300));
  }
  A.stopAll = function () {
    if (!ctx) return;
    for (const r of active) for (const n of r.nodes) { try { n.stop(); } catch (e) { /* déjà arrêté */ } }
    active.clear(); strings.fill(null);
    if (A.metronome.on) A.metronome.stop();
  };

  /* ------------------------------------------------------------ modèles sonores */
  /** Événements d'une partition (catalog.rhythmScore) joués à la guitare à partir de t0. */
  function scheduleScore(score, t0, o) {
    o = o || {};
    const beat = 60 / score.tempo;
    let end = t0;
    for (const e of score.events) {
      const t = t0 + e.beat * beat;
      if (e.tok) {
        const v = T.voicing(e.v); if (!v) continue;
        const ss = e.tok.length > 1 ? [T.pickString(e.tok[0], v), T.pickString(e.tok[1], v)] : [T.pickString(e.tok, v)];
        ss.forEach(s => { if (s != null && v.frets[s] >= 0) pluckString(s, T.OPEN[s] + v.frets[s], t, 0.75); else if (s != null) pluckString(s, T.OPEN[s], t, 0.75); });
      } else if (e.k === 'X') A.chuckAt(t, 0.8);
      else A.strumAt(e.v, t, e.k, e.acc ? 0.95 : e.k === 'U' ? 0.7 : 0.85);
      end = Math.max(end, t);
    }
    return end + 1.2;
  }
  A.scheduleScore = scheduleScore;
  /** Clics d'une prise : décompte puis mesures avec clic ; renvoie les instants programmés (horloge audio). */
  A.scheduleClicks = function (score, t0, kind) {
    const beat = 60 / score.tempo, times = [];
    for (let i = 0; i < score.countIn; i++) { const t = t0 + i * beat; A.clickAt(t, i % score.sig === 0, kind); times.push({ t, countIn: true }); }
    const start = t0 + score.countIn * beat;
    for (let b = 0; b < score.bars; b++) {
      if (!score.clickBars[b]) continue;
      for (let i = 0; i < score.sig; i++) { const t = start + (b * score.sig + i) * beat; A.clickAt(t, i === 0, kind); times.push({ t, countIn: false }); }
    }
    return { times, start, end: start + score.bars * score.sig * beat };
  };

  /**
   * Joue un modèle. play : {kind: 'strum'|'arp'|'pattern'|'pick'|'changes'|'cadence'|'note'|'pair'|'clicks'|'progression'}
   * Renvoie une promesse résolue à la fin.
   */
  A.play = async function (play, opt) {
    await A.ensure();
    if (ctx.state !== 'running') return false;
    const end = schedule(play, opt || {});
    const ms = Math.max(0, (end - ctx.currentTime) * 1000);
    return new Promise(res => setTimeout(() => res(true), ms + 30));
  };
  function schedule(p, opt) {
    const t0 = ctx.currentTime + 0.08 + (p.pre || 0);
    const C = AC.catalog;
    let end = t0;
    if (p.kind === 'strum') { A.strumAt(p.v, t0, p.dir || 'D', p.vel || 0.85); end = t0 + 2; }
    else if (p.kind === 'arp') {
      const v = T.voicing(p.v), ss = T.sounding(v), gap = p.gap || 0.5;
      ss.forEach((s, k) => pluckString(s, T.OPEN[s] + v.frets[s], t0 + k * gap, 0.8));
      A.strumAt(p.v, t0 + ss.length * gap + 0.4, 'D', 0.85);
      end = t0 + ss.length * gap + 2.2;
    } else if (p.kind === 'pattern' || p.kind === 'pick') {
      const score = C.rhythmScore({ strum: p.kind === 'pattern' ? p.strum : null, pick: p.kind === 'pick' ? p.pick : null, seq: p.seq, bpc: p.bpc, tempo: p.tempo, bars: p.bars || 2 });
      if (p.withClicks !== false) { const beat = 60 / p.tempo; for (let i = 0; i < score.bars * score.sig; i++) A.clickAt(t0 + i * beat, i % score.sig === 0, 'bois'); }
      end = scheduleScore(score, t0);
    } else if (p.kind === 'changes') {
      for (let i = 0; i < (p.n || 6); i++) A.strumAt(i % 2 ? p.b : p.a, t0 + i * p.gap, 'D', 0.85);
      end = t0 + (p.n || 6) * p.gap + 1.2;
    } else if (p.kind === 'cadence') {
      // I–IV–V–I dans la tonalité, puis (après un silence) l'accord à reconnaître
      const seq = ['I', 'IV', 'V', 'I'].map(rn => T.playable(T.degreeChord(rn, p.key)).v.id);
      seq.forEach((id, i) => A.strumAt(id, t0 + i * 0.85, 'D', 0.8));
      let t = t0 + seq.length * 0.85 + 0.7;
      const then = Array.isArray(p.then) ? p.then : p.then ? [p.then] : [];
      then.forEach((id, i) => A.strumAt(id, t + i * 1.1, 'D', 0.9));
      end = t + then.length * 1.1 + 1.6;
    } else if (p.kind === 'progression') {
      const beat = 60 / (p.tempo || 90);
      p.seq.forEach((id, i) => { for (let b = 0; b < (p.bpc || 4); b++) A.strumAt(id, t0 + (i * (p.bpc || 4) + b) * beat, b % 2 ? 'U' : 'D', b ? 0.65 : 0.9); });
      end = t0 + p.seq.length * (p.bpc || 4) * beat + 1.5;
    } else if (p.kind === 'note') { A.noteAt(p.midi, t0, 0.85); end = t0 + (p.dur || 1.6); }
    else if (p.kind === 'pair') { A.noteAt(p.a, t0, 0.85, 3); A.noteAt(p.b, t0 + (p.gap || 1.1), 0.85, 3); end = t0 + (p.gap || 1.1) + 1.4; }
    else if (p.kind === 'clicks') { const beat = 60 / (p.tempo || 60); for (let i = 0; i < (p.n || 8); i++) A.clickAt(t0 + i * beat, i % 4 === 0, 'bois'); end = t0 + (p.n || 8) * beat; }
    return end;
  }
  /** Rendu hors temps réel d'un modèle (tests en navigateur). */
  A.renderOffline = async function (play, sr, dur) {
    sr = sr || 44100;
    const OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    const off = new OAC(1, Math.ceil(sr * (dur || 6)), sr);
    const saved = [ctx, master, bus];
    ctx = off; ({ master, bus } = buildOutput(off)); strings.fill(null);
    try { schedule(play, {}); } finally { [ctx, master, bus] = saved; strings.fill(null); }
    const buf = await off.startRendering();
    return { pcm: buf.getChannelData(0), sr };
  };

  /* ------------------------------------------------------------ métronome (outil) */
  // Ordonnanceur à anticipation (« A tale of two clocks ») : les clics sont programmés sur l'horloge audio,
  // 120 ms à l'avance, par une minuterie de 25 ms — précis même si l'interface ralentit.
  A.metronome = {
    on: false, tempo: 80, sig: 4, sub: 1, kind: 'bois', silent: null, onBeat: null, _timer: null, _next: 0, _n: 0,
    start(o) {
      Object.assign(this, o || {});
      if (!ctx) return;
      this.stop(); this.on = true; this._n = 0; this._next = ctx.currentTime + 0.1;
      const tick = () => {
        if (!this.on) return;
        while (this._next < ctx.currentTime + 0.12) {
          const beatIdx = Math.floor(this._n / this.sub), bar = Math.floor(beatIdx / this.sig);
          const muted = this.silent && (bar % (this.silent.play + this.silent.mute)) >= this.silent.play;
          const isBeat = this._n % this.sub === 0, accent = isBeat && beatIdx % this.sig === 0;
          if (!muted) { if (isBeat) A.clickAt(this._next, accent, this.kind); else play(clickBuffer('bois', false), this._next, 0.18); }
          if (this.onBeat && isBeat) { const t = this._next, b = beatIdx % this.sig, mu = muted; setTimeout(() => this.onBeat && this.onBeat(b, mu), Math.max(0, (t - ctx.currentTime) * 1000)); }
          this._next += 60 / this.tempo / this.sub; this._n++;
        }
      };
      tick(); this._timer = setInterval(tick, 25);
    },
    stop() { this.on = false; clearInterval(this._timer); this._timer = null; },
  };

  /* ------------------------------------------------------------ micro */
  const WORKLET = `class AccordRec extends AudioWorkletProcessor {
    constructor(){ super(); this.buf = new Float32Array(2048); this.n = 0; this.t = 0; }
    process(inputs){ const ch = inputs[0] && inputs[0][0]; if (ch) { if (this.n === 0) this.t = currentTime; for (let i = 0; i < ch.length; i++) { this.buf[this.n++] = ch[i]; if (this.n === this.buf.length) { this.port.postMessage({ d: this.buf.slice(0), t: this.t }); this.n = 0; } } } return true; }
  }
  registerProcessor('accord-rec', AccordRec);`;
  A.micReady = () => !!mic;
  A.micAlive = () => !!mic && mic.getAudioTracks().some(t => t.readyState === 'live' && !t.muted);
  let micP = null;
  const workletFor = new WeakMap();
  A.openMic = function () {
    if (mic && A.micAlive()) return Promise.resolve(true);
    if (micP) return micP;
    micP = openMic().finally(() => { micP = null; });
    return micP;
  };
  async function openMic() {
    await A.ensure();
    if (mic) A.closeMic(true);
    try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch (e) { /* Safari ancien */ }
    mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 } });
    micSrc = ctx.createMediaStreamSource(mic);
    analyser = ctx.createAnalyser(); analyser.fftSize = 8192; analyser.smoothingTimeConstant = 0;
    micSrc.connect(analyser);
    sink = ctx.createGain(); sink.gain.value = 0; sink.connect(ctx.destination);
    let ok = false;
    if (ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
      try {
        if (!workletFor.get(ctx)) { const url = URL.createObjectURL(new Blob([WORKLET], { type: 'application/javascript' })); workletFor.set(ctx, ctx.audioWorklet.addModule(url)); }
        await workletFor.get(ctx);
        recNode = new AudioWorkletNode(ctx, 'accord-rec', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1 });
        recNode.port.onmessage = e => { if (recording) { if (recT0 == null) recT0 = e.data.t; chunks.push(e.data.d); recLen += e.data.d.length; } };
        micSrc.connect(recNode); recNode.connect(sink);
        ok = true;
      } catch (e) { ok = false; workletFor.delete(ctx); }
    }
    if (!ok) {
      recNode = ctx.createScriptProcessor(4096, 1, 1);
      recNode.onaudioprocess = e => { if (recording) { const d = new Float32Array(e.inputBuffer.getChannelData(0)); if (recT0 == null) recT0 = (e.playbackTime || ctx.currentTime) - d.length / ctx.sampleRate; chunks.push(d); recLen += d.length; } };
      micSrc.connect(recNode); recNode.connect(sink);
    }
    return true;
  }
  A.closeMic = function (reopening) {
    try { if (mic) mic.getTracks().forEach(t => t.stop()); } catch (e) { /* rien */ }
    try { if (micSrc) micSrc.disconnect(); if (recNode) recNode.disconnect(); if (sink) sink.disconnect(); } catch (e) { /* rien */ }
    mic = null; micSrc = null; recNode = null; analyser = null; sink = null;
    if (!reopening) { recording = false; chunks = []; recLen = 0; recT0 = null; }
    try { if (!reopening && navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* rien */ }
  };
  const tmp = new Float32Array(8192);
  /** Niveau d'entrée instantané (dBFS). */
  A.level = function () {
    if (!analyser) return -120;
    analyser.getFloatTimeDomainData(tmp);
    let s = 0; for (let i = 6144; i < 8192; i++) s += tmp[i] * tmp[i];
    return 10 * Math.log10(s / 2048 + 1e-12);
  };
  /** Dernière trame du micro (pour l'accordeur en direct). */
  A.frame = function (n) {
    if (!analyser) return null;
    analyser.getFloatTimeDomainData(tmp);
    return { x: tmp.subarray(8192 - (n || 4096)), sr: ctx.sampleRate };
  };
  A.startRec = function () { chunks = []; recLen = 0; recT0 = null; recording = true; };
  /** Fin de prise : {pcm, sr, t0} — t0 = instant (horloge audio) du premier échantillon. */
  A.stopRec = function () {
    recording = false;
    const out = new Float32Array(recLen); let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    const t0 = recT0;
    chunks = []; recLen = 0; recT0 = null;
    return { pcm: out, sr: ctx ? ctx.sampleRate : 48000, t0 };
  };
  A.isRecording = () => recording;
  /** Réécoute d'une prise (Float32 ou Int16). */
  A.playPcm = async function (pcm, sr) {
    if (!pcm || !pcm.length) return false;
    await A.ensure();
    if (ctx.state !== 'running') return false;
    const f = pcm instanceof Int16Array ? Float32Array.from(pcm, v => v / 32768) : pcm;
    const buf = ctx.createBuffer(1, f.length, sr); buf.getChannelData(0).set(f);
    let pk = 0; for (let i = 0; i < f.length; i++) pk = Math.max(pk, Math.abs(f[i]));
    const s = ctx.createBufferSource(), g = ctx.createGain(); g.gain.value = (pk > 1e-4 ? 0.9 / pk : 1) * 4 * Math.min(1.6, A.userVolume) * 0.3;
    s.buffer = buf; s.connect(g); g.connect(bus); s.start();
    track([s], ctx.currentTime + buf.duration);
    return new Promise(res => { let done = false; const fin = () => { if (!done) { done = true; res(true); } }; s.onended = fin; setTimeout(fin, buf.duration * 1000 + 400); });
  };

  AC.audio = A;
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* ==== store.js ==== */
/* ACCORD — stockage local : l'état dans localStorage (petit, sûr), les enregistrements dans IndexedDB.
   Rien ne quitte le téléphone : pas de serveur, pas de compte. */
(function (root) {
  'use strict';
  const AC = root.AC || (root.AC = {});
  const K = 'accord.state.v1';
  const S = {};
  let memory = null;
  S.load = function () {
    try { const t = root.localStorage.getItem(K); if (t) return JSON.parse(t); } catch (e) { /* navigation privée */ }
    return memory;
  };
  let timer = null, pending = null;
  S.save = function (state, now) { pending = state; if (now) return flush(); if (!timer) timer = setTimeout(flush, 400); };
  function flush() {
    timer = null;
    if (!pending) return;
    memory = pending;
    try { root.localStorage.setItem(K, JSON.stringify(pending)); S.lastError = null; }
    catch (e) { S.lastError = e; if (S.onError) S.onError(e); }
    pending = null;
  }
  S.flush = flush;
  S.clear = function () { try { root.localStorage.removeItem(K); } catch (e) { /* rien */ } memory = null; };
  S.persist = async function () { try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch (e) { /* rien */ } return false; };
  /** Lecture JSON d'une clé quelconque (données de l'ancienne app Corde). */
  S.getJSON = function (k) { try { const v = root.localStorage.getItem(k); return v == null ? null : JSON.parse(v); } catch (e) { return null; } };

  let dbp = null;
  const metaOf = r => ({ id: r.id, ts: r.ts, ex: r.ex, label: r.label, kind: r.kind, song: r.song, idea: r.idea, sec: r.data ? r.data.byteLength / 2 / r.sr : r.sec || 0, keep: !!r.keep });
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      if (!root.indexedDB) return rej(new Error('IndexedDB indisponible'));
      let rq;
      try { rq = root.indexedDB.open('accord', 1); } catch (e) { return rej(e); }
      rq.onupgradeneeded = () => { const d = rq.result; if (!d.objectStoreNames.contains('rec')) d.createObjectStore('rec', { keyPath: 'id' }); if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'id' }); };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
      rq.onblocked = () => rej(new Error('Base bloquée'));
    }).catch(e => { dbp = null; throw e; });
    return dbp;
  }
  const tx = async (stores, mode, fn) => {
    const d = await db();
    return new Promise((res, rej) => {
      const t = d.transaction(stores, mode);
      const out = fn(...stores.map(n => t.objectStore(n)));
      t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
      t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Transaction annulée'));
    });
  };
  /** Enregistre une prise (22 050 Hz, 16 bits). meta : {ex, label, kind ('song'|'idea'|'take'), song, idea} */
  S.saveRec = async function (pcm, sr, meta) {
    const i16 = new Int16Array(pcm.length);
    let pk = 0; for (let i = 0; i < pcm.length; i++) pk = Math.max(pk, Math.abs(pcm[i]));
    const g = pk > 0.98 ? 0.98 / pk : 1;
    for (let i = 0; i < pcm.length; i++) i16[i] = Math.max(-32768, Math.min(32767, Math.round(pcm[i] * g * 32767)));
    const rec = Object.assign({ id: 'r' + Date.now() + Math.floor(Math.random() * 1000), ts: Date.now(), sr, data: i16.buffer }, meta || {});
    try { await tx(['rec', 'meta'], 'readwrite', (r, m) => { r.put(rec); m.put(metaOf(rec)); }); await S.prune(); } catch (e) { S.lastError = e; return null; }
    return rec.id;
  };
  S.listRecs = async function (filter) { try { const all = await tx(['meta'], 'readonly', m => m.getAll()); return (all || []).filter(r => !filter || filter(r)).sort((a, b) => b.ts - a.ts); } catch (e) { return []; } };
  S.getRec = async function (id) { try { const r = await tx(['rec'], 'readonly', st => st.get(id)); return r ? { pcm: new Int16Array(r.data), sr: r.sr, meta: metaOf(r) } : null; } catch (e) { return null; } };
  S.deleteRec = async function (id) { try { await tx(['rec', 'meta'], 'readwrite', (r, m) => { r.delete(id); m.delete(id); }); } catch (e) { /* rien */ } };
  S.keepRec = async function (id, keep) { try { const m = await tx(['meta'], 'readonly', st => st.get(id)); if (m) { m.keep = !!keep; await tx(['meta'], 'readwrite', st => st.put(m)); } } catch (e) { /* rien */ } };
  /** Garde au plus 60 prises non marquées (les idées de composition sont toujours gardées). */
  S.prune = async function () { const list = await S.listRecs(); const free = list.filter(r => !r.keep && r.kind !== 'idea'); for (const r of free.slice(60)) await S.deleteRec(r.id); };

  AC.store = S;
})(typeof globalThis !== 'undefined' ? globalThis : this);
