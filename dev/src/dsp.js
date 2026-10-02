/* ==== dsp.js ==== */
/* ============================================================================
   ACCORD — moteur d'analyse de la guitare (traitement du signal pur, sans DOM).
   Attaques : flux spectral à filtre maximum (SuperFlux, Böck & Widmer 2013), crêtes
   adaptatives (Böck, Krebs & Schedl 2012), instant affiné sur l'enveloppe à 1 ms.
   Métronome : clics aigus (> 6,5 kHz) retrouvés dans la prise → latence réelle.
   Hauteur : YIN (de Cheveigné & Kawahara 2002). Accords : spectre en demi-tons,
   décomposition non négative sur des peignes d'harmoniques (dans l'esprit de
   NNLS-Chroma, Mauch & Dixon 2010), comparaison de chromas (Fujishima 1999).
   ========================================================================== */
(function (root) {
  'use strict';
  const AC = root.AC || (root.AC = {});
  const T = AC.theory || (typeof require !== 'undefined' ? require('./theory.js') : null);
  const D = {};
  const FS = 22050;                       // fréquence d'analyse
  D.FS = FS;

  /* ---------------------------------------------------------------- outils */
  const isNum = v => typeof v === 'number' && isFinite(v);
  function median(arr) {
    const a = Array.from(arr).filter(isNum).sort((x, y) => x - y);
    const n = a.length; if (!n) return NaN;
    return n % 2 ? a[(n - 1) >> 1] : (a[n / 2 - 1] + a[n / 2]) / 2;
  }
  function mean(arr) { let s = 0, n = 0; for (const v of arr) if (isNum(v)) { s += v; n++; } return n ? s / n : NaN; }
  function std(arr) {
    const m = mean(arr); let s = 0, n = 0;
    for (const v of arr) if (isNum(v)) { s += (v - m) * (v - m); n++; }
    return n > 1 ? Math.sqrt(s / (n - 1)) : NaN;
  }
  function percentile(arr, p) {
    const a = Array.from(arr).filter(isNum).sort((x, y) => x - y);
    if (!a.length) return NaN;
    return a[Math.min(a.length - 1, Math.max(0, Math.round(p * (a.length - 1))))];
  }
  const mad = arr => { const m = median(arr); return median(Array.from(arr).map(v => Math.abs(v - m))); };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dB = p => 10 * Math.log10(p + 1e-20);
  D.median = median; D.mean = mean; D.std = std; D.percentile = percentile; D.mad = mad;

  /* ---------------------------------------------------------------- FFT */
  const plans = new Map();
  function plan(n) {
    let p = plans.get(n); if (p) return p;
    const lv = Math.round(Math.log2(n));
    if ((1 << lv) !== n) throw new Error('FFT : taille non puissance de 2');
    const rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) { let r = 0, x = i; for (let b = 0; b < lv; b++) { r = (r << 1) | (x & 1); x >>= 1; } rev[i] = r; }
    const cos = new Float64Array(n >> 1), sin = new Float64Array(n >> 1);
    for (let i = 0; i < n >> 1; i++) { cos[i] = Math.cos(2 * Math.PI * i / n); sin[i] = Math.sin(2 * Math.PI * i / n); }
    p = { rev, cos, sin }; plans.set(n, p); return p;
  }
  function fft(re, im, inverse) {
    const n = re.length, p = plan(n);
    for (let i = 0; i < n; i++) {
      const j = p.rev[i];
      if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1, step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const wr = p.cos[k], wi = inverse ? p.sin[k] : -p.sin[k];
          const a = i + j, b = a + half;
          const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        }
      }
    }
    if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
  }
  D.fft = fft;
  const winCache = new Map();
  function hann(n) {
    let w = winCache.get(n);
    if (!w) { w = new Float64Array(n); for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)); winCache.set(n, w); }
    return w;
  }
  D.hann = hann;
  /** Spectre d'amplitude d'un segment x[a … a+len) (fenêtre de Hann), FFT de taille nfft ≥ len. */
  function magSpectrum(x, a, len, nfft) {
    const re = new Float64Array(nfft), im = new Float64Array(nfft), w = hann(len);
    for (let i = 0; i < len; i++) { const v = x[a + i]; re[i] = (v === undefined ? 0 : v) * w[i]; }
    fft(re, im, false);
    const out = new Float64Array(nfft >> 1);
    for (let k = 0; k < nfft >> 1; k++) out[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    return out;
  }
  D.magSpectrum = magSpectrum;
  /** Spectre moyen (amplitude) de plusieurs fenêtres dans [a, b). */
  function avgSpectrum(x, a, b, len, nfft) {
    a = Math.max(0, Math.round(a)); b = Math.min(x.length, Math.round(b));
    if (b - a < len) { len = Math.max(256, 1 << Math.floor(Math.log2(Math.max(256, b - a)))); if (b - a < 256) return null; }
    const out = new Float64Array(nfft >> 1);
    let n = 0;
    for (let s = a; s + len <= b; s += len >> 1) { const m = magSpectrum(x, s, len, nfft); for (let k = 0; k < out.length; k++) out[k] += m[k]; n++; }
    if (!n) return null;
    for (let k = 0; k < out.length; k++) out[k] /= n;
    return out;
  }
  D.avgSpectrum = avgSpectrum;

  /* ---------------------------------------------------------------- rééchantillonnage et filtres */
  /** Rééchantillonnage à sinus cardinal fenêtré (Blackman), anti-repliement inclus. */
  function resample(x, fsIn, fsOut) {
    if (fsIn === fsOut) return Float32Array.from(x);
    const r = fsIn / fsOut, fc = 0.45 / Math.max(1, r), half = Math.ceil(10 * Math.max(1, r)), TABLE = 64;
    const tlen = half * TABLE + 2, table = new Float64Array(tlen);
    for (let i = 0; i < tlen; i++) {
      const t = i / TABLE, s = t === 0 ? 1 : Math.sin(2 * Math.PI * fc * t) / (2 * Math.PI * fc * t);
      const wv = t >= half ? 0 : 0.42 + 0.5 * Math.cos(Math.PI * t / half) + 0.08 * Math.cos(2 * Math.PI * t / half);
      table[i] = 2 * fc * s * wv;
    }
    const nOut = Math.floor((x.length - 1) / r) + 1, y = new Float32Array(nOut);
    for (let n = 0; n < nOut; n++) {
      const t = n * r, c = Math.floor(t);
      let acc = 0, wsum = 0;
      for (let k = c - half + 1; k <= c + half; k++) {
        if (k < 0 || k >= x.length) continue;
        const d = Math.abs(t - k) * TABLE, di = Math.floor(d), fr = d - di;
        if (di + 1 >= tlen) continue;
        const wv = table[di] + (table[di + 1] - table[di]) * fr;
        acc += x[k] * wv; wsum += wv;
      }
      y[n] = wsum > 0 ? acc / wsum : 0;
    }
    return y;
  }
  D.resample = resample;
  /** Biquad RBJ (une passe). type : 'lp' | 'hp' | 'bp'. */
  function biquad(x, fs, type, fc, q) {
    q = q || Math.SQRT1_2;
    const w0 = 2 * Math.PI * Math.min(fc, 0.49 * fs) / fs, cs = Math.cos(w0), al = Math.sin(w0) / (2 * q);
    let b0, b1, b2;
    if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; }
    else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; }
    else { b0 = al; b1 = 0; b2 = -al; }
    const a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al;
    const y = new Float32Array(x.length);
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
      x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v;
    }
    return y;
  }
  D.biquad = biquad;
  /** Filtrage aller-retour (phase nulle) : les instants ne sont pas décalés. */
  function filtfilt(x, fs, type, fc, q) {
    const y = biquad(x, fs, type, fc, q);
    y.reverse();
    const z = biquad(y, fs, type, fc, q);
    return z.reverse();
  }
  D.filtfilt = filtfilt;
  /** Enveloppe d'énergie (moyenne de x² par cases de `binMs` ms). */
  function energyEnv(x, fs, binMs) {
    const L = Math.max(1, Math.round(fs * binMs / 1000)), n = Math.floor(x.length / L), e = new Float32Array(n);
    for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < L; j++) { const v = x[i * L + j]; s += v * v; } e[i] = s / L; }
    return e;
  }
  D.energyEnv = energyEnv;

  /* ---------------------------------------------------------------- préparation d'une prise */
  /**
   * Mise à la fréquence d'analyse, retrait du continu, contrôle du niveau.
   * @returns {x, fs, peakDb, clip, level}
   */
  D.prepare = function (pcm, sr) {
    let pk = 0, clipN = 0;
    for (let i = 0; i < pcm.length; i++) { const a = Math.abs(pcm[i]); if (a > pk) pk = a; if (a > 0.985) clipN++; }
    const x = sr === FS ? Float32Array.from(pcm) : resample(pcm, sr, FS);
    let m = 0; for (let i = 0; i < x.length; i++) m += x[i]; m /= Math.max(1, x.length);
    for (let i = 0; i < x.length; i++) x[i] -= m;
    return { x, fs: FS, peakDb: 20 * Math.log10(pk + 1e-9), clip: clipN / Math.max(1, pcm.length) };
  };
  /** Bruit de fond et niveau du jeu (énergie par 50 ms : 10e et 95e centiles), en dB. */
  D.levels = function (x) {
    const e = energyEnv(x, FS, 50);
    const lo = percentile(e, 0.1), hi = percentile(e, 0.95);
    return { noiseDb: dB(lo), playDb: dB(hi), snr: dB(hi) - dB(lo) };
  };
  /** Problèmes d'enregistrement : rien entendu, saturation, pièce bruyante. */
  D.issues = function (prep, lv) {
    const out = [];
    if (prep.peakDb < -42 || lv.playDb < -60) out.push('silence');
    if (prep.clip > 0.002) out.push('clip');
    if (lv.snr < 14 && !out.includes('silence')) out.push('noise');
    return out;
  };

  /* ---------------------------------------------------------------- attaques (onsets) */
  /** Spectrogramme d'amplitude limité à fmax : {mags[t][k], n, hop, nb, frames}. Le cadre t est centré sur (t·hop + n/2)/FS. */
  D.stft = function (x, n, hop, fmax) {
    const w = hann(n), df = FS / n, nb = Math.min(n >> 1, Math.ceil((fmax || FS / 2) / df) + 2);
    const frames = Math.max(0, Math.floor((x.length - n) / hop) + 1);
    const mags = new Array(frames), re = new Float64Array(n), im = new Float64Array(n);
    for (let t = 0; t < frames; t++) {
      const off = t * hop;
      for (let i = 0; i < n; i++) { re[i] = x[off + i] * w[i]; im[i] = 0; }
      fft(re, im, false);
      const m = new Float32Array(nb);
      for (let k = 0; k < nb; k++) m[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
      mags[t] = m;
    }
    return { mags, n, hop, nb, frames, df };
  };
  /**
   * Fonction de détection SuperFlux : différence positive du log-spectre avec le cadre μ précédent
   * élargi par un filtre maximum sur 3 bandes (ignore les petites variations de hauteur).
   * Bande 70 Hz – 5 kHz : les clics du métronome (> 6,5 kHz) n'y figurent pas.
   */
  D.odf = function (S, fmin, fmax, scale) {
    const k0 = Math.max(1, Math.floor(fmin / S.df)), k1 = Math.min(S.nb - 2, Math.ceil(fmax / S.df));
    const lam = scale || 1;
    const L = S.mags.map(m => { const o = new Float32Array(k1 + 2); for (let k = k0 - 1; k <= k1 + 1; k++) o[k] = Math.log10(1 + lam * m[k]); return o; });
    const mu = Math.max(1, Math.round((S.n / 4) / S.hop));
    const f = new Float32Array(S.frames);
    for (let t = mu; t < S.frames; t++) {
      const a = L[t], b = L[t - mu];
      let s = 0;
      for (let k = k0; k <= k1; k++) { const ref = Math.max(b[k - 1], b[k], b[k + 1]); const d = a[k] - ref; if (d > 0) s += d; }
      f[t] = s;
    }
    return { f, mu };
  };
  /**
   * Choix des crêtes : maximum local (10 ms avant, 50 ms après), au-dessus de la moyenne des 150 ms
   * précédentes plus un seuil, une seule attaque par fenêtre de `combine` secondes.
   */
  D.peaks = function (odf, hopSec, o) {
    o = o || {};
    const preMax = Math.max(1, Math.round(0.01 / hopSec)), postMax = Math.max(1, Math.round(0.05 / hopSec)), preAvg = Math.max(1, Math.round(0.15 / hopSec));
    const combine = o.combine != null ? o.combine : 0.05;
    const top = percentile(odf, 0.995) || 0;
    const delta = Math.max(o.minDelta != null ? o.minDelta : 0.5, (o.rel != null ? o.rel : 0.1) * top);
    const out = [];
    let last = -1e9;
    for (let t = 1; t < odf.length - 1; t++) {
      const v = odf[t];
      if (v <= 0) continue;
      let isMax = true;
      for (let j = Math.max(0, t - preMax); j <= Math.min(odf.length - 1, t + postMax); j++) if (odf[j] > v || (odf[j] === v && j < t)) { isMax = false; break; }
      if (!isMax) continue;
      let avg = 0, na = 0;
      for (let j = Math.max(0, t - preAvg); j < t; j++) { avg += odf[j]; na++; }
      avg = na ? avg / na : 0;
      if (v < avg + delta) continue;
      if ((t - last) * hopSec < combine) { if (out.length && v > out[out.length - 1].v) { out[out.length - 1] = { t, v }; last = t; } continue; }
      out.push({ t, v }); last = t;
    }
    return out;
  };
  /**
   * Instant précis d'une attaque : sur l'enveloppe à 1 ms de la bande aiguë (1,5–6 kHz, où le médiator et les
   * harmoniques fraîches marquent nettement chaque coup, même sur des cordes qui sonnent encore), on prend le
   * maximum local puis l'instant où le log de l'énergie a fait 20 % du chemin entre le niveau d'avant et ce maximum.
   */
  function refineOnset(le, tGuess) {
    const a = Math.max(46, Math.floor((tGuess - 0.035) * 1000)), b = Math.min(le.length - 3, Math.ceil((tGuess + 0.035) * 1000));
    if (b <= a) return tGuess;
    let p = a; for (let i = a; i <= b; i++) if (le[i] > le[p]) p = i;
    const base = []; for (let i = Math.max(0, p - 45); i <= p - 12; i++) base.push(le[i]);
    const bl = median(base), thr = bl + 0.2 * (le[p] - bl);
    let i = p; while (i > p - 40 && le[i - 1] >= thr) i--;
    const d = le[i] - le[i - 1], fr = d > 0 ? clamp((le[i] - thr) / d, 0, 1) : 0;
    return (i - fr) / 1000 - D.ONSET_OFFSET;
  }
  // décalage moyen entre cet instant et le début réel d'un coup (première corde) — étalonné sur la guitare de synthèse
  D.ONSET_OFFSET = 0.010;
  /** Fonction de détection SuperFlux sur une bande, moyenne par case. */
  function bandOdf(xb, n, hop, f0, f1) {
    const S = D.stft(xb, n, hop, f1 + 200);
    const k0 = Math.max(1, Math.floor(f0 / S.df)), k1 = Math.min(S.nb - 2, Math.ceil(f1 / S.df));
    const L = S.mags.map(m => { const o = new Float32Array(k1 + 2); for (let k = k0 - 1; k <= k1 + 1; k++) o[k] = Math.log10(1 + 100 * m[k]); return o; });
    const mu = Math.max(1, Math.round((n / 4) / hop));
    const f = new Float32Array(S.frames);
    for (let t = mu; t < S.frames; t++) {
      const a = L[t], b = L[t - mu];
      let s = 0;
      for (let k = k0; k <= k1; k++) { const ref = Math.max(b[k - 1], b[k], b[k + 1]); const d = a[k] - ref; if (d > 0) s += d; }
      f[t] = s / (k1 - k0 + 1);
    }
    return f;
  }
  /**
   * Attaques d'une prise : [{t (s), v (force), lvl (dB, énergie 0–40 ms)}].
   * Détection sur la bande 1,5–6 kHz (les clics du métronome, au-dessus de 6,5 kHz, n'y figurent pas).
   * o : {hop (s), rel (seuil relatif), combine (s)}
   */
  D.onsets = function (x, o) {
    o = o || {};
    const hop = Math.round((o.hop || 0.005) * FS), n = 1024;
    const band = filtfilt(filtfilt(x, FS, 'hp', 75), FS, 'lp', 6000);
    // normalisation : 99,5e centile de l'amplitude dans la bande de la guitare
    const absS = []; for (let i = 0; i < band.length; i += 7) absS.push(Math.abs(band[i]));
    const ref = percentile(absS, 0.995) || 1e-6, g = 0.5 / ref;
    const xb = new Float32Array(band.length); for (let i = 0; i < band.length; i++) xb[i] = band[i] * g;
    const f = bandOdf(xb, n, hop, 1500, 6000);
    // seuil robuste : au-dessus du bruit de la fonction de détection (médiane + 6 écarts robustes)
    const fMed = median(f), fSig = 1.4826 * (mad(f) || 1e-6);
    const pk = D.peaks(f, hop / FS, { minDelta: fMed + (o.k != null ? o.k : 6) * fSig, rel: o.rel != null ? o.rel : 0.06, combine: o.combine });
    const hf = energyEnv(filtfilt(xb, FS, 'hp', 1500), FS, 1);
    const le = new Float32Array(hf.length);
    for (let i = 1; i < hf.length - 1; i++) le[i] = Math.log10(1e-12 + (hf[i - 1] + 2 * hf[i] + hf[i + 1]) / 4);
    const env = energyEnv(xb, FS, 1);
    const out = [];
    for (const p of pk) {
      const t = refineOnset(le, (p.t * hop + n / 2) / FS);
      let e = 0; const i0 = Math.max(0, Math.round(t * 1000));
      for (let i = i0; i < Math.min(env.length, i0 + 40); i++) e += env[i];
      out.push({ t, v: p.v, lvl: dB(e / 40) });
    }
    out.sort((a, b) => a.t - b.t);
    const merged = [];
    for (const on of out) { const prev = merged[merged.length - 1]; if (prev && on.t - prev.t < (o.combine != null ? o.combine : 0.05)) { if (on.v > prev.v) merged[merged.length - 1] = on; } else merged.push(on); }
    return { list: merged, odf: f, hop: hop / FS, xb, env, le, gain: g, n, fMed, fSig };
  };
  /**
   * Recherche guidée : un coup attendu vers t (s) que la détection aveugle n'a pas retenu (coup léger, pièce
   * bruyante) — maximum local de la fonction de détection dans ±win, au-dessus de médiane + 4 écarts robustes.
   */
  D.guidedOnset = function (on, t, win) {
    const f = on.odf, hop = on.hop, c0 = on.n / 2 / FS;
    const a = Math.max(1, Math.floor((t - win - c0) / hop)), b = Math.min(f.length - 2, Math.ceil((t + win - c0) / hop));
    let bi = -1, bv = on.fMed + 4 * on.fSig;
    for (let i = a; i <= b; i++) if (f[i] > bv && f[i] >= f[i - 1] && f[i] >= f[i + 1]) { bv = f[i]; bi = i; }
    if (bi < 0) return null;
    const tt = refineOnset(on.le, bi * hop + c0);
    let e = 0; const i0 = Math.max(0, Math.round(tt * 1000));
    for (let i = i0; i < Math.min(on.env.length, i0 + 40); i++) e += on.env[i];
    return { t: tt, v: bv, lvl: dB(e / 40), guided: true };
  };

  /* ---------------------------------------------------------------- clics du métronome et latence */
  /** Enveloppe à 1 ms de la bande des clics (> 6,5 kHz). */
  D.clickEnv = function (x) {
    let y = filtfilt(x, FS, 'hp', 6500);
    y = filtfilt(y, FS, 'hp', 6500);
    return energyEnv(y, FS, 1);
  };
  /**
   * Latence aller-retour (sortie + entrée) mesurée sur les clics enregistrés : pour chaque clic programmé
   * à t (s, depuis le début de la prise), on cherche une attaque nette dans la bande aiguë entre t et t + 450 ms.
   * Les clics du décompte (sans jeu) sont les plus sûrs. @returns {latency (s), n, spread (ms)} ou null.
   */
  D.measureLatency = function (x, clickTimes, o) {
    o = o || {};
    const env = D.clickEnv(x);
    const lo = o.lo != null ? o.lo : 0.0, hi = o.hi != null ? o.hi : 0.45;
    const floor = percentile(env, 0.5) + 1e-12;
    const cands = [];
    for (const t of clickTimes) {
      const a = Math.max(1, Math.floor((t + lo) * 1000)), b = Math.min(env.length - 2, Math.ceil((t + hi) * 1000));
      if (b <= a) continue;
      let pk = 0, pi = -1;
      for (let i = a; i <= b; i++) if (env[i] > pk) { pk = env[i]; pi = i; }
      if (pi < 0 || pk < floor * 30) continue;
      // début du clic : premier passage au-dessus de 25 % de la crête, en remontant depuis la crête
      let s = pi; while (s > a && env[s - 1] > 0.25 * pk) s--;
      // un clic est bref : l'énergie retombe sous 20 % de la crête en moins de 25 ms
      let e = pi; while (e < Math.min(env.length - 1, pi + 40) && env[e] > 0.2 * pk) e++;
      if (e - pi > 25) continue;
      cands.push({ lat: s / 1000 - t, pk });
    }
    if (cands.length < 2) return null;
    const lats = cands.map(c => c.lat), m = median(lats);
    const good = cands.filter(c => Math.abs(c.lat - m) < 0.006);
    if (good.length < Math.max(2, Math.ceil(cands.length * 0.5))) return null;
    return { latency: median(good.map(c => c.lat)), n: good.length, spread: 1000 * (mad(good.map(c => c.lat)) || 0) };
  };

  /* ---------------------------------------------------------------- spectre en demi-tons et notes */
  const MIDI_LO = 36, MIDI_HI = 100, NS = MIDI_HI - MIDI_LO + 1;
  const hz = (m, a4) => (a4 || 440) * Math.pow(2, (m - 69) / 12);
  /** Spectre « en demi-tons » : amplitude max dans ±50 cents de chaque note (MIDI 36–100). */
  function semitoneSpectrum(mag, nfft, a4) {
    const df = FS / nfft, out = new Float64Array(NS);
    for (let i = 0; i < NS; i++) {
      const m = MIDI_LO + i, f0 = hz(m - 0.5, a4), f1 = hz(m + 0.5, a4);
      const k0 = Math.max(1, Math.floor(f0 / df)), k1 = Math.min(mag.length - 1, Math.ceil(f1 / df));
      let mx = 0;
      for (let k = k0; k <= k1; k++) if (mag[k] > mx) mx = mag[k];
      out[i] = mx;
    }
    return out;
  }
  D.semitoneSpectrum = semitoneSpectrum;
  // gabarits de notes : peignes d'harmoniques (amplitudes ~ 1/h^0,8 ; micro de téléphone : graves atténués)
  let templates = null;
  function noteTemplates() {
    if (templates) return templates;
    const H = 10, tpl = [];
    for (let n = 38; n <= 90; n++) {
      const t = new Float64Array(NS);
      for (let h = 1; h <= H; h++) {
        const m = n + 12 * Math.log2(h), i = m - MIDI_LO;
        if (i > NS - 1) break;
        const f = hz(n) * h, mic = f < 110 ? 0.45 : f < 160 ? 0.75 : 1;
        const a = mic / Math.pow(h, 0.8), lo = Math.floor(i), fr = i - lo;
        if (lo >= 0 && lo < NS) t[lo] += a * (1 - fr);
        if (lo + 1 < NS) t[lo + 1] += a * fr;
      }
      let s = 0; for (let i = 0; i < NS; i++) s += t[i] * t[i];
      s = Math.sqrt(s); for (let i = 0; i < NS; i++) t[i] /= s;
      tpl.push({ n, t });
    }
    templates = tpl;
    return tpl;
  }
  /**
   * Décomposition non négative (mises à jour multiplicatives) d'un spectre en demi-tons sur les gabarits de notes.
   * @returns Float64Array d'activations par note MIDI 38–90 (index n − 38)
   */
  function nnls(s, iters) {
    const tpl = noteTemplates(), K = tpl.length;
    const a = new Float64Array(K).fill(0.1), wts = new Float64Array(K);
    for (let k = 0; k < K; k++) { let v = 0; const t = tpl[k].t; for (let i = 0; i < NS; i++) v += t[i] * s[i]; wts[k] = v; }
    // Gram (WᵀW) une fois
    const G = new Float64Array(K * K);
    for (let p = 0; p < K; p++) for (let q = p; q < K; q++) { let v = 0; const tp = tpl[p].t, tq = tpl[q].t; for (let i = 0; i < NS; i++) v += tp[i] * tq[i]; G[p * K + q] = v; G[q * K + p] = v; }
    for (let it = 0; it < (iters || 120); it++) {
      for (let k = 0; k < K; k++) {
        let den = 1e-12; for (let q = 0; q < K; q++) den += G[k * K + q] * a[q];
        a[k] *= wts[k] / den;
      }
    }
    return a;
  }
  D.nnls = nnls;
  /**
   * Notes présentes dans une fenêtre [a, b) de la prise : spectre moyen → demi-tons → compression → NNLS.
   * @returns {act (Float64Array 38–90), chroma (12), energy}
   */
  D.notesIn = function (x, a, b, o) {
    o = o || {};
    const len = o.len || 4096, nfft = o.nfft || 8192;
    const spec = avgSpectrum(x, a, b, len, nfft);
    if (!spec) return null;
    const st = semitoneSpectrum(spec, nfft, o.a4);
    // compression douce (racine) : les notes faibles comptent, sans que le bruit domine
    const floor = percentile(st, 0.3);
    const s = new Float64Array(NS);
    let energy = 0;
    for (let i = 0; i < NS; i++) { const v = Math.max(0, st[i] - floor); s[i] = Math.sqrt(v); energy += v * v; }
    const act = nnls(s, o.iters);
    const chroma = new Float64Array(12);
    for (let k = 0; k < act.length; k++) chroma[(38 + k) % 12] += act[k];
    let cs = 0; for (let i = 0; i < 12; i++) cs += chroma[i];
    if (cs > 0) for (let i = 0; i < 12; i++) chroma[i] /= cs;
    return { act, chroma, energy, st };
  };
  /** Chroma attendu d'une forme : chaque classe de hauteur pondérée par le nombre de cordes qui la jouent. */
  D.voicingChroma = function (v) {
    const c = new Float64Array(12);
    T.voicingNotes(v).forEach(n => { if (n != null) c[n % 12] += 1; });
    let s = 0; for (let i = 0; i < 12; i++) s += c[i];
    for (let i = 0; i < 12; i++) c[i] /= s || 1;
    return c;
  };
  function cosine(a, b) {
    let ab = 0, aa = 0, bb = 0;
    for (let i = 0; i < a.length; i++) { const x = Math.sqrt(a[i]), y = Math.sqrt(b[i]); ab += x * y; aa += x * x; bb += y * y; }
    return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
  }
  D.cosine = cosine;
  /**
   * Quel accord a été joué ? Compare le chroma observé aux formes candidates.
   * @returns {best (id), sim: {id: similarité}, margin, foreign: [pc], missing: [pc]}
   */
  D.matchChord = function (notes, candidates) {
    if (!notes) return null;
    const sim = {};
    let best = null, bs = -1, second = -1;
    for (const v of candidates) {
      const s = cosine(notes.chroma, D.voicingChroma(v));
      sim[v.id] = s;
      if (s > bs) { second = bs; bs = s; best = v; } else if (s > second) second = s;
    }
    return { best: best ? best.id : null, score: bs, margin: bs - Math.max(0, second), sim };
  };
  /**
   * Diagnostic d'un accord attendu : notes étrangères (avec la cause la plus probable : corde à vide
   * au lieu d'une case appuyée, case voisine) et notes de l'accord qui manquent (avec les cordes concernées).
   */
  D.chordDiagnosis = function (notes, v) {
    const exp = D.voicingChroma(v), obs = notes.chroma;
    const pcsIn = new Set(T.voicingPcs(v));
    const foreign = [], missing = [];
    const maxObs = Math.max(...obs);
    for (let pc = 0; pc < 12; pc++) {
      if (!pcsIn.has(pc) && obs[pc] > Math.max(0.09, 0.32 * maxObs)) {
        // cause probable : une corde censée être appuyée sonne à vide, ou une case voisine
        const causes = [];
        v.frets.forEach((f, s) => {
          if (f > 0 && T.mod12(T.OPEN[s]) === pc) causes.push({ s, kind: 'open' });
          else if (f > 0 && (T.mod12(T.OPEN[s] + f + 1) === pc || T.mod12(T.OPEN[s] + f - 1) === pc)) causes.push({ s, kind: 'fret' });
          else if (f < 0 && T.mod12(T.OPEN[s]) === pc) causes.push({ s, kind: 'mute' });
        });
        foreign.push({ pc, w: obs[pc], causes });
      }
    }
    for (let pc = 0; pc < 12; pc++) {
      if (exp[pc] > 0 && obs[pc] < 0.22 * exp[pc] && obs[pc] < 0.05) {
        const strings = []; T.voicingNotes(v).forEach((n, s) => { if (n != null && n % 12 === pc) strings.push(s); });
        missing.push({ pc, strings });
      }
    }
    return { foreign, missing };
  };

  /* ---------------------------------------------------------------- caractéristiques d'un coup */
  /** Montée (dB) de l'énergie 70–1500 Hz juste après t (0–30 ms) par rapport à juste avant (−35 à −5 ms). */
  D.lowRise = function (xb, t) {
    const a = Math.round((t - 0.035) * FS), m = Math.round((t - 0.005) * FS), b = Math.round((t + 0.03) * FS);
    if (a < 0 || b > xb.length) return NaN;
    const seg = xb.subarray(a, b), lp = biquad(biquad(seg, FS, 'lp', 1500), FS, 'lp', 1500);
    let e1 = 0, e2 = 0;
    for (let i = 0; i < m - a; i++) e1 += lp[i] * lp[i];
    for (let i = m - a + Math.round(0.005 * FS); i < lp.length; i++) e2 += lp[i] * lp[i];
    return dB(e2 / (b - m - Math.round(0.005 * FS))) - dB(e1 / (m - a));
  };
  /**
   * Frappe étouffée (« chuck ») ou accord qui sonne ? Une frappe est un bruit bref : l'énergie s'effondre
   * en quelques dizaines de ms et le spectre reste plat (pas de pics de notes).
   * @returns {decay (dB, 45–90 ms vs 0–30 ms), flat (planéité 80 Hz–2 kHz), chuck: probabilité 0–1}
   */
  D.chuckFeatures = function (x, env1ms, t, nextT) {
    const i0 = Math.round(t * 1000), lim = isNum(nextT) ? Math.round(nextT * 1000) - 3 : i0 + 120;
    let e1 = 0, e2 = 0, n1 = 0, n2 = 0;
    for (let i = i0; i < Math.min(i0 + 30, env1ms.length); i++) { e1 += env1ms[i]; n1++; }
    for (let i = i0 + 45; i < Math.min(i0 + 90, lim, env1ms.length); i++) { e2 += env1ms[i]; n2++; }
    const decay = n2 >= 10 && n1 ? dB(e2 / n2) - dB(e1 / n1) : NaN;
    // planéité spectrale (géométrique / arithmétique) dans 80 Hz–2 kHz, sur 50 ms après l'attaque
    const a = Math.round((t + 0.008) * FS), len = 1024;
    let flat = NaN;
    if (a + len < x.length) {
      const m = magSpectrum(x, a, len, 2048), df = FS / 2048;
      let lg = 0, ar = 0, n = 0;
      for (let k = Math.round(80 / df); k <= Math.round(2000 / df); k++) { const p = m[k] * m[k] + 1e-12; lg += Math.log(p); ar += p; n++; }
      flat = Math.exp(lg / n) / (ar / n);
    }
    let z = 0;
    if (isNum(decay)) z += (-decay - 8) / 3;            // chute de plus de 8 dB en 45 ms : percussif
    if (isNum(flat)) z += (flat - 0.12) / 0.08;
    const p = 1 / (1 + Math.exp(-z));
    return { decay, flat, chuck: p };
  };

  /* ---------------------------------------------------------------- rythme */
  /**
   * Appariement des coups joués aux coups attendus (le plus proche d'abord, chacun une fois).
   * expected : [{t (s, dans la prise), k, i}] ; onsets : [{t}] ; win (s).
   * Dans les mesures sans clic (`free`), la grille suit le tempo réellement joué.
   */
  D.matchGrid = function (expected, onsets, win, o) {
    o = o || {};
    const pairs = [];
    const used = new Set(), done = new Set(), out = expected.map(() => null);
    // passe 1 : mesures avec clic (grille fixe)
    const fixed = expected.map((e, i) => ({ e, i })).filter(z => !z.e.free);
    for (const { e, i } of fixed) for (let j = 0; j < onsets.length; j++) { const d = onsets[j].t - e.t; if (Math.abs(d) <= win) pairs.push({ i, j, d }); }
    pairs.sort((a, b) => Math.abs(a.d) - Math.abs(b.d));
    for (const p of pairs) { if (done.has(p.i) || used.has(p.j)) continue; done.add(p.i); used.add(p.j); out[p.i] = { j: p.j, d: p.d }; }
    // passe 2 : mesures silencieuses (grille glissante : on suit la pulsation jouée)
    let lastI = -1, period = o.slot || 0.25, offset = 0;
    for (let i = 0; i < expected.length; i++) {
      const e = expected[i];
      if (!e.free) { if (out[i]) { offset = out[i].d; lastI = i; } continue; }
      const pred = e.t + offset;
      let bj = -1, bd = Infinity;
      for (let j = 0; j < onsets.length; j++) { if (used.has(j)) continue; const d = onsets[j].t - pred; if (Math.abs(d) <= win * 1.3 && Math.abs(d) < Math.abs(bd)) { bd = d; bj = j; } }
      if (bj >= 0) { used.add(bj); out[i] = { j: bj, d: onsets[bj].t - e.t, drift: true }; offset = 0.6 * offset + 0.4 * (onsets[bj].t - e.t); lastI = i; }
    }
    void lastI; void period;
    const extras = [];
    onsets.forEach((on, j) => { if (!used.has(j)) extras.push(j); });
    return { match: out, extras };
  };
  /**
   * Analyse d'une prise rythmée (pulsation, rythmique, changements en rythme, arpèges, chanson).
   * spec : {clicks:[t], cleanClicks, latency (a priori, s), events:[{t, k, chord, free, bar}],
   *         slot (s), tol (ms), segments:[{t0, t1, v}], vocab:[voicing], a4, minDelta}
   */
  D.analyzeRhythm = function (pcm, sr, spec) {
    const prep = D.prepare(pcm, sr), x = prep.x, lv = D.levels(x);
    const issues = D.issues(prep, lv);
    const res = { ok: !issues.includes('silence'), issues, snr: +lv.snr.toFixed(1), level: +lv.playDb.toFixed(1) };
    // latence : clics du décompte d'abord, sinon tous les clics, sinon l'a priori
    let lat = null;
    if (spec.clicks && spec.clicks.length) {
      const clean = spec.clicks.slice(0, spec.cleanClicks || 0);
      lat = clean.length >= 2 ? D.measureLatency(x, clean) : null;
      if (!lat) lat = D.measureLatency(x, spec.clicks);
    }
    res.latency = lat ? lat.latency : (isNum(spec.latency) ? spec.latency : 0.1);
    res.latencySrc = lat ? 'mesurée' : 'estimée';
    if (!res.ok) return res;
    const on = D.onsets(x, { minDelta: spec.minDelta, rel: spec.rel, combine: spec.combine });
    const L = res.latency;
    const exp = spec.events.map((e, i) => ({ t: e.t + L, k: e.k, i, free: !!e.free, chord: e.chord, bar: e.bar }));
    const t0 = exp.length ? exp[0].t - Math.max(0.12, (spec.slot || 0.25)) : 0;
    const t1 = exp.length ? exp[exp.length - 1].t + Math.max(0.25, 2 * (spec.slot || 0.25)) : Infinity;
    const ons = on.list.filter(o => o.t >= t0 && o.t <= t1);
    const win = Math.min(0.45 * (spec.slot || 0.25), 0.14);
    const g = D.matchGrid(exp, ons, win, { slot: spec.slot });
    // coups attendus non trouvés : recherche guidée autour de l'instant attendu (ou prévu par la dérive)
    exp.forEach((e, i) => {
      if (g.match[i]) return;
      let pred = e.t;
      if (e.free) { const prev = g.match.slice(0, i).reverse().find(Boolean); if (prev) pred += prev.d; }
      const go = D.guidedOnset(on, pred, win);
      if (!go || ons.some(o3 => Math.abs(o3.t - go.t) < 0.04)) return;
      ons.push(go);
      g.match[i] = { j: ons.length - 1, d: go.t - e.t, drift: e.free };
    });
    res.events = exp.map((e, i) => {
      const m = g.match[i];
      if (!m) return { i, k: e.k, t: e.t - L, hit: false, free: e.free };
      const o2 = ons[m.j], next = ons.filter(z => z.t > o2.t + 0.03)[0];
      const ch = D.chuckFeatures(on.xb, on.env, o2.t, next ? next.t : null);
      return { i, k: e.k, t: e.t - L, hit: true, err: +(1000 * m.d).toFixed(1), free: e.free, drift: !!m.drift, lvl: o2.lvl, v: o2.v, chuck: +ch.chuck.toFixed(2) };
    });
    // coups en trop : attaques franches (≥ 30 % de la force médiane des coups joués) non appariées
    const vMed = median(res.events.filter(e => e.hit).map(e => e.v));
    const clickAt = (spec.clicks || []).map(c => c + L);
    res.extras = g.extras.map(j => ons[j]).filter(o2 => {
      if (!(o2.v >= 0.3 * (vMed || 0))) return false;
      // un clic du métronome qui déborde dans la bande d'analyse : pas d'énergie grave nouvelle
      if (clickAt.some(c => Math.abs(c - o2.t) < 0.012)) { const lf = D.lowRise(on.xb, o2.t); if (!(lf > 2)) return false; }
      return true;
    }).map(o2 => ({ t: o2.t - L, lvl: o2.lvl }));
    const hits = res.events.filter(e => e.hit);
    const clicked = hits.filter(e => !e.free);
    res.hitRate = exp.length ? hits.length / exp.length : 0;
    res.mean = clicked.length ? mean(clicked.map(e => e.err)) : NaN;
    res.sd = clicked.length > 2 ? std(clicked.map(e => e.err)) : NaN;
    res.mae = clicked.length ? mean(clicked.map(e => Math.abs(e.err))) : NaN;
    // frappes étouffées attendues (X) : reconnues comme percussives ? coups normaux pris pour des frappes ?
    const xs = hits.filter(e => e.k === 'X'), ds = hits.filter(e => e.k === 'D' || e.k === 'U');
    res.chuckOk = xs.length ? xs.filter(e => e.chuck >= 0.5).length / xs.length : null;
    res.chuckFalse = xs.length && ds.length ? ds.filter(e => e.chuck >= 0.5).length / ds.length : null;
    // mesures sans clic : tempo réellement tenu et dérive
    const fr = hits.filter(e => e.free);
    if (fr.length >= 4) {
      const xsF = fr.map(e => e.t), ysF = fr.map(e => e.err / 1000);
      const mx = mean(xsF), my = mean(ysF);
      let sxy = 0, sxx = 0; xsF.forEach((v, i) => { sxy += (v - mx) * (ysF[i] - my); sxx += (v - mx) * (v - mx); });
      const slope = sxx > 0 ? sxy / sxx : 0;              // s de retard par s : <0 = on accélère
      res.drift = { slope, tempoRatio: 1 / (1 + slope), endErr: fr[fr.length - 1].err, n: fr.length, ioiSd: NaN };
      const iois = []; for (let i = 1; i < fr.length; i++) { const de = fr[i].t - fr[i - 1].t; if (de > 0) iois.push((fr[i].err - fr[i - 1].err)); }
      res.drift.ioiSd = iois.length > 2 ? std(iois) : NaN;
    }
    // accords par segment (mesure) : spectre moyen hors attaques
    if (spec.segments && spec.segments.length) {
      const cands = (spec.vocab && spec.vocab.length ? spec.vocab : []).slice();
      res.chords = spec.segments.map(sg => {
        const a = (sg.t0 + L + 0.04) * FS, b = (sg.t1 + L - 0.01) * FS;
        const notes = D.notesIn(x, a, b, { a4: spec.a4 });
        const v = T.voicing(sg.v);
        if (!notes || !v) return { v: sg.v, ok: null };
        const list = cands.some(c => c.id === v.id) ? cands : cands.concat([v]);
        const m = D.matchChord(notes, list);
        const simExp = m.sim[v.id];
        const ok = simExp >= 0.78 && (m.best === v.id || simExp >= m.score - 0.015);
        return { v: sg.v, ok, sim: +simExp.toFixed(3), heard: m.best, diag: ok ? null : D.chordDiagnosis(notes, v) };
      });
    }
    return res;
  };

  /* ---------------------------------------------------------------- changements libres (minute) */
  /**
   * Changements en une minute : chaque coup doit être l'accord suivant de l'alternance A, B, A, B…
   * spec : {a, b (ids de formes), t0, t1 (s, fenêtre utile), a4}
   * @returns {strums:[{t, chord: 'a'|'b'|null, sim}], changes (propres), cpm, unclear, repeats}
   */
  D.analyzeChanges = function (pcm, sr, spec) {
    const prep = D.prepare(pcm, sr), x = prep.x, lv = D.levels(x);
    const issues = D.issues(prep, lv);
    const res = { ok: !issues.includes('silence'), issues, snr: +lv.snr.toFixed(1) };
    if (!res.ok) return Object.assign(res, { strums: [], changes: 0, cpm: 0 });
    const va = T.voicing(spec.a), vb = T.voicing(spec.b);
    const on = D.onsets(x, { hop: 0.008, combine: 0.12, rel: 0.12 });
    const ons = on.list.filter(o => o.t >= (spec.t0 || 0) && o.t <= (spec.t1 || Infinity));
    const ca = D.voicingChroma(va), cb = D.voicingChroma(vb);
    res.strums = ons.map((o, i) => {
      const next = ons[i + 1];
      const a = (o.t + 0.04) * FS, b = Math.min(x.length, ((next ? next.t : o.t + 0.6) - 0.01) * FS, (o.t + 0.7) * FS);
      const notes = D.notesIn(x, a, b, { len: 2048, nfft: 8192, a4: spec.a4 });
      if (!notes) return { t: o.t, chord: null };
      const sa = cosine(notes.chroma, ca), sb = cosine(notes.chroma, cb);
      const best = Math.max(sa, sb);
      const chord = best >= 0.74 && Math.abs(sa - sb) >= 0.025 ? (sa > sb ? 'a' : 'b') : null;
      return { t: o.t, chord, sa: +sa.toFixed(3), sb: +sb.toFixed(3) };
    });
    // compte : un changement propre = un coup reconnu dont l'accord diffère du dernier reconnu
    let last = null, changes = 0, unclear = 0, repeats = 0;
    for (const s of res.strums) {
      if (!s.chord) { unclear++; continue; }
      if (last && s.chord !== last) changes++;
      else if (last && s.chord === last) repeats++;
      last = s.chord;
    }
    const dur = Math.max(1, (spec.t1 || x.length / FS) - (spec.t0 || 0));
    Object.assign(res, { changes, unclear, repeats, cpm: changes * 60 / dur, dur });
    return res;
  };

  /* ---------------------------------------------------------------- accords de mémoire (chrono) */
  /**
   * spec : {cues:[{t, v, limit}], latency, vocab:[voicing], a4} — pour chaque signal, premier coup franc
   * après le signal : bon accord ? en combien de temps ?
   */
  D.analyzeCues = function (pcm, sr, spec) {
    const prep = D.prepare(pcm, sr), x = prep.x, lv = D.levels(x);
    const issues = D.issues(prep, lv);
    const res = { ok: !issues.includes('silence'), issues, snr: +lv.snr.toFixed(1) };
    if (!res.ok) return res;
    const L = isNum(spec.latency) ? spec.latency : 0.1;
    let lat = spec.clicks ? D.measureLatency(x, spec.clicks) : null;
    const lt = lat ? lat.latency : L;
    const on = D.onsets(x, { hop: 0.006, combine: 0.1 });
    res.cues = spec.cues.map((c, ci) => {
      const t = c.t + lt, nextCue = spec.cues[ci + 1] ? spec.cues[ci + 1].t + lt : x.length / FS;
      const o = on.list.find(z => z.t > t + 0.12 && z.t < Math.min(nextCue, t + c.limit + 1.2));
      if (!o) return { v: c.v, hit: false };
      const after = on.list.find(z => z.t > o.t + 0.08);
      const notes = D.notesIn(x, (o.t + 0.04) * FS, Math.min((after ? after.t : o.t + 0.7) - 0.01, o.t + 0.7) * FS, { len: 2048, nfft: 8192, a4: spec.a4 });
      const v = T.voicing(c.v);
      const list = (spec.vocab || []).some(z => z.id === v.id) ? spec.vocab : (spec.vocab || []).concat([v]);
      const m = notes ? D.matchChord(notes, list) : null;
      const sim = m ? m.sim[v.id] : 0;
      const ok = !!m && sim >= 0.78 && (m.best === v.id || sim >= m.score - 0.015);
      return { v: c.v, hit: true, rt: +(o.t - t).toFixed(3), ok, inTime: o.t - t <= c.limit, heard: m ? m.best : null, sim: +sim.toFixed(3), diag: !ok && notes ? D.chordDiagnosis(notes, v) : null };
    });
    return res;
  };

  /* ---------------------------------------------------------------- corde par corde */
  /**
   * L'élève joue chaque corde de l'accord, de la plus grave à la plus aiguë. Pour chaque attaque :
   * la note nouvelle (spectre après − spectre avant, pour ignorer les cordes qui sonnent encore),
   * sa hauteur, sa tenue (étouffée ?) et le bruit entre harmoniques (frise ?).
   * spec : {v (id), a4}
   * @returns {strings:[{s, exp, got, cents, status: ok|muted|wrong|missing|buzz, sustain}], clean}
   */
  D.analyzePlucks = function (pcm, sr, spec) {
    const prep = D.prepare(pcm, sr), x = prep.x, lv = D.levels(x);
    const issues = D.issues(prep, lv);
    const v = T.voicing(spec.v), a4 = spec.a4 || 440;
    const res = { ok: !issues.includes('silence'), issues, snr: +lv.snr.toFixed(1) };
    if (!res.ok || !v) return Object.assign(res, { strings: [] });
    const exp = T.sounding(v).map(s => ({ s, n: T.OPEN[s] + v.frets[s] }));
    const on = D.onsets(x, { hop: 0.005, combine: 0.09, rel: 0.06, minDelta: 0.35 });
    let ons = on.list.slice();
    // une note par attaque : hauteur dominante de l'énergie nouvelle
    const nfft = 8192, len = 2048;
    const info = ons.map((o, i) => {
      const next = ons[i + 1];
      const a = Math.round((o.t + 0.03) * FS), b = Math.round(Math.min(next ? next.t - 0.005 : o.t + 0.8, o.t + 0.8) * FS);
      const post = avgSpectrum(x, a, Math.min(b, a + 3 * len), len, nfft);
      const pa = Math.round((o.t - 0.005) * FS) - len;
      const pre = pa >= 0 ? magSpectrum(x, pa, len, nfft) : null;
      if (!post) return null;
      const nw = new Float64Array(post.length);
      for (let k = 0; k < post.length; k++) nw[k] = Math.max(0, post[k] - (pre ? 1.05 * pre[k] : 0));
      const st = semitoneSpectrum(nw, nfft, a4);
      const s2 = new Float64Array(st.length); for (let k = 0; k < st.length; k++) s2[k] = Math.sqrt(st[k]);
      const act = nnls(s2, 80);
      let e = 0; for (let k = 0; k < nw.length; k++) e += nw[k] * nw[k];
      return { o, act, e, nw };
    });
    // alignement attaques ↔ cordes attendues (ordre conservé ; attaques en trop ignorées ; manquantes signalées)
    const score = (inf, n) => {
      if (!inf) return 0;
      const ax = k => inf.act[k - 38] || 0;
      let tot = 0; for (let k = 0; k < inf.act.length; k++) tot += inf.act[k];
      const near = Math.max(ax(n), ax(n + 12) * 0.8, ax(n - 12) * 0.8);
      return tot > 0 ? near / tot : 0;
    };
    const N = info.length, M = exp.length;
    // programmation dynamique : coût = −score ; sauter une attaque = 0,15 ; manquer une corde = 0,6
    const dp = [], bk = [];
    for (let i = 0; i <= N; i++) { dp.push(new Array(M + 1).fill(Infinity)); bk.push(new Array(M + 1).fill(null)); }
    dp[0][0] = 0;
    for (let i = 0; i <= N; i++) for (let j = 0; j <= M; j++) {
      const c = dp[i][j]; if (!isFinite(c)) continue;
      if (i < N && j < M) { const sc = 1 - score(info[i], exp[j].n) - 0.15; if (c + sc < dp[i + 1][j + 1]) { dp[i + 1][j + 1] = c + sc; bk[i + 1][j + 1] = 'm'; } }
      if (i < N) { const cc = c + 0.3 + (info[i] ? 0 : -0.25); if (cc < dp[i + 1][j]) { dp[i + 1][j] = cc; bk[i + 1][j] = 'x'; } }
      if (j < M) { if (c + 0.9 < dp[i][j + 1]) { dp[i][j + 1] = c + 0.9; bk[i][j + 1] = 'g'; } }
    }
    const assign = new Array(M).fill(null);
    let i = N, j = M;
    while (i > 0 || j > 0) { const b = bk[i][j]; if (b === 'm') { assign[j - 1] = i - 1; i--; j--; } else if (b === 'x') i--; else if (b === 'g') j--; else break; }
    const energies = assign.filter(k => k != null && info[k]).map(k => info[k].e);
    const eMed = median(energies);
    res.strings = exp.map((e, jj) => {
      const k = assign[jj];
      if (k == null || !info[k]) return { s: e.s, exp: e.n, status: 'missing' };
      const inf = info[k], ax = n => inf.act[n - 38] || 0;
      let tot = 0; for (let q = 0; q < inf.act.length; q++) tot += inf.act[q];
      // note jouée : la plus forte parmi la note attendue, ses voisines et ses octaves
      let got = e.n, gv = -1;
      for (let d = -3; d <= 3; d++) for (const oc of [0, 12, -12]) { const n = e.n + d + oc; if (n < 38 || n > 90) continue; const w = ax(n) * (oc ? 0.75 : 1); if (w > gv) { gv = w; got = n - oc; } }
      const share = tot > 0 ? gv / tot : 0;
      // hauteur fine : pic du 1er ou 2e harmonique dans le spectre nouveau
      const cents = fineCents(inf.nw, nfft, hz(got, a4), a4);
      // tenue : énergie de la note 250–400 ms vs 40–110 ms (si la corde suivante ne vient pas trop vite)
      const nextOn = ons[k + 1] ? ons[k + 1].t : Infinity;
      const sus = sustainDb(x, inf.o.t, nextOn, hz(got, a4));
      let status = 'ok';
      if (inf.e < 0.04 * eMed || share < 0.12) status = 'muted';
      else if (got !== e.n) status = 'wrong';
      else if (isNum(sus) && sus < -24) status = 'muted';
      return { s: e.s, exp: e.n, got, cents: isNum(cents) ? Math.round(cents) : null, share: +share.toFixed(2), sustain: isNum(sus) ? +sus.toFixed(1) : null, status, t: +inf.o.t.toFixed(3) };
    });
    // frise : bruit hors harmoniques 1,5–5 kHz nettement au-dessus de la médiane de la prise
    const buzz = res.strings.map(st => (st.status === 'ok' ? buzzIndex(x, st.t, hz(st.got, a4)) : NaN));
    const bMed = median(buzz.filter(isNum));
    res.strings.forEach((st, q) => { if (st.status === 'ok' && isNum(buzz[q]) && buzz[q] > Math.max(0.06, 3 * bMed)) { st.status = 'buzz'; st.buzz = +buzz[q].toFixed(3); } });
    res.clean = res.strings.length > 0 && res.strings.every(st => st.status === 'ok');
    res.nOk = res.strings.filter(st => st.status === 'ok').length;
    return res;
  };
  function fineCents(mag, nfft, f, a4) {
    const df = FS / nfft;
    let best = NaN, bv = 0;
    for (const h of [1, 2, 3]) {
      const fh = f * h, k0 = Math.max(2, Math.floor(fh * Math.pow(2, -0.6 / 12) / df)), k1 = Math.min(mag.length - 2, Math.ceil(fh * Math.pow(2, 0.6 / 12) / df));
      let kk = -1, mv = 0; for (let k = k0; k <= k1; k++) if (mag[k] > mv) { mv = mag[k]; kk = k; }
      if (kk < 0 || mv <= bv) continue;
      const a = Math.log(mag[kk - 1] + 1e-12), b = Math.log(mag[kk] + 1e-12), c = Math.log(mag[kk + 1] + 1e-12);
      const dl = (a - c) / (2 * (a - 2 * b + c) || 1);
      const fr = (kk + clamp(dl, -0.5, 0.5)) * df / h;
      bv = mv; best = 1200 * Math.log2(fr / f);
    }
    void a4;
    return best;
  }
  function harmonicEnergy(x, a, len, f, nfft) {
    if (a < 0 || a + len > x.length) return NaN;
    const m = magSpectrum(x, a, len, nfft), df = FS / nfft;
    let e = 0;
    for (let h = 1; h <= 4; h++) { const k = Math.round(f * h / df); for (let q = k - 2; q <= k + 2; q++) if (q > 0 && q < m.length) e += m[q] * m[q]; }
    return e;
  }
  function sustainDb(x, t, nextT, f) {
    const late = Math.min(t + 0.4, nextT - 0.01);
    if (late - t < 0.2) return NaN;
    const len = 1024;
    const e1 = harmonicEnergy(x, Math.round((t + 0.04) * FS), len, f, 4096);
    const e2 = harmonicEnergy(x, Math.round(late * FS) - len, len, f, 4096);
    return isNum(e1) && isNum(e2) ? dB(e2) - dB(e1) : NaN;
  }
  function buzzIndex(x, t, f) {
    const a = Math.round((t + 0.05) * FS), len = 2048;
    if (a + len > x.length) return NaN;
    const m = magSpectrum(x, a, len, 4096), df = FS / 4096;
    let harm = 0, res = 0;
    for (let k = Math.round(1500 / df); k <= Math.round(5000 / df); k++) {
      const h = k * df / f, dist = Math.abs(h - Math.round(h)) * f / df;
      if (dist <= 2.5) harm += m[k] * m[k]; else res += m[k] * m[k];
    }
    let low = 0; for (let k = Math.round(f * 0.8 / df); k <= Math.round(f * 4.2 / df); k++) low += m[k] * m[k];
    return res / Math.max(1e-12, harm + low);
  }

  /* ---------------------------------------------------------------- hauteur (YIN) */
  /**
   * YIN sur une trame (n'importe quelle fréquence d'échantillonnage). fmin–fmax en Hz.
   * @returns {f0, ap (apériodicité 0–1)} ou {f0: NaN}
   */
  D.yin = function (frame, sr, fmin, fmax, thr) {
    fmin = fmin || 60; fmax = fmax || 1000; thr = thr || 0.12;
    const tauMin = Math.max(2, Math.floor(sr / fmax)), tauMax = Math.min(Math.floor(sr / fmin), (frame.length >> 1) - 2);
    const W = frame.length - tauMax - 1;
    if (W < tauMin * 2) return { f0: NaN, ap: 1 };
    const d = new Float64Array(tauMax + 2);
    for (let tau = 1; tau <= tauMax + 1; tau++) { let s = 0; for (let i = 0; i < W; i++) { const v = frame[i] - frame[i + tau]; s += v * v; } d[tau] = s; }
    const cm = new Float64Array(tauMax + 2); cm[0] = 1;
    let run = 0;
    for (let tau = 1; tau <= tauMax + 1; tau++) { run += d[tau]; cm[tau] = run > 0 ? d[tau] * tau / run : 1; }
    let tau = -1;
    for (let t = tauMin; t <= tauMax; t++) {
      if (cm[t] < thr) { while (t + 1 <= tauMax && cm[t + 1] < cm[t]) t++; tau = t; break; }
    }
    if (tau < 0) { let mn = Infinity; for (let t = tauMin; t <= tauMax; t++) if (cm[t] < mn) { mn = cm[t]; tau = t; } if (mn > 0.45) return { f0: NaN, ap: mn }; }
    const a = cm[tau - 1], b = cm[tau], c = cm[tau + 1];
    const den = a - 2 * b + c, sh = den !== 0 ? clamp(0.5 * (a - c) / den, -1, 1) : 0;
    return { f0: sr / (tau + sh), ap: b };
  };
  /** Accordeur (une corde) : hauteur, corde la plus proche, écart en cents. */
  D.tune = function (frame, sr, a4, tuning) {
    a4 = a4 || 440;
    let rms = 0; for (let i = 0; i < frame.length; i++) rms += frame[i] * frame[i];
    rms = Math.sqrt(rms / frame.length);
    if (rms < 0.002) return { f0: NaN, rms };
    const r = D.yin(frame, sr, 65, 700, 0.15);
    if (!isNum(r.f0) || r.ap > 0.35) return { f0: NaN, rms };
    const midi = 69 + 12 * Math.log2(r.f0 / a4);
    const open = tuning || T.OPEN;
    let s = 0, bd = Infinity;
    open.forEach((n, i) => { const dd = Math.abs(midi - n); if (dd < bd) { bd = dd; s = i; } });
    return { f0: r.f0, ap: r.ap, midi, string: s, target: open[s], cents: 100 * (midi - open[s]), noteCents: 100 * (midi - Math.round(midi)), rms };
  };
  /**
   * Vérification rapide de l'accordage sur un coup à vide (6 cordes) : pour chaque corde, pics de ses
   * harmoniques peu partagés avec les autres cordes (accordage en quartes : beaucoup d'harmoniques coïncident).
   * @returns [{s, cents, conf}] ou null
   */
  D.polyTune = function (pcm, sr, a4) {
    const prep = D.prepare(pcm, sr), x = prep.x;
    a4 = a4 || 440;
    const on = D.onsets(x, { combine: 0.3 });
    if (!on.list.length) return null;
    const strongest = on.list.reduce((a, b) => (b.v > a.v ? b : a));
    const a = Math.round((strongest.t + 0.25) * FS), len = 16384, nfft = 32768;
    if (a + len > x.length) return null;
    const m = magSpectrum(x, a, len, nfft), df = FS / nfft;
    const HARM = [[2, 1], [2, 1], [2, 1], [1, 2], [2, 1], [1, 2]];
    const floorAt = k => { const v = []; for (let q = k - 60; q <= k + 60; q += 6) if (q > 0 && q < m.length) v.push(m[q]); return median(v); };
    return T.OPEN.map((n, s) => {
      const f = hz(n, a4);
      let num = 0, den = 0, conf = 0;
      for (const h of HARM[s]) {
        const fh = f * h, k0 = Math.floor(fh * Math.pow(2, -0.55 / 12) / df), k1 = Math.ceil(fh * Math.pow(2, 0.55 / 12) / df);
        let kk = -1, mv = 0; for (let k = k0; k <= k1; k++) if (m[k] > mv) { mv = m[k]; kk = k; }
        if (kk < 1) continue;
        const A = Math.log(m[kk - 1] + 1e-12), B = Math.log(m[kk] + 1e-12), C = Math.log(m[kk + 1] + 1e-12);
        const dl = clamp((A - C) / (2 * (A - 2 * B + C) || 1), -0.5, 0.5);
        const fr = (kk + dl) * df / h;
        const prom = mv / (floorAt(kk) + 1e-12);
        if (prom < 6) continue;
        const w = Math.log(prom) * (h === HARM[s][0] ? 1.3 : 1);
        num += w * 1200 * Math.log2(fr / f); den += w; conf = Math.max(conf, prom);
      }
      return { s, cents: den ? +(num / den).toFixed(1) : null, conf: +Math.min(1, Math.log10(conf + 1) / 2.5).toFixed(2) };
    });
  };

  /* ---------------------------------------------------------------- voix (mélodie, tessiture) */
  /** Suivi de hauteur de la voix (10 ms) : {t[], midi[], voiced[]} */
  D.trackVoice = function (pcm, sr, o) {
    o = o || {};
    const x = sr === FS ? pcm : resample(pcm, sr, FS);
    const hop = Math.round(0.01 * FS), W = 1024;
    const n = Math.max(0, Math.floor((x.length - W) / hop));
    const t = new Float32Array(n), midi = new Float32Array(n), voiced = new Uint8Array(n), en = new Float32Array(n);
    const fr = new Float32Array(W);
    for (let i = 0; i < n; i++) {
      let e = 0; for (let j = 0; j < W; j++) { const v = x[i * hop + j]; fr[j] = v; e += v * v; }
      en[i] = e / W; t[i] = (i * hop + W / 2) / FS;
    }
    const thrE = Math.max(percentile(en, 0.2) * 20, 1e-7);
    for (let i = 0; i < n; i++) {
      if (en[i] < thrE) { midi[i] = NaN; continue; }
      for (let j = 0; j < W; j++) fr[j] = x[i * hop + j];
      const r = D.yin(fr, FS, o.fmin || 75, o.fmax || 900, 0.15);
      if (isNum(r.f0) && r.ap < 0.3) { midi[i] = 69 + 12 * Math.log2(r.f0 / (o.a4 || 440)); voiced[i] = 1; } else midi[i] = NaN;
    }
    // lissage médian (5 trames) et corrections d'octave isolées
    const sm = Float32Array.from(midi);
    for (let i = 2; i < n - 2; i++) {
      if (!voiced[i]) continue;
      const w = [midi[i - 2], midi[i - 1], midi[i], midi[i + 1], midi[i + 2]].filter(isNum);
      if (w.length >= 3) { const md = median(w); let v = midi[i]; while (v - md > 7) v -= 12; while (md - v > 7) v += 12; sm[i] = v; }
    }
    return { t, midi: sm, voiced, hop: 0.01 };
  };
  /** Notes chantées : segments stables (≥ 90 ms, variation < 0,8 demi-ton). */
  D.segmentNotes = function (tr) {
    const notes = [];
    let cur = null;
    const close = () => { if (cur && cur.vals.length * tr.hop >= 0.09) notes.push({ t0: cur.t0, t1: cur.t1, midi: median(cur.vals) }); cur = null; };
    for (let i = 0; i < tr.t.length; i++) {
      const m = tr.midi[i];
      if (!tr.voiced[i] || !isNum(m)) { if (cur && tr.t[i] - cur.t1 > 0.05) close(); continue; }
      if (cur) {
        const md = median(cur.vals.slice(-6));
        if (Math.abs(m - md) > 0.8) { close(); cur = { t0: tr.t[i], t1: tr.t[i], vals: [m] }; }
        else { cur.vals.push(m); cur.t1 = tr.t[i]; }
      } else cur = { t0: tr.t[i], t1: tr.t[i], vals: [m] };
    }
    close();
    return notes;
  };
  /**
   * Mélodie sur une grille : part des notes de l'accord sur les temps forts, ambitus, mouvement conjoint.
   * timeline : [{t0, t1, sym}] (s, dans la prise) ; beats : [t des temps forts]
   */
  D.melodyVsChords = function (notes, timeline, strongBeats) {
    const out = { n: notes.length, onChord: 0, strongN: 0, strongOn: 0, steps: 0, range: null };
    if (!notes.length) return out;
    const chordAt = t => { const c = timeline.find(c => t >= c.t0 && t < c.t1); return c ? T.chordPcs(c.sym) : null; };
    notes.forEach((nt, i) => {
      const pcs = chordAt(nt.t0 + 0.03);
      const pc = T.mod12(Math.round(nt.midi));
      const on = pcs ? pcs.includes(pc) : false;
      if (on) out.onChord++;
      const strong = strongBeats.some(b => Math.abs(b - nt.t0) < 0.12 || (nt.t0 < b && nt.t1 > b + 0.05));
      if (strong) { out.strongN++; if (on) out.strongOn++; }
      if (i > 0 && Math.abs(Math.round(nt.midi) - Math.round(notes[i - 1].midi)) <= 2) out.steps++;
    });
    const ms = notes.map(n => n.midi);
    out.range = { lo: Math.min(...ms), hi: Math.max(...ms) };
    out.onChordRatio = out.onChord / notes.length;
    out.strongRatio = out.strongN ? out.strongOn / out.strongN : null;
    out.stepRatio = notes.length > 1 ? out.steps / (notes.length - 1) : null;
    return out;
  };
  /** Voix présente ? (fraction de trames voisées sur la fenêtre) */
  D.voiceShare = (tr, t0, t1) => { let n = 0, v = 0; for (let i = 0; i < tr.t.length; i++) if (tr.t[i] >= t0 && tr.t[i] <= t1) { n++; if (tr.voiced[i]) v++; } return n ? v / n : 0; };

  AC.dsp = D;
  if (typeof module !== 'undefined' && module.exports) module.exports = D;
})(typeof globalThis !== 'undefined' ? globalThis : this);
