/* ==== model.js ==== */
/* ACCORD — modèle de compétences.
   Chaque compétence a un niveau θ (0–10) et une incertitude σ. Chaque exercice généré a une difficulté d
   sur la même échelle. Probabilité de réussite : P = 1 / (1 + e^(−1,5·(θ − d))). On vise P ≈ 0,8 : assez de
   réussite pour rester motivé, assez d'échecs pour progresser (Wilson et al. 2019 ; point de défi,
   Guadagnoli & Lee 2004). Un exercice nouveau démarre plus facile (P ≈ 0,86 : on apprend d'abord sans
   trop d'erreurs, Maxwell et al. 2001). */
(function (root) {
  'use strict';
  const AC = root.AC || (root.AC = {});
  const M = {};

  M.COMPS = [
    { id: 'accords', name: 'Accords propres', pillar: 'gauche', short: 'Accords',
      what: 'Former les accords vite et proprement : chaque corde sonne, aucune n’est étouffée.' },
    { id: 'changements', name: 'Changements d’accords', pillar: 'gauche', short: 'Changements',
      what: 'Passer d’un accord à l’autre vite et à temps, sans casser le rythme.' },
    { id: 'barres', name: 'Barrés', pillar: 'gauche', short: 'Barrés',
      what: 'Fa, Si mineur et les autres : un index qui tient toutes les cordes, et les passages vers les barrés.' },
    { id: 'pulsation', name: 'Pulsation & tempo', pillar: 'droite', short: 'Pulsation',
      what: 'Jouer à temps et garder le tempo quand le métronome se tait — la base pour accompagner.' },
    { id: 'rythmiques', name: 'Rythmiques', pillar: 'droite', short: 'Rythmiques',
      what: 'Les motifs de grattage : croches, syncopes, doubles croches, frappes percussives.' },
    { id: 'picking', name: 'Arpèges & picking', pillar: 'droite', short: 'Picking',
      what: 'Jouer aux doigts : arpèges, basse alternée (Travis).' },
    { id: 'oreille', name: 'Oreille', pillar: 'oreille', short: 'Oreille',
      what: 'Entendre si c’est accordé, majeur ou mineur, quel degré de la grille, et retrouver un accord.' },
    { id: 'harmonie', name: 'Harmonie & manche', pillar: 'oreille', short: 'Harmonie',
      what: 'Tonalités, degrés, capodastre, notes du manche : comprendre pour transposer et composer.' },
    { id: 'chant', name: 'Chanter en jouant', pillar: 'musique', short: 'Chant + guitare',
      what: 'Une main droite assez automatique pour chanter par-dessus.' },
    { id: 'chansons', name: 'Chansons', pillar: 'musique', short: 'Chansons',
      what: 'Jouer une chanson entière, à tempo, sans s’arrêter.' },
    { id: 'composition', name: 'Composition', pillar: 'musique', short: 'Composition',
      what: 'Écrire des grilles, des mélodies et des structures qui tiennent debout.' },
  ];
  M.COMP = {}; M.COMPS.forEach(c => { M.COMP[c.id] = c; });
  M.PILLARS = {
    gauche: { name: 'Main gauche', color: '#F0A04B' },
    droite: { name: 'Main droite & rythme', color: '#6FC7B2' },
    oreille: { name: 'Oreille & harmonie', color: '#7FB0FF' },
    musique: { name: 'Musique', color: '#E98AA8' },
  };

  /* Paliers lisibles */
  M.LABELS = [[0, 'Débutant'], [2, 'Intermédiaire'], [4, 'Confirmé'], [6, 'Avancé'], [8, 'Expert'], [9.3, 'Professionnel']];
  M.label = function (th) {
    let lab = M.LABELS[0][1], lo = 0, hi = 2;
    for (let i = 0; i < M.LABELS.length; i++) if (th >= M.LABELS[i][0]) { lab = M.LABELS[i][1]; lo = M.LABELS[i][0]; hi = (M.LABELS[i + 1] || [10])[0]; }
    return lab + (lab === 'Professionnel' ? '' : th - lo < (hi - lo) / 2 ? ' (bas)' : ' (haut)');
  };

  M.SLOPE = 1.5;
  M.TARGET_P = 0.8;
  M.pSuccess = (th, d) => 1 / (1 + Math.exp(-M.SLOPE * (th - d)));
  /** Difficulté qui donne une probabilité de réussite p au niveau θ. */
  M.dFor = (th, p) => th - Math.log(p / (1 - p)) / M.SLOPE;
  M.newSkill = (th, sd) => ({ th: th == null ? 2 : th, sd: sd == null ? 2 : sd, n: 0, last: 0, hist: [] });

  const pad = n => (n < 10 ? '0' : '') + n;
  function stamp(sk, ts) {
    if (!ts) return;
    sk.last = ts;
    const dt = new Date(ts), day = dt.getFullYear() + '-' + pad(dt.getMonth() + 1) + '-' + pad(dt.getDate());
    const h = sk.hist, lastH = h[h.length - 1];
    if (lastH && lastH[0] === day) lastH[1] = +sk.th.toFixed(2); else h.push([day, +sk.th.toFixed(2)]);
    if (h.length > 400) h.splice(0, h.length - 400);
  }
  /**
   * Mise à jour après une prise : y ∈ [0,1] (1 réussi, 0,5 presque, 0 raté), d = difficulté.
   * Gain adaptatif : grand tant que le niveau est incertain, petit une fois bien estimé.
   * w : poids (1 = mesure ; 0,5 = auto-évaluation ; 0,3 = compétence secondaire).
   */
  M.update = function (sk, d, y, w, ts) {
    w = w == null ? 1 : w;
    const p = M.pSuccess(sk.th, d);
    const K = (0.12 + 0.28 * Math.min(1, sk.sd / 2)) * w;
    sk.th = Math.max(0, Math.min(10, sk.th + K * (y - p) * 2));
    sk.sd = Math.max(0.45, sk.sd * (1 - 0.02 * w));
    sk.n += w;
    stamp(sk, ts);
    return p;
  };
  /**
   * Compétence secondaire : elle ne bouge que de la « surprise » du résultat (r = y − p, p prévu par le niveau
   * principal). Utiliser la difficulté de l'exercice principal l'attirerait vers le niveau de l'autre compétence.
   */
  M.nudge = function (sk, r, w, ts) {
    if (!isFinite(r) || !w) return;
    const K = (0.12 + 0.28 * Math.min(1, sk.sd / 2)) * w;
    sk.th = Math.max(0, Math.min(10, sk.th + K * r * 2));
    sk.sd = Math.max(0.45, sk.sd * (1 - 0.01 * w));
    sk.n += w;
    stamp(sk, ts);
  };
  /** Observation directe d'un niveau (mesure étalon : seuil d'oreille, régularité, changements/min) : fusion bayésienne. */
  M.observe = function (sk, level, noise, ts) {
    if (!isFinite(level)) return;
    const v0 = sk.sd * sk.sd, v1 = noise * noise;
    sk.th = Math.max(0, Math.min(10, (sk.th * v1 + level * v0) / (v0 + v1)));
    sk.sd = Math.max(0.45, Math.sqrt(v0 * v1 / (v0 + v1)));
    if (ts) stamp(sk, ts);
  };
  /**
   * Estimation a posteriori (MAP) à partir d'un a priori N(θ, σ²) et d'items de difficulté connue (bilan) :
   * vraisemblance logistique avec réponses graduées. Recherche sur grille.
   */
  M.mapEstimate = function (prior, items) {
    let best = prior.th, bl = -Infinity; const grid = [];
    for (let th = 0; th <= 10.0001; th += 0.05) {
      let ll = -0.5 * Math.pow((th - prior.th) / prior.sd, 2);
      for (const it of items) {
        if (it.y == null) continue;
        const p = Math.min(1 - 1e-6, Math.max(1e-6, M.pSuccess(th, it.d))), w = it.w == null ? 1 : it.w;
        ll += w * (it.y * Math.log(p) + (1 - it.y) * Math.log(1 - p));
      }
      grid.push([th, ll]);
      if (ll > bl) { bl = ll; best = th; }
    }
    let z = 0, m1 = 0, m2 = 0;
    for (const [th, ll] of grid) { const w = Math.exp(ll - bl); z += w; m1 += w * th; m2 += w * th * th; }
    const mu = m1 / z, sd = Math.sqrt(Math.max(0, m2 / z - mu * mu));
    return { th: best, sd: Math.max(0.45, sd) };
  };

  /** Niveau global : moyenne pondérée — accompagner et composer passent avant la virtuosité. */
  M.WEIGHTS = { accords: 1.1, changements: 1.3, barres: 0.8, pulsation: 1.2, rythmiques: 1.2, picking: 0.8, oreille: 0.9, harmonie: 0.9, chant: 1.3, chansons: 1.2, composition: 1.0 };
  M.overall = function (skills) {
    let s = 0, w = 0;
    for (const c of M.COMPS) { const sk = skills[c.id]; if (!sk) continue; s += sk.th * M.WEIGHTS[c.id]; w += M.WEIGHTS[c.id]; }
    return w ? s / w : 0;
  };

  /** Mise à l'échelle 0–10 d'une mesure par interpolation linéaire sur un barème. */
  M.scale = function (v, table) {
    if (!isFinite(v)) return NaN;
    if (v <= table[0][0]) return table[0][1];
    for (let i = 1; i < table.length; i++) {
      const [x0, y0] = table[i - 1], [x1, y1] = table[i];
      if (v <= x1) return y0 + (y1 - y0) * (v - x0) / (x1 - x0);
    }
    return table[table.length - 1][1];
  };
  M.scaleInv = function (lvl, table) {
    const inv = table.map(([x, y]) => [y, x]).sort((a, b) => a[0] - b[0]);
    return M.scale(lvl, inv);
  };
  M.SCALES = {
    // régularité (écart-type des décalages au clic, ms) → pulsation. Repères : non-musiciens 30–50 ms,
    // musiciens entraînés 10–20 ms en tapotant (Repp 2005) ; gratter est un peu moins précis.
    timingSd: [[8, 9.5], [11, 8.5], [14, 7.5], [18, 6.5], [23, 5.5], [29, 4.5], [36, 3.5], [45, 2.5], [55, 1.5], [70, 0.5]],
    // seuil de discrimination de hauteur (cents, 75 % de bonnes réponses) → oreille
    jnd: [[5, 9.5], [8, 8.5], [12, 7.5], [18, 6.3], [25, 5.2], [35, 4.2], [50, 3], [100, 1.5]],
  };

  AC.model = M;
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
})(typeof globalThis !== 'undefined' ? globalThis : this);
