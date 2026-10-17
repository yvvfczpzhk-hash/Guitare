'use strict';
/*
 * Simulations pour les tests (indépendantes de l'app) :
 * — une guitare de synthèse réaliste pour l'accordeur : cordes à partiels inharmoniques (synthèse modale),
 *   position du médiator, amortissement par fréquence, résonances de caisse, réverbération de pièce, micro de
 *   téléphone (graves coupés), bruit de fond ;
 * — un « tapeur » humain pour les tapes : délai fixe du téléphone, irrégularité, dérive quand le clic se tait,
 *   coups oubliés, tapes en trop, « haut » pressés.
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
 * Tapeur humain : instants des tapes (s) pour des coups attendus [{t, k, free}].
 * o : {offset (s, délai fixe du téléphone), sd (s), seed, drift (fraction du tempo gagnée par seconde de silence :
 * 0,04 → accélère de 4 %), skip(e, i), extra: [instants], upBias (s, décalage des coups « haut »)}
 */
function tapper(events, o) {
  o = o || {};
  const r = rng(o.seed || 5), out = [];
  let lag = 0, prevFree = false, tFree0 = 0;
  events.forEach((e, i) => {
    if (e.free && !prevFree) { tFree0 = e.t; }
    if (e.free) lag = -(o.drift || 0) * (e.t - tFree0);           // en avance de plus en plus s'il accélère
    else if (prevFree) lag *= 0.5;                                 // le clic revient : il se recale peu à peu
    else lag *= 0.5;
    prevFree = e.free;
    if (o.skip && o.skip(e, i)) return;
    out.push(e.t + (o.offset || 0) + lag + (e.k === 'U' ? o.upBias || 0 : 0) + (o.sd || 0) * gauss(r));
  });
  (o.extra || []).forEach(t => out.push(t + (o.offset || 0)));
  return out.sort((a, b) => a - b);
}

module.exports = { FS, OPEN, rng, gauss, midiToHz, addString, room, tapper };
