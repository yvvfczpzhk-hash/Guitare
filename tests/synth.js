'use strict';
/*
 * Guitare de synthèse réaliste pour les tests (indépendante du moteur de l'app) :
 * cordes à partiels inharmoniques (synthèse modale), position du médiator, amortissement par fréquence,
 * bruit d'attaque, résonances de caisse, coups vers le bas/haut étalés dans le temps, cordes étouffées,
 * mauvaises cases, frisures, frappes percussives (« chuck »), micro de téléphone (graves coupés),
 * réverbération de pièce, bruit de fond, clics du métronome entendus par le micro, voix chantée.
 */
const FS = 44100;
const OPEN = [40, 45, 50, 55, 59, 64];
function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const midiToHz = (m, a4) => (a4 || 440) * Math.pow(2, (m - 69) / 12);
function gauss(r) { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

/** Ajoute dans y (Float32Array) une corde pincée. o : {t, midi, cents, amp, dur, muted, buzz, pick, bright, seed, end} */
function addString(y, o) {
  const r = rng(o.seed || 7);
  const f0 = midiToHz(o.midi, o.a4) * Math.pow(2, (o.cents || 0) / 1200);
  const B = o.B != null ? o.B : 6e-5;
  const beta = o.pick || 0.13 + 0.06 * r();                  // position de l'attaque depuis le chevalet
  const fc = o.bright || 2600 + 1500 * r();                  // dureté du médiator
  const a0 = Math.floor(o.t * FS);
  const end = o.end != null ? Math.min(y.length, Math.floor(o.end * FS)) : y.length;
  const tau0 = o.muted ? 0.03 + 0.03 * r() : (o.tau || (1.6 - 0.15 * (o.midi - 40) / 6));
  const parts = [];
  for (let h = 1; h <= 40; h++) {
    const fh = h * f0 * Math.sqrt(1 + B * h * h);
    if (fh > 9500) break;
    let a = Math.abs(Math.sin(Math.PI * h * beta)) / Math.pow(h, 1.05) / (1 + Math.pow(fh / fc, 2));
    const tau = tau0 / (1 + Math.pow(fh / 600, 1.6));        // les aigus s'éteignent vite (T60 ≈ 0,7 s à 3 kHz)
    parts.push({ w: 2 * Math.PI * fh / FS, a, tau, ph: r() * 2 * Math.PI, det: 1 + (r() - 0.5) * 0.0004 });
  }
  let norm = 0; for (const p of parts) norm += p.a * p.a; norm = Math.sqrt(norm) || 1;
  const amp = (o.amp || 0.2) / norm;
  // fin de note : la corde est arrêtée (nouveau coup sur la même corde, frappe étouffée) → amortissement en ~8 ms
  const stopAt = o.end != null ? Math.max(0, Math.floor(o.end * FS) - a0) : Infinity;
  const maxN = Math.min(y.length - a0, Math.floor((o.muted ? 0.35 : Math.min(o.dur || 4, 6 * tau0)) * FS), isFinite(stopAt) ? stopAt + Math.floor(0.04 * FS) : Infinity);
  const damp = Math.exp(-1 / (0.008 * FS));
  for (const p of parts) {
    const dec = Math.exp(-1 / (p.tau * FS));
    let g = amp * p.a, ph = p.ph;
    const w = p.w * p.det;
    for (let i = 0; i < maxN; i++) {
      const env = i < 40 ? i / 40 : 1;
      y[a0 + i] += g * env * Math.sin(ph);
      ph += w; g *= i >= stopAt ? damp * dec : dec;
      if (g < 1e-7) break;
    }
  }
  void end;
  // bruit d'attaque du médiator
  const nAtt = Math.floor(0.004 * FS);
  for (let i = 0; i < nAtt; i++) y[a0 + i] += (o.amp || 0.2) * 0.12 * (r() * 2 - 1) * (1 - i / nAtt);
  // frisure : impacts de la corde contre une frette, au rythme de la vibration
  if (o.buzz) {
    const period = FS / f0, nb = Math.min(maxN, Math.floor(0.6 * FS));
    for (let i = 0; i < nb; i++) {
      const phase = (i % period) / period;
      if (phase < 0.06) y[a0 + i] += (o.amp || 0.2) * 0.22 * o.buzz * (r() * 2 - 1) * Math.exp(-i / (0.25 * FS));
    }
  }
}

/** Frappe étouffée : bruit large bande très bref + choc grave + cordes étouffées. */
function addChuck(y, t, amp, seed) {
  const r = rng(seed || 3), a0 = Math.floor(t * FS), n = Math.floor(0.09 * FS);
  let lp = 0;
  for (let i = 0; i < n && a0 + i < y.length; i++) {
    const env = Math.exp(-i / (0.011 * FS));
    lp += 0.35 * ((r() * 2 - 1) - lp);
    y[a0 + i] += amp * 0.9 * env * lp + amp * 0.5 * Math.exp(-i / (0.025 * FS)) * Math.sin(2 * Math.PI * 95 * i / FS);
  }
  for (let s = 0; s < 6; s++) addString(y, { t: t + s * 0.002, midi: OPEN[s] + 2, amp: amp * 0.25, muted: true, seed: seed * 11 + s });
}

/**
 * Coup sur un accord. o : {t, frets (corde 6 → 1), dir 'D'|'U', spread (s), amp, muted:[cordes], wrong:{s: +n}, buzz:{s: niveau},
 * strings (cordes touchées), seed, a4, cents:{s: écart}}
 */
function addStrum(y, o) {
  const r = rng(o.seed || 1);
  let strings = [];
  for (let s = 0; s < 6; s++) if (o.frets[s] >= 0) strings.push(s);
  if (o.strings) strings = strings.filter(s => o.strings.includes(s));
  else if (o.dir === 'U') strings = strings.filter(s => s >= 2);       // en montant, on évite souvent les basses
  if (o.dir === 'U') strings.reverse();
  const spread = o.spread != null ? o.spread : 0.012 + 0.02 * r();
  strings.forEach((s, k) => {
    const t = o.t + (strings.length > 1 ? k * spread / (strings.length - 1) : 0) + (r() - 0.5) * 0.0015;
    const midi = OPEN[s] + o.frets[s] + ((o.wrong && o.wrong[s]) || 0);
    const amp = (o.amp || 0.18) * (o.dir === 'U' ? 0.8 : 1) * (0.8 + 0.4 * r()) * (s < 2 ? 1.1 : 1);
    addString(y, { t, midi, amp, muted: o.muted && o.muted.includes(s), buzz: o.buzz && o.buzz[s], seed: (o.seed || 1) * 31 + s, a4: o.a4, cents: o.cents && o.cents[s], end: o.ends ? o.ends[s] : o.end, dur: o.dur });
  });
}

/** Clic du métronome tel que le micro l'entend (bruit bref, bande 7–10 kHz). */
function addClick(y, t, amp, seed) {
  // bruit bande 6,5–10 kHz (somme de sinusoïdes à phases aléatoires), décroissance rapide, + un peu de
  // distorsion du haut-parleur (quelques % d'énergie plus grave)
  const r = rng(seed || 5), a0 = Math.floor(t * FS), n = Math.floor(0.012 * FS);
  const comps = []; for (let k = 0; k < 40; k++) comps.push({ f: 6500 + 3500 * r(), ph: r() * 6.28 });
  for (let i = 0; i < n && a0 + i < y.length; i++) {
    let v = 0; for (const c of comps) v += Math.sin(c.ph + 2 * Math.PI * c.f * i / FS);
    const env = Math.exp(-i / (0.0022 * FS));
    y[a0 + i] += amp * env * (v / 6.3 + 0.08 * Math.sin(2 * Math.PI * 1800 * i / FS));
  }
}

/** Voix chantée simple (source harmonique + formants approximatifs). notes : [{t0, t1, midi}] */
function addVoice(y, notes, amp, seed) {
  const r = rng(seed || 9);
  const F = [[700, 110], [1150, 130], [2500, 180]];
  for (const nt of notes) {
    const a0 = Math.floor(nt.t0 * FS), a1 = Math.min(y.length, Math.floor(nt.t1 * FS));
    const f0 = midiToHz(nt.midi);
    const H = Math.floor(5000 / f0);
    const amps = [];
    for (let h = 1; h <= H; h++) { const f = h * f0; let g = 0; for (const [fc, bw] of F) g += 1 / (1 + Math.pow((f - fc) / bw, 2)); amps.push((0.15 + g) / h); }
    let norm = 0; for (const a of amps) norm += a * a; norm = Math.sqrt(norm);
    const ph = amps.map(() => r() * 6.28);
    let phase = 0;
    for (let i = a0; i < a1; i++) {
      const tt = (i - a0) / FS, env = Math.min(1, tt / 0.04, (a1 - i) / FS / 0.05);
      const vib = 1 + 0.004 * Math.sin(2 * Math.PI * 5.2 * tt);          // vibrato léger (±7 cents)
      phase += 2 * Math.PI * f0 * vib / FS;
      let v = 0;
      for (let h = 0; h < amps.length; h++) v += amps[h] * Math.sin(ph[h] + (h + 1) * phase);
      y[i] += amp * env * v / norm + amp * 0.02 * (r() * 2 - 1);
    }
  }
}

/** Pièce et micro : résonances de caisse, réverbération (peignes de Schroeder), micro de téléphone, bruit. */
function room(y, o) {
  o = o || {};
  const r = rng(o.seed || 17);
  const out = new Float32Array(y.length);
  // caisse : quelques résonances (biquads passe-bande ajoutés au signal direct)
  const bp = (x, fc, q) => {
    const w0 = 2 * Math.PI * fc / FS, al = Math.sin(w0) / (2 * q), cs = Math.cos(w0);
    const b0 = al, b2 = -al, a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al;
    const z = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) { const v = (b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; z[i] = v; }
    return z;
  };
  const r1 = bp(y, 102, 6), r2 = bp(y, 205, 5), r3 = bp(y, 410, 3);
  for (let i = 0; i < y.length; i++) out[i] = y[i] + 0.5 * r1[i] + 0.35 * r2[i] + 0.2 * r3[i];
  // réverbération : 4 peignes en parallèle
  if (o.reverb !== 0) {
    const wet = o.reverb || 0.12, combs = [1557, 1617, 1491, 1422].map(d => ({ d: Math.round(d * 1.3), g: 0.78, buf: new Float32Array(Math.round(d * 1.3)), i: 0 }));
    for (let i = 0; i < out.length; i++) {
      let s = 0;
      for (const c of combs) { const v = c.buf[c.i]; s += v; c.buf[c.i] = out[i] + c.g * v; c.i = (c.i + 1) % c.d; }
      out[i] += wet * s / 4;
    }
  }
  // micro de téléphone : passe-haut (graves atténués) et passe-bas doux
  const hpF = o.micHp || 120;
  {
    const w0 = 2 * Math.PI * hpF / FS, cs = Math.cos(w0), al = Math.sin(w0) / (2 * Math.SQRT1_2);
    const b0 = (1 + cs) / 2, b1 = -(1 + cs), b2 = (1 + cs) / 2, a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < out.length; i++) { const v = (b0 * out[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = out[i]; y2 = y1; y1 = v; out[i] = v; }
  }
  // bruit de fond rose-ish au rapport signal/bruit voulu (référence : énergie des 5 % les plus forts de 50 ms)
  if (o.snr != null) {
    const L = Math.floor(0.05 * FS), es = [];
    for (let i = 0; i + L <= out.length; i += L) { let e = 0; for (let j = 0; j < L; j++) e += out[i + j] * out[i + j]; es.push(e / L); }
    es.sort((a, b) => a - b);
    const ref = es[Math.floor(0.95 * (es.length - 1))] || 1e-6;
    const nRms = Math.sqrt(ref) * Math.pow(10, -o.snr / 20);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < out.length; i++) {
      const w = gauss(r);
      b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
      out[i] += nRms * 0.25 * (b0 + b1 + b2 + w * 0.1848);
    }
  }
  if (o.gain) for (let i = 0; i < out.length; i++) out[i] *= o.gain;
  return out;
}

/**
 * Joueur humain sur une grille : coups attendus [{beat, k, frets}] à `tempo`, à partir de t0 (s).
 * human : {sd (s), bias (s), drift (s/s), seed, spread}
 * Renvoie {y (brut avant pièce), times (instants réels du début de chaque coup)}
 */
function playGrid(y, events, tempo, t0, human, chordAt) {
  human = human || {};
  const r = rng(human.seed || 21), beat = 60 / tempo;
  const times = [];
  events.forEach(e => {
    const tg = t0 + e.beat * beat;
    let t = tg + (human.bias || 0) + (human.sd || 0) * gauss(r) + (human.drift || 0) * (tg - t0);
    if (e.late) t += e.late;
    times.push(t);
  });
  // cordes touchées par chaque coup (un coup vers le haut épargne les cordes 6 et 5 ; une frappe étouffe tout)
  const touched = events.map(e => (e.k === 'X' ? [0, 1, 2, 3, 4, 5] : e.k === 'U' ? [2, 3, 4, 5] : [0, 1, 2, 3, 4, 5]));
  events.forEach((e, i) => {
    const t = times[i];
    const frets = e.frets || (chordAt ? chordAt(e) : [0, 2, 2, 0, 0, 0]);
    const ends = [0, 1, 2, 3, 4, 5].map(s => { for (let j = i + 1; j < events.length; j++) if (touched[j].includes(s)) return times[j]; return null; });
    if (e.k === 'X') addChuck(y, t, human.amp || 0.18, 100 + i);
    else addStrum(y, { t, frets, dir: e.k === 'U' ? 'U' : 'D', amp: (human.amp || 0.18) * (e.acc ? 1.25 : 1), seed: 300 + i * 7 + (human.seed || 0), spread: human.spread, muted: e.muted, wrong: e.wrong, ends });
  });
  return times;
}

module.exports = { FS, OPEN, rng, gauss, midiToHz, addString, addStrum, addChuck, addClick, addVoice, room, playGrid };
