/* ==== gsynth.js ==== */
/* ACCORD — guitare de synthèse (pur : rend des échantillons, testable sans navigateur).
   Corde pincée par l'algorithme de Karplus-Strong étendu (Karplus & Strong 1983 ; Jaffe & Smith 1983) :
   ligne à retard accordée finement (passe-tout fractionnaire), filtre de pertes (les aigus s'éteignent plus
   vite), excitation filtrée selon la force et la position de l'attaque, résonances de caisse. Plus le clic
   du métronome (bruit bref dans la bande 6,5–10 kHz : audible, et repérable dans la prise pour mesurer la
   latence sans gêner l'analyse de la guitare, qui s'arrête à 6 kHz) et la frappe étouffée. */
(function (root) {
  'use strict';
  const AC = root.AC || (root.AC = {});
  const G = {};
  function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

  /** Biquad RBJ appliqué en place. type : 'peak' | 'lp' | 'hp' | 'bp' | 'hs' */
  function biquadInPlace(x, sr, type, fc, q, gainDb) {
    const A = Math.pow(10, (gainDb || 0) / 40), w0 = 2 * Math.PI * fc / sr, cs = Math.cos(w0), sn = Math.sin(w0), al = sn / (2 * (q || Math.SQRT1_2));
    let b0, b1, b2, a0, a1, a2;
    if (type === 'peak') { b0 = 1 + al * A; b1 = -2 * cs; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cs; a2 = 1 - al / A; }
    else if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al; }
    else { const sA = 2 * Math.sqrt(A) * al; b0 = A * ((A + 1) + (A - 1) * cs + sA); b1 = -2 * A * ((A - 1) + (A + 1) * cs); b2 = A * ((A + 1) + (A - 1) * cs - sA); a0 = (A + 1) - (A - 1) * cs + sA; a1 = 2 * ((A - 1) - (A + 1) * cs); a2 = (A + 1) - (A - 1) * cs - sA; }
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) { const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; x[i] = v; }
    return x;
  }
  G.biquadInPlace = biquadInPlace;

  /**
   * Une corde pincée. midi peut être fractionnaire (écart en cents). o : {sr, dur, vel 0–1, mute, pick (position 0–0,5),
   * seed, a4}. Renvoie un Float32Array normalisé (crête ≈ 0,9 × vel).
   */
  G.note = function (midi, o) {
    o = o || {};
    const sr = o.sr || 32000, dur = o.dur || 2.6, vel = o.vel == null ? 0.8 : o.vel;
    const f0 = (o.a4 || 440) * Math.pow(2, (midi - 69) / 12);
    const n = Math.max(1, Math.floor(dur * sr)), y = new Float32Array(n);
    const r = rng(o.seed || (Math.round(midi * 100) + 7));
    // filtre de pertes (moyenne pondérée de deux échantillons) : S plus grand = son plus mat
    const S = o.mute ? 0.5 : 0.5 - 0.12 * vel;
    const N = sr / f0;                         // période en échantillons
    let L = Math.floor(N - S - 0.1);           // retard entier ; le reste (δ ∈ [0,1 ; 1,1)) par un passe-tout
    if (L < 2) L = 2;
    const delta = N - S - L, C = (1 - delta) / (1 + delta);
    // gain de boucle : T60 du fondamental (graves longs, aigus plus courts ; étouffée : très bref)
    const t60 = o.mute ? 0.12 : Math.max(1.6, 7.5 - 0.09 * (midi - 40));
    const w = 2 * Math.PI * f0 / sr;
    const hmag = Math.sqrt((1 - S) * (1 - S) + S * S + 2 * S * (1 - S) * Math.cos(w));
    const g = Math.min(0.99995, Math.pow(10, -3 / (t60 * f0)) / hmag);
    // excitation : bruit filtré (force) et peigne de position d'attaque
    const buf = new Float32Array(L + 2);
    const beta = o.pick || 0.13, P = Math.max(1, Math.round(beta * L));
    const ex = new Float32Array(L + 2);
    let lp = 0; const k = 0.25 + 0.6 * vel;
    for (let i = 0; i < L + 2; i++) { lp += k * ((r() * 2 - 1) - lp); ex[i] = lp; }
    for (let i = 0; i < L + 2; i++) buf[i] = ex[i] - (i >= P ? ex[i - P] : 0);
    let mx = 0; for (let i = 0; i < L + 2; i++) mx = Math.max(mx, Math.abs(buf[i]));
    for (let i = 0; i < L + 2; i++) buf[i] /= mx || 1;
    // boucle de Karplus-Strong
    let idx = 0, prev = 0, apX1 = 0, apY1 = 0;
    for (let i = 0; i < n; i++) {
      const cur = buf[idx];
      y[i] = cur;
      const lpOut = (1 - S) * cur + S * prev;
      prev = cur;
      const ap = C * lpOut + apX1 - C * apY1;            // passe-tout fractionnaire
      apX1 = lpOut; apY1 = ap;
      buf[idx] = g * ap;
      idx++; if (idx >= L) idx = 0;
    }
    // attaque du médiator (bruit bref aigu) et caisse (résonances d'air et de table)
    const att = Math.floor(0.003 * sr);
    for (let i = 0; i < att && i < n; i++) y[i] += 0.15 * vel * (r() * 2 - 1) * (1 - i / att);
    biquadInPlace(y, sr, 'peak', 100, 1.4, 4);
    biquadInPlace(y, sr, 'peak', 210, 1.6, 3);
    biquadInPlace(y, sr, 'hs', 5000, 0.7, -6);
    // fondu final
    const fade = Math.min(n, Math.floor(0.05 * sr));
    for (let i = 0; i < fade; i++) y[n - 1 - i] *= i / fade;
    let pk = 0; for (let i = 0; i < Math.min(n, sr * 0.2); i++) pk = Math.max(pk, Math.abs(y[i]));
    const gain = 0.9 * (0.35 + 0.65 * vel) / (pk || 1);
    for (let i = 0; i < n; i++) y[i] *= gain;
    return y;
  };

  /** Frappe étouffée (« chuck ») : bruit sec + choc grave. */
  G.chuck = function (o) {
    o = o || {};
    const sr = o.sr || 32000, n = Math.floor(0.12 * sr), y = new Float32Array(n), r = rng(o.seed || 11);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      lp += 0.3 * ((r() * 2 - 1) - lp);
      y[i] = 0.9 * Math.exp(-i / (0.012 * sr)) * lp + 0.6 * Math.exp(-i / (0.03 * sr)) * Math.sin(2 * Math.PI * 95 * i / sr);
    }
    let pk = 0; for (const v of y) pk = Math.max(pk, Math.abs(v));
    for (let i = 0; i < n; i++) y[i] *= 0.8 * (o.vel || 0.8) / (pk || 1);
    return y;
  };

  /**
   * Clic du métronome. kind : 'aigu' (bruit bref 6,5–10 kHz, mesurable dans la prise) ou 'bois' (woodblock, au casque).
   * accent : premier temps de la mesure (plus fort, un peu plus aigu).
   */
  G.click = function (kind, accent, sr) {
    sr = sr || 44100;
    const n = Math.floor(0.03 * sr), y = new Float32Array(n), r = rng(accent ? 77 : 33);
    if (kind === 'bois') {
      const f = accent ? 1900 : 1500;
      for (let i = 0; i < n; i++) y[i] = Math.exp(-i / (0.012 * sr)) * (Math.sin(2 * Math.PI * f * i / sr) + 0.4 * Math.sin(2 * Math.PI * f * 1.53 * i / sr));
    } else {
      for (let i = 0; i < n; i++) y[i] = (r() * 2 - 1) * Math.exp(-i / (0.0025 * sr));
      // passe-haut raide (deux étages) + passe-bas doux : énergie concentrée entre 6,5 et 10 kHz
      const hi = Math.min(0.45 * sr, accent ? 7500 : 6800);
      biquadInPlace(y, sr, 'hp', hi, 0.8); biquadInPlace(y, sr, 'hp', hi, 0.8); biquadInPlace(y, sr, 'hp', hi, 0.8);
      if (sr > 24000) biquadInPlace(y, sr, 'lp', 10500, 0.7);
    }
    let pk = 0; for (const v of y) pk = Math.max(pk, Math.abs(v));
    const g = (accent ? 1 : 0.62) / (pk || 1);
    for (let i = 0; i < n; i++) y[i] *= g;
    return y;
  };

  /**
   * Rendu hors temps réel d'une suite d'événements de guitare (tests, pré-écoute) :
   * events : [{t, midi, vel, mute, string}] — une nouvelle note sur une corde arrête la précédente.
   */
  G.render = function (events, dur, sr) {
    sr = sr || 32000;
    const y = new Float32Array(Math.ceil(dur * sr));
    const last = {};
    const evs = events.slice().sort((a, b) => a.t - b.t);
    evs.forEach((e, i) => {
      if (e.string != null) last[e.string] = i;
      const next = e.string != null ? evs.slice(i + 1).find(z => z.string === e.string || z.chuck) : null;
      const a = Math.floor(e.t * sr);
      const buf = e.chuck ? G.chuck({ sr, vel: e.vel }) : G.note(e.midi, { sr, vel: e.vel, mute: e.mute, seed: i * 13 + 5 });
      const stop = next ? Math.floor(next.t * sr) - a : buf.length;
      for (let k = 0; k < buf.length && a + k < y.length; k++) {
        const fade = k > stop ? Math.max(0, 1 - (k - stop) / (0.01 * sr)) : 1;
        if (fade <= 0) break;
        y[a + k] += 0.3 * buf[k] * fade;
      }
    });
    return y;
  };

  AC.gsynth = G;
  if (typeof module !== 'undefined' && module.exports) module.exports = G;
})(typeof globalThis !== 'undefined' ? globalThis : this);
