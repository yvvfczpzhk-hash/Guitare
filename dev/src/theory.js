/* ==== theory.js ==== */
/* ACCORD — théorie musicale pour la guitare (pur, sans navigateur : testable).
   Notes, accords (formes, doigtés, difficulté), changements d'accords, tonalités et degrés,
   capodastre, rythmiques et arpèges, lecture de grilles (ChordPro, accords au-dessus des
   paroles, mesures « | C | G | »), suggestions de composition. */
(function (root) {
  'use strict';
  const AC = root.AC || (root.AC = {});
  const T = {};

  /* ---------------------------------------------------------------- notes */
  const OPEN = [40, 45, 50, 55, 59, 64];                  // Mi2 La2 Ré3 Sol3 Si3 Mi4 (corde 6 → corde 1)
  T.OPEN = OPEN;
  T.STRING_FR = ['Mi grave', 'La', 'Ré', 'Sol', 'Si', 'Mi aigu'];
  T.STRING_NUM = [6, 5, 4, 3, 2, 1];
  const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const FR_SHARP = ['Do', 'Do♯', 'Ré', 'Ré♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
  const FR_FLAT = ['Do', 'Ré♭', 'Ré', 'Mi♭', 'Mi', 'Fa', 'Sol♭', 'Sol', 'La♭', 'La', 'Si♭', 'Si'];
  T.SHARP = SHARP; T.FLAT = FLAT; T.FR_SHARP = FR_SHARP; T.FR_FLAT = FR_FLAT;
  const mod12 = n => ((n % 12) + 12) % 12;
  T.mod12 = mod12;
  T.hzToMidi = (f, a4) => 69 + 12 * Math.log2(f / (a4 || 440));
  T.midiToHz = (m, a4) => (a4 || 440) * Math.pow(2, (m - 69) / 12);
  /** Nom français d'une note MIDI (« Mi2 », « Sol♯3 »). */
  T.noteName = function (m, flats) {
    if (m == null || !isFinite(m)) return '—';
    const r = Math.round(m);
    return (flats ? FR_FLAT : FR_SHARP)[mod12(r)] + (Math.floor(r / 12) - 1);
  };
  T.pcName = (pc, flats, fr) => (fr ? (flats ? FR_FLAT : FR_SHARP) : (flats ? FLAT : SHARP))[mod12(pc)];
  /** Affichage typographique : ♯ et ♭. */
  T.pretty = s => String(s == null ? '' : s).replace(/#/g, '♯').replace(/(^|[A-G])b/g, '$1♭');

  /* ---------------------------------------------------------------- qualités d'accords */
  // iv : intervalles depuis la fondamentale ; fr : nom français ; core : notes indispensables (à vérifier au micro)
  const QUAL = {
    '': { iv: [0, 4, 7], fr: 'majeur', core: [0, 4] },
    m: { iv: [0, 3, 7], fr: 'mineur', core: [0, 3] },
    '7': { iv: [0, 4, 7, 10], fr: 'septième', core: [0, 4, 10] },
    m7: { iv: [0, 3, 7, 10], fr: 'mineur septième', core: [0, 3, 10] },
    maj7: { iv: [0, 4, 7, 11], fr: 'septième majeure', core: [0, 4, 11] },
    sus2: { iv: [0, 2, 7], fr: 'sus2', core: [0, 2, 7] },
    sus4: { iv: [0, 5, 7], fr: 'sus4', core: [0, 5, 7] },
    add9: { iv: [0, 4, 7, 2], fr: 'add9', core: [0, 4, 2] },
    madd9: { iv: [0, 3, 7, 2], fr: 'mineur add9', core: [0, 3, 2] },
    '6': { iv: [0, 4, 7, 9], fr: 'sixte', core: [0, 4, 9] },
    m6: { iv: [0, 3, 7, 9], fr: 'mineur sixte', core: [0, 3, 9] },
    '9': { iv: [0, 4, 7, 10, 2], fr: 'neuvième', core: [0, 4, 10, 2] },
    m9: { iv: [0, 3, 7, 10, 2], fr: 'mineur neuvième', core: [0, 3, 10, 2] },
    maj9: { iv: [0, 4, 7, 11, 2], fr: 'neuvième majeure', core: [0, 4, 11, 2] },
    '11': { iv: [0, 7, 10, 2, 5], fr: 'onzième', core: [0, 10, 5] },
    '13': { iv: [0, 4, 7, 10, 9], fr: 'treizième', core: [0, 4, 10, 9] },
    dim: { iv: [0, 3, 6], fr: 'diminué', core: [0, 3, 6] },
    dim7: { iv: [0, 3, 6, 9], fr: 'diminué septième', core: [0, 3, 6, 9] },
    aug: { iv: [0, 4, 8], fr: 'augmenté', core: [0, 4, 8] },
    '5': { iv: [0, 7], fr: 'quinte (power chord)', core: [0, 7] },
    m7b5: { iv: [0, 3, 6, 10], fr: 'demi-diminué', core: [0, 3, 6, 10] },
    '7sus4': { iv: [0, 5, 7, 10], fr: 'septième sus4', core: [0, 5, 10] },
    mmaj7: { iv: [0, 3, 7, 11], fr: 'mineur septième majeure', core: [0, 3, 11] },
  };
  T.QUAL = QUAL;
  // écritures rencontrées sur les sites de partitions → qualité canonique
  const ALIAS = {
    '': '', M: '', maj: '', major: '', ma: '',
    m: 'm', min: 'm', '-': 'm', mi: 'm', minor: 'm',
    '7': '7', dom7: '7', '7b9': '7', '7#9': '7', '7#5': '7', '7b5': '7', '7(b9)': '7', '7(#9)': '7',
    m7: 'm7', min7: 'm7', '-7': 'm7', mi7: 'm7', m7add11: 'm7', m11: 'm7',
    maj7: 'maj7', M7: 'maj7', 'Δ': 'maj7', 'Δ7': 'maj7', j7: 'maj7', '7M': 'maj7', ma7: 'maj7', 'maj7#11': 'maj7',
    sus2: 'sus2', '2': 'sus2', sus9: 'sus2',
    sus4: 'sus4', sus: 'sus4', '4': 'sus4',
    add9: 'add9', add2: 'add9', '(add9)': 'add9', '(add2)': 'add9', add11: '', '(add11)': '',
    madd9: 'madd9', 'm(add9)': 'madd9', madd2: 'madd9', 'm(add2)': 'madd9',
    '6': '6', M6: '6', maj6: '6', '6/9': '6', '69': '6', add6: '6',
    m6: 'm6', min6: 'm6', '-6': 'm6',
    '9': '9', '7(9)': '9', m9: 'm9', min9: 'm9', '-9': 'm9', maj9: 'maj9', M9: 'maj9', '9M': 'maj9', '7M(9)': 'maj9',
    '11': '11', '9sus4': '11', '13': '13', '7(13)': '13',
    dim: 'dim', '°': 'dim', o: 'dim', dim7: 'dim7', '°7': 'dim7', o7: 'dim7',
    aug: 'aug', '+': 'aug', '+5': 'aug', '(#5)': 'aug', '#5': 'aug', aug5: 'aug',
    '5': '5', 'no3': '5',
    m7b5: 'm7b5', 'ø': 'm7b5', 'ø7': 'm7b5', 'm7(b5)': 'm7b5', '-7b5': 'm7b5', 'mi7b5': 'm7b5',
    '7sus4': '7sus4', '7sus': '7sus4', '7sus2': '7sus4', '7(sus4)': '7sus4',
    mmaj7: 'mmaj7', 'm(maj7)': 'mmaj7', mM7: 'mmaj7', m7M: 'mmaj7', 'm(7M)': 'mmaj7',
  };
  const FR_ROOT = { do: 0, re: 2, 'ré': 2, mi: 4, fa: 5, sol: 7, la: 9, si: 11 };
  const EN_ROOT = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, H: 11 };
  function accidental(ch) { return ch === '#' || ch === '♯' ? 1 : ch === 'b' || ch === '♭' ? -1 : 0; }
  function parseRoots(s) {
    // anglais : lettre majuscule ; français : Do Ré Mi Fa Sol La Si (majuscule initiale). « Fadd9 » est anglais,
    // « Fa » ou « Fam » français : on essaie les deux lectures et l'on garde celle dont la suite est une qualité connue.
    const out = [];
    let m = /^(Do|Ré|Re|Mi|Fa|Sol|La|Si)([#b♯♭]?)/.exec(s);
    if (m) out.push({ pc: mod12(FR_ROOT[m[1].toLowerCase()] + accidental(m[2])), len: m[0].length, flat: m[2] === 'b' || m[2] === '♭', fr: true });
    m = /^([A-GH])([#b♯♭]?)/.exec(s);
    if (m) out.push({ pc: mod12(EN_ROOT[m[1]] + accidental(m[2])), len: m[0].length, flat: m[2] === 'b' || m[2] === '♭', fr: false });
    return out;
  }
  function qualityOf(rest, fr) {
    rest = rest.replace(/\s+/g, '');
    if (fr && /^m/i.test(rest) && !/^maj/i.test(rest)) rest = 'm' + rest.slice(1);  // « Lam »
    let q = ALIAS[rest];
    if (q == null) q = ALIAS[rest.replace(/[()]/g, '')];
    if (q == null && /^maj7?$/.test(rest)) q = 'maj7';
    return q;
  }
  /**
   * Lit un symbole d'accord (« Am7 », « F#m », « Bb/D », « Cadd9 », « Lam », « Ré7 », « Do7M »).
   * @returns {root, q, bass, flat, sym} ou null si ce n'est pas un accord.
   */
  T.parseChord = function (str) {
    if (str == null) return null;
    const s = String(str).trim().replace(/^\((.*)\)$/, '$1');
    if (!s || s.length > 14) return null;
    for (const r of parseRoots(s)) {
      let rest = s.slice(r.len), bass = null;
      const slash = rest.lastIndexOf('/');
      if (slash >= 0) {
        const tail = rest.slice(slash + 1);
        const b = parseRoots(tail).find(x => x.len === tail.length);
        if (b) { bass = b.pc; rest = rest.slice(0, slash); }
        else if (!/^(9|6|11)$/.test(tail)) continue;
      }
      const q = qualityOf(rest, r.fr);
      if (q == null) continue;
      const out = { root: r.pc, q, bass: bass != null && bass !== r.pc ? bass : null, flat: r.flat };
      out.sym = T.chordSym(out, r.flat ? true : undefined);
      return out;
    }
    return null;
  };
  /** Orthographe usuelle sans tonalité : Si♭, Mi♭, La♭ (majeurs), Do♯m, Fa♯, Sol♯m… */
  T.spellPc = function (pc, q) {
    pc = mod12(pc);
    const minor = T.isMinor(q || '');
    if (pc === 10 || pc === 3) return FLAT[pc];
    if (pc === 8) return minor ? 'G#' : 'Ab';
    if (pc === 1) return minor ? 'C#' : 'Db';
    return SHARP[pc];
  };
  /** Symbole normalisé (anglais) d'un accord {root, q, bass}. */
  T.chordSym = function (c, flats) {
    if (flats == null) return T.spellPc(c.root, c.q) + c.q + (c.bass != null ? '/' + T.spellPc(c.bass, '') : '');
    const names = flats ? FLAT : SHARP;
    return names[mod12(c.root)] + c.q + (c.bass != null ? '/' + names[mod12(c.bass)] : '');
  };
  /** Nom à la française : « Lam7 », « Sol », « Fa♯m ». */
  T.chordFr = function (sym) {
    const c = typeof sym === 'string' ? T.parseChord(sym) : sym;
    if (!c) return String(sym);
    const fl = c.flat;
    const qs = c.q === 'maj7' ? '7M' : c.q;
    return (fl ? FR_FLAT : FR_SHARP)[c.root] + qs + (c.bass != null ? '/' + (fl ? FR_FLAT : FR_SHARP)[c.bass] : '');
  };
  /** Nom long : « La mineur septième », « Ré majeur / Fa♯ à la basse ». */
  T.chordLong = function (sym) {
    const c = typeof sym === 'string' ? T.parseChord(sym) : sym;
    if (!c) return String(sym);
    const nm = (c.flat ? FR_FLAT : FR_SHARP)[c.root];
    return nm + ' ' + QUAL[c.q].fr + (c.bass != null ? ', basse ' + (c.flat ? FR_FLAT : FR_SHARP)[c.bass] : '');
  };
  /** Classes de hauteur d'un accord (fondamentale en premier). */
  T.chordPcs = function (sym) {
    const c = typeof sym === 'string' ? T.parseChord(sym) : sym;
    if (!c) return [];
    const pcs = QUAL[c.q].iv.map(i => mod12(c.root + i));
    if (c.bass != null && !pcs.includes(c.bass)) pcs.push(c.bass);
    return Array.from(new Set(pcs));
  };
  T.isMinor = q => q === 'm' || q === 'm7' || q === 'm6' || q === 'm9' || q === 'madd9' || q === 'mmaj7' || q === 'm7b5' || q === 'dim' || q === 'dim7';
  /** Transpose un symbole de n demi-tons (orthographe selon la préférence ♯/♭ donnée). */
  T.transposeSym = function (sym, n, flats) {
    const c = T.parseChord(sym);
    if (!c) return sym;
    return T.chordSym({ root: c.root + n, q: c.q, bass: c.bass != null ? c.bass + n : null }, flats != null ? flats : undefined);
  };

  /* ---------------------------------------------------------------- formes d'accords */
  // frets : corde 6 → 1 (−1 = étouffée, 0 = à vide) ; fingers : 1 index … 4 auriculaire, 5 pouce ;
  // barre : {fret, from, to} (indices de cordes 0 = Mi grave … 5 = Mi aigu) ;
  // d : difficulté intrinsèque de la forme pour un débutant (0–10, même échelle que les niveaux).
  const V = (id, sym, frets, fingers, d, o) => Object.assign({ id, sym, frets, fingers, d }, o || {});
  const OPEN_DB = [
    // ---- majeurs ouverts
    V('C', 'C', [-1, 3, 2, 0, 1, 0], [0, 3, 2, 0, 1, 0], 2.6, { tags: ['open'] }),
    V('A', 'A', [-1, 0, 2, 2, 2, 0], [0, 0, 1, 2, 3, 0], 2.0, { tags: ['open'] }),
    V('G', 'G', [3, 2, 0, 0, 0, 3], [2, 1, 0, 0, 0, 3], 2.5, { tags: ['open'] }),
    V('G-pop', 'G', [3, 2, 0, 0, 3, 3], [2, 1, 0, 0, 3, 4], 2.9, { tags: ['open', 'pop'], variant: '4 doigts (pop)' }),
    V('E', 'E', [0, 2, 2, 1, 0, 0], [0, 2, 3, 1, 0, 0], 1.5, { tags: ['open'] }),
    V('D', 'D', [-1, -1, 0, 2, 3, 2], [0, 0, 0, 1, 3, 2], 2.0, { tags: ['open'] }),
    V('F', 'F', [1, 3, 3, 2, 1, 1], [1, 3, 4, 2, 1, 1], 6.0, { tags: ['barre'], barre: { fret: 1, from: 0, to: 5 } }),
    V('F-mini', 'F', [-1, -1, 3, 2, 1, 1], [0, 0, 3, 2, 1, 1], 4.2, { tags: ['open', 'mini'], barre: { fret: 1, from: 4, to: 5 }, variant: 'petit barré' }),
    V('B', 'B', [-1, 2, 4, 4, 4, 2], [0, 1, 2, 3, 4, 1], 6.5, { tags: ['barre'], barre: { fret: 2, from: 1, to: 5 } }),
    V('Bb', 'Bb', [-1, 1, 3, 3, 3, 1], [0, 1, 2, 3, 4, 1], 6.6, { tags: ['barre'], barre: { fret: 1, from: 1, to: 5 } }),
    // ---- mineurs
    V('Am', 'Am', [-1, 0, 2, 2, 1, 0], [0, 0, 2, 3, 1, 0], 1.5, { tags: ['open'] }),
    V('Em', 'Em', [0, 2, 2, 0, 0, 0], [0, 2, 3, 0, 0, 0], 0.8, { tags: ['open'] }),
    V('Dm', 'Dm', [-1, -1, 0, 2, 3, 1], [0, 0, 0, 2, 3, 1], 2.3, { tags: ['open'] }),
    V('Bm', 'Bm', [-1, 2, 4, 4, 3, 2], [0, 1, 3, 4, 2, 1], 6.2, { tags: ['barre'], barre: { fret: 2, from: 1, to: 5 } }),
    // préparation au barré : l'index couche 3 puis 4 cordes en case 5 (cordes plus souples qu'en case 1)
    V('Am-b3', 'Am', [-1, -1, -1, 5, 5, 5], [0, 0, 0, 1, 1, 1], 2.6, { tags: ['barre-prep'], barre: { fret: 5, from: 3, to: 5 }, variant: 'petit barré 3 cordes, case 5' }),
    V('Am7-b4', 'Am7', [-1, -1, 5, 5, 5, 5], [0, 0, 1, 1, 1, 1], 3.4, { tags: ['barre-prep'], barre: { fret: 5, from: 2, to: 5 }, variant: 'barré 4 cordes, case 5' }),
    V('Bm-mini', 'Bm', [-1, -1, 4, 4, 3, 2], [0, 0, 3, 4, 2, 1], 4.4, { tags: ['open', 'mini'], variant: '4 cordes' }),
    V('F#m', 'F#m', [2, 4, 4, 2, 2, 2], [1, 3, 4, 1, 1, 1], 6.3, { tags: ['barre'], barre: { fret: 2, from: 0, to: 5 } }),
    V('C#m', 'C#m', [-1, 4, 6, 6, 5, 4], [0, 1, 3, 4, 2, 1], 6.5, { tags: ['barre'], barre: { fret: 4, from: 1, to: 5 } }),
    V('Gm', 'Gm', [3, 5, 5, 3, 3, 3], [1, 3, 4, 1, 1, 1], 6.2, { tags: ['barre'], barre: { fret: 3, from: 0, to: 5 } }),
    V('Cm', 'Cm', [-1, 3, 5, 5, 4, 3], [0, 1, 3, 4, 2, 1], 6.4, { tags: ['barre'], barre: { fret: 3, from: 1, to: 5 } }),
    // ---- septièmes
    V('E7', 'E7', [0, 2, 0, 1, 0, 0], [0, 2, 0, 1, 0, 0], 1.4, { tags: ['open', '7'] }),
    V('A7', 'A7', [-1, 0, 2, 0, 2, 0], [0, 0, 2, 0, 3, 0], 1.6, { tags: ['open', '7'] }),
    V('D7', 'D7', [-1, -1, 0, 2, 1, 2], [0, 0, 0, 2, 1, 3], 2.4, { tags: ['open', '7'] }),
    V('G7', 'G7', [3, 2, 0, 0, 0, 1], [3, 2, 0, 0, 0, 1], 2.8, { tags: ['open', '7'] }),
    V('C7', 'C7', [-1, 3, 2, 3, 1, 0], [0, 3, 2, 4, 1, 0], 3.0, { tags: ['open', '7'] }),
    V('B7', 'B7', [-1, 2, 1, 2, 0, 2], [0, 2, 1, 3, 0, 4], 3.4, { tags: ['open', '7'] }),
    V('Am7', 'Am7', [-1, 0, 2, 0, 1, 0], [0, 0, 2, 0, 1, 0], 1.2, { tags: ['open', '7'] }),
    V('Em7', 'Em7', [0, 2, 0, 0, 0, 0], [0, 2, 0, 0, 0, 0], 0.6, { tags: ['open', '7'], variant: '1 doigt' }),
    V('Em7-pop', 'Em7', [0, 2, 2, 0, 3, 3], [0, 1, 2, 0, 3, 4], 2.6, { tags: ['open', 'pop', '7'], variant: '4 doigts (pop)' }),
    V('Dm7', 'Dm7', [-1, -1, 0, 2, 1, 1], [0, 0, 0, 2, 1, 1], 2.4, { tags: ['open', '7'], barre: { fret: 1, from: 4, to: 5 } }),
    V('Bm7', 'Bm7', [-1, 2, 0, 2, 0, 2], [0, 1, 0, 2, 0, 3], 2.8, { tags: ['open', '7'] }),
    V('F#m7', 'F#m7', [2, 4, 2, 2, 2, 2], [1, 3, 1, 1, 1, 1], 5.6, { tags: ['barre', '7'], barre: { fret: 2, from: 0, to: 5 } }),
    V('Cmaj7', 'Cmaj7', [-1, 3, 2, 0, 0, 0], [0, 3, 2, 0, 0, 0], 1.8, { tags: ['open', 'color'] }),
    V('Fmaj7', 'Fmaj7', [-1, -1, 3, 2, 1, 0], [0, 0, 3, 2, 1, 0], 3.0, { tags: ['open', 'color'] }),
    V('Gmaj7', 'Gmaj7', [3, 2, 0, 0, 0, 2], [3, 2, 0, 0, 0, 1], 2.6, { tags: ['open', 'color'] }),
    V('Amaj7', 'Amaj7', [-1, 0, 2, 1, 2, 0], [0, 0, 2, 1, 3, 0], 2.4, { tags: ['open', 'color'] }),
    V('Dmaj7', 'Dmaj7', [-1, -1, 0, 2, 2, 2], [0, 0, 0, 1, 2, 3], 2.3, { tags: ['open', 'color'] }),
    // ---- couleurs (sus, add9) et basses
    V('Asus2', 'Asus2', [-1, 0, 2, 2, 0, 0], [0, 0, 1, 2, 0, 0], 1.0, { tags: ['open', 'color'] }),
    V('Asus4', 'Asus4', [-1, 0, 2, 2, 3, 0], [0, 0, 1, 2, 3, 0], 2.0, { tags: ['open', 'color'] }),
    V('Dsus2', 'Dsus2', [-1, -1, 0, 2, 3, 0], [0, 0, 0, 1, 3, 0], 1.6, { tags: ['open', 'color'] }),
    V('Dsus4', 'Dsus4', [-1, -1, 0, 2, 3, 3], [0, 0, 0, 1, 3, 4], 2.3, { tags: ['open', 'color', 'pop'] }),
    V('Esus4', 'Esus4', [0, 2, 2, 2, 0, 0], [0, 2, 3, 4, 0, 0], 1.8, { tags: ['open', 'color'] }),
    V('Cadd9', 'Cadd9', [-1, 3, 2, 0, 3, 3], [0, 2, 1, 0, 3, 4], 2.7, { tags: ['open', 'color', 'pop'] }),
    V('G/B', 'G/B', [-1, 2, 0, 0, 3, 3], [0, 1, 0, 0, 3, 4], 2.7, { tags: ['open', 'pop'] }),
    V('D/F#', 'D/F#', [2, -1, 0, 2, 3, 2], [5, 0, 0, 1, 3, 2], 4.6, { tags: ['open', 'pop'], variant: 'pouce sur le Fa♯' }),
    V('C/G', 'C/G', [3, 3, 2, 0, 1, 0], [3, 4, 2, 0, 1, 0], 3.3, { tags: ['open'] }),
    V('E5', 'E5', [0, 2, 2, -1, -1, -1], [0, 1, 2, 0, 0, 0], 1.0, { tags: ['open', 'power'] }),
    V('A5', 'A5', [-1, 0, 2, 2, -1, -1], [0, 0, 1, 2, 0, 0], 1.0, { tags: ['open', 'power'] }),
    V('C6', 'C6', [-1, 3, 2, 2, 1, 0], [0, 4, 2, 3, 1, 0], 3.2, { tags: ['open', 'color'] }),
    V('A6', 'A6', [-1, 0, 2, 2, 2, 2], [0, 0, 1, 1, 1, 1], 2.6, { tags: ['open', 'color'], barre: { fret: 2, from: 2, to: 5 } }),
    V('E6', 'E6', [0, 2, 2, 1, 2, 0], [0, 2, 3, 1, 4, 0], 2.6, { tags: ['open', 'color'] }),
    V('Gsus4', 'Gsus4', [3, 3, 0, 0, 1, 3], [2, 3, 0, 0, 1, 4], 3.2, { tags: ['open', 'color'] }),
    V('Csus2', 'Csus2', [-1, 3, 0, 0, 1, 3], [0, 3, 0, 0, 1, 4], 3.0, { tags: ['open', 'color'] }),
  ];
  // Formes mobiles (barrés) : position relative à la case de la fondamentale (corde 6 : forme de Mi ; corde 5 : forme de La).
  const MOVABLE = {
    E: { '': [0, 2, 2, 1, 0, 0], m: [0, 2, 2, 0, 0, 0], '7': [0, 2, 0, 1, 0, 0], m7: [0, 2, 0, 0, 0, 0], sus4: [0, 2, 2, 2, 0, 0], '7sus4': [0, 2, 0, 2, 0, 0], '5': [0, 2, 2, -9, -9, -9] },
    A: { '': [-9, 0, 2, 2, 2, 0], m: [-9, 0, 2, 2, 1, 0], '7': [-9, 0, 2, 0, 2, 0], m7: [-9, 0, 2, 0, 1, 0], maj7: [-9, 0, 2, 1, 2, 0], sus2: [-9, 0, 2, 2, 0, 0], sus4: [-9, 0, 2, 2, 3, 0], m7b5: [-9, 0, 1, 0, 1, -9], '9': [-9, 0, -1, 0, 0, -9], '6': [-9, 0, 2, 2, 2, 2], '5': [-9, 0, 2, 2, -9, -9], dim: [-9, 0, 1, 2, 1, -9], '7sus4': [-9, 0, 2, 0, 3, 0] },
  };
  const MOVABLE_FINGERS = {
    E: { '': [1, 3, 4, 2, 1, 1], m: [1, 3, 4, 1, 1, 1], '7': [1, 3, 1, 2, 1, 1], m7: [1, 3, 1, 1, 1, 1], sus4: [1, 2, 3, 4, 1, 1], '7sus4': [1, 3, 1, 4, 1, 1], '5': [1, 3, 4, 0, 0, 0] },
    A: { '': [0, 1, 2, 3, 4, 1], m: [0, 1, 3, 4, 2, 1], '7': [0, 1, 3, 1, 4, 1], m7: [0, 1, 3, 1, 2, 1], maj7: [0, 1, 3, 2, 4, 1], sus2: [0, 1, 3, 4, 1, 1], sus4: [0, 1, 2, 3, 4, 1], m7b5: [0, 1, 2, 1, 3, 0], '9': [0, 2, 1, 3, 4, 0], '6': [0, 1, 3, 3, 3, 3], '5': [0, 1, 3, 4, 0, 0], dim: [0, 1, 2, 4, 3, 0], '7sus4': [0, 1, 3, 1, 4, 1] },
  };
  const MOVABLE_D = {
    E: { '': 6.0, m: 5.6, '7': 5.6, m7: 5.2, sus4: 6.0, '7sus4': 5.6, '5': 2.6 },
    A: { '': 6.3, m: 6.0, '7': 5.5, m7: 5.3, maj7: 5.9, sus2: 5.2, sus4: 5.9, m7b5: 4.8, '9': 4.6, '6': 5.6, '5': 2.6, dim: 4.8, '7sus4': 5.7 },
  };
  function makeMovable(shape, q, rootPc) {
    const base = shape === 'E' ? 4 : 9;                      // Mi / La à vide
    let fret = mod12(rootPc - base);
    if (fret === 0) fret = 12;
    if (fret > 9) return null;
    const rel = MOVABLE[shape][q]; if (!rel) return null;
    const frets = rel.map(x => (x <= -9 ? -1 : x + fret));
    if (frets.some(f => f < -1 || f === 0 && false)) return null;
    const fingers = MOVABLE_FINGERS[shape][q].slice();
    const minF = Math.min(...frets.filter(f => f >= 0));
    const sounding = frets.map((f, i) => (f >= 0 ? i : -1)).filter(i => i >= 0);
    const barreStrings = sounding.filter(i => frets[i] === fret && fingers[i] === 1);
    const barre = q === '5' ? null : barreStrings.length >= 2 ? { fret, from: Math.min(...barreStrings), to: Math.max(...barreStrings) } : null;
    // plus haut sur le manche : cordes plus souples, mais cases plus étroites ; case 1 = la plus dure
    const d = MOVABLE_D[shape][q] + (fret === 1 ? 0.3 : fret >= 5 ? -0.3 : 0) + (minF < 1 ? 1 : 0);
    const key = T.chordSym({ root: rootPc, q }, false), sym = T.chordSym({ root: rootPc, q });
    return { id: key + '|' + shape + fret, sym, frets, fingers, d: +d.toFixed(2), barre, tags: [q === '5' ? 'power' : 'barre', 'movable'], shape, pos: fret, variant: 'barré case ' + fret + ' (forme de ' + (shape === 'E' ? 'Mi' : 'La') + ')' };
  }

  /** Notes MIDI d'une forme (null pour les cordes étouffées). */
  T.voicingNotes = v => v.frets.map((f, i) => (f >= 0 ? OPEN[i] + f : null));
  T.voicingPcs = v => Array.from(new Set(T.voicingNotes(v).filter(n => n != null).map(mod12)));

  // index des formes par symbole canonique (dièses)
  const DB = {};
  function canon(sym) { const c = T.parseChord(sym); return c ? T.chordSym(c, false) : sym; }
  for (const v of OPEN_DB) {
    v.tags = v.tags || [];
    v.canon = canon(v.sym);
    (DB[v.canon] = DB[v.canon] || []).push(v);
  }
  T.OPEN_DB = OPEN_DB;
  const BY_ID = {}; OPEN_DB.forEach(v => { BY_ID[v.id] = v; });
  /** Toutes les formes connues d'un accord (formes ouvertes d'abord, puis barrés), triées par difficulté. */
  T.voicingsFor = function (sym) {
    const c = typeof sym === 'string' ? T.parseChord(sym) : sym;
    if (!c) return [];
    const key = T.chordSym(c, false);
    const out = (DB[key] || []).slice();
    if (c.bass == null) for (const sh of ['E', 'A']) { const m = makeMovable(sh, c.q, c.root); if (m) { m.canon = key; BY_ID[m.id] = m; out.push(m); } }
    return out.sort((a, b) => a.d - b.d);
  };
  T.voicing = id => {
    if (BY_ID[id]) return BY_ID[id];
    const m = /^(.+)\|([EA])(\d+)$/.exec(id || '');
    if (m) { const c = T.parseChord(m[1]); if (c) { const v = makeMovable(m[2], c.q, c.root); if (v) { v.canon = T.chordSym(c, false); BY_ID[v.id] = v; return v; } } }
    return null;
  };
  /**
   * Meilleure forme jouable pour un symbole. Si l'accord exact n'existe pas (ex. « C#add9 »), on
   * propose une simplification (sans la basse, sans l'extension) et on le signale.
   * @returns {v, simplified: bool, as: symbole joué}
   */
  T.playable = function (sym, prefs) {
    const c = typeof sym === 'string' ? T.parseChord(sym) : sym;
    if (!c) return null;
    const key = T.chordSym(c, false);
    if (prefs && prefs[key] && T.voicing(prefs[key])) return { v: T.voicing(prefs[key]), simplified: false, as: key };
    let list = T.voicingsFor(c);
    if (list.length) return { v: list[0], simplified: false, as: T.chordSym(c, c.flat) };
    const SIMPLE = { add9: '', madd9: 'm', '6': '', m6: 'm', '9': '7', m9: 'm7', maj9: 'maj7', '11': '7sus4', '13': '7', dim7: 'dim', aug: '', mmaj7: 'm', '7sus4': '7', m7b5: 'm7b5', dim: 'm7b5', maj7: '', sus2: '', sus4: '' };
    const tries = [];
    if (c.bass != null) tries.push({ root: c.root, q: c.q });
    if (SIMPLE[c.q] != null) tries.push({ root: c.root, q: SIMPLE[c.q] });
    tries.push({ root: c.root, q: T.isMinor(c.q) ? 'm' : '' });
    for (const t of tries) {
      list = T.voicingsFor(t);
      if (list.length) return { v: list[0], simplified: true, as: T.chordSym(t, c.flat) };
    }
    return null;
  };
  /** Cordes jouées (indices) et cordes à étouffer. */
  T.sounding = v => v.frets.map((f, i) => (f >= 0 ? i : -1)).filter(i => i >= 0);
  /** Corde de basse (fondamentale) et basse alternée pour le picking. */
  T.bassStrings = function (v) {
    const s = T.sounding(v), c = T.parseChord(v.sym);
    const notes = T.voicingNotes(v);
    let rootS = s[0];
    if (c && c.bass == null) { const r = s.find(i => mod12(notes[i]) === c.root); if (r != null && r <= 2) rootS = r; }
    // basse alternée : corde de Ré pour une fondamentale sur les cordes 6 ou 5 ; La à vide pour une fondamentale sur la 4
    let alt = rootS <= 1 ? 2 : rootS === 2 ? 1 : 2;
    if (rootS <= 1 && v.frets[2] < 0) alt = rootS + 1;
    return { root: rootS, alt };
  };
  T.isBarre = v => !!(v && v.barre && v.barre.to - v.barre.from >= 3);
  /**
   * Forme jouée avec un capodastre en case `capo` : mêmes doigts, mais les cordes à vide et les cases sonnent
   * `capo` demi-tons plus haut. Sert au son des modèles et à l'analyse ; l'affichage garde la forme (`shape`).
   */
  const CAPO_CACHE = new Map();
  T.withCapo = function (v, capo) {
    if (typeof v === 'string') v = T.voicing(v);
    if (!v || !capo) return v;
    if (v.shape) v = v.shape;
    const k = v.id + '@' + capo;
    let c = CAPO_CACHE.get(k);
    if (!c) {
      c = Object.assign({}, v, { capo, shape: v, frets: v.frets.map(f => (f >= 0 ? f + capo : f)), barre: v.barre ? Object.assign({}, v.barre, { fret: v.barre.fret + capo }) : v.barre });
      CAPO_CACHE.set(k, c);
    }
    return c;
  };

  /* ---------------------------------------------------------------- changements d'accords */
  /** Positions des doigts : {doigt: {s, f}} ; barré = index sur plusieurs cordes. */
  function fingerMap(v) {
    const m = {};
    v.fingers.forEach((fg, s) => {
      if (!fg || v.frets[s] <= 0) return;
      if (!m[fg]) m[fg] = { s, f: v.frets[s], n: 1, lo: s, hi: s };
      else { m[fg].n++; m[fg].lo = Math.min(m[fg].lo, s); m[fg].hi = Math.max(m[fg].hi, s); if (s > m[fg].s) m[fg].s = s; }
    });
    return m;
  }
  /**
   * Difficulté d'un changement X → Y (0–10). Un changement est d'abord dur quand les deux formes le sont ;
   * il devient plus facile quand des doigts restent en place (pivot) ou glissent sur leur corde (guide),
   * plus dur quand tous les doigts changent de corde, qu'un barré apparaît, ou que la main se déplace.
   */
  T.transitionCost = function (a, b) {
    if (typeof a === 'string') a = T.voicing(a); if (typeof b === 'string') b = T.voicing(b);
    if (!a || !b) return NaN;
    if (a.id === b.id) return 0;
    const ma = fingerMap(a), mb = fingerMap(b);
    let moves = 0, anchors = 0;
    for (const fg of [1, 2, 3, 4, 5]) {
      const pa = ma[fg], pb = mb[fg];
      if (pa && pb) {
        if (pa.s === pb.s && pa.f === pb.f && pa.lo === pb.lo && pa.hi === pb.hi) anchors++;
        else if (pa.s === pb.s && pa.lo === pb.lo && pa.hi === pb.hi) moves += 0.3 + 0.05 * Math.abs(pa.f - pb.f);        // glisse sur sa corde
        else moves += 0.6 + 0.12 * Math.abs(pa.s - pb.s) + 0.06 * Math.abs(pa.f - pb.f) + (pa.n !== pb.n ? 0.4 : 0);
      } else if (pb && !pa) { moves += 0.55 + (fg === 4 ? 0.15 : 0) + (fg === 5 ? 0.6 : 0); }
      else if (pa && !pb) moves += 0.08;
    }
    const barreIn = T.isBarre(b) && !T.isBarre(a) ? 1.0 : T.isBarre(b) && T.isBarre(a) ? 0.25 : 0;
    const posA = Math.min(...a.frets.filter(f => f > 0).concat([99])), posB = Math.min(...b.frets.filter(f => f > 0).concat([99]));
    const shift = posA < 99 && posB < 99 ? Math.max(0, Math.abs(posA - posB) - 2) * 0.15 : 0;
    const hard = Math.max(a.d, b.d), soft = Math.min(a.d, b.d);
    const c = 0.62 * hard + 0.18 * soft + 0.85 * moves + barreIn + shift - 0.45 * anchors;
    return +Math.max(0.3, Math.min(9.5, c)).toFixed(2);
  };
  /** Clé de paire symétrique (le changement se travaille dans les deux sens). */
  T.pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);

  /* ---------------------------------------------------------------- tonalités */
  const MAJOR = [0, 2, 4, 5, 7, 9, 11];
  const NAT_MINOR = [0, 2, 3, 5, 7, 8, 10];
  T.MAJOR = MAJOR; T.NAT_MINOR = NAT_MINOR;
  const MAJ_Q = ['', 'm', 'm', '', '', 'm', 'dim'];
  const MIN_Q = ['m', 'dim', '', 'm', 'm', '', ''];
  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  /** Préférence d'altérations d'une tonalité (♭ pour Fa, Si♭, Mi♭… et leurs relatives). */
  T.keyFlats = (tonic, minor) => {
    const t = mod12(minor ? tonic + 3 : tonic);       // relative majeure
    return [5, 10, 3, 8, 1, 6].includes(t) && !(t === 6 && !minor);
  };
  T.keyName = (tonic, minor, fr) => {
    const fl = T.keyFlats(tonic, minor);
    if (fr === false) return (fl ? FLAT : SHARP)[mod12(tonic)] + (minor ? 'm' : '');
    return (fl ? FR_FLAT : FR_SHARP)[mod12(tonic)] + (minor ? ' mineur' : ' majeur');
  };
  /** Accords diatoniques d'une tonalité : [{deg, rn, sym, q}]. */
  T.diatonic = function (tonic, minor) {
    const sc = minor ? NAT_MINOR : MAJOR, qs = minor ? MIN_Q : MAJ_Q, fl = T.keyFlats(tonic, minor);
    return sc.map((iv, i) => {
      const q = qs[i], rn0 = ROMAN[i];
      const rn = q === 'm' ? rn0.toLowerCase() : q === 'dim' ? rn0.toLowerCase() + '°' : rn0;
      return { deg: i + 1, rn: minor && (i === 2 || i === 5 || i === 6) ? '♭' + rn : rn, sym: T.chordSym({ root: tonic + iv, q }, fl), q, pc: mod12(tonic + iv) };
    });
  };
  /** Chiffrage d'un accord dans une tonalité : « IV », « vi », « ♭VII », « V/V »… */
  T.roman = function (sym, tonic, minor) {
    const c = typeof sym === 'string' ? T.parseChord(sym) : sym;
    if (!c) return '?';
    const iv = mod12(c.root - tonic);
    const maj = MAJOR.indexOf(iv);
    const names = { 0: 'I', 1: '♭II', 2: 'II', 3: '♭III', 4: 'III', 5: 'IV', 6: '♯IV', 7: 'V', 8: '♭VI', 9: 'VI', 10: '♭VII', 11: 'VII' };
    const rn = names[iv];             // noms relatifs à la gamme majeure (usage pop : i–♭VI–♭III–♭VII en mineur)
    const minorQ = T.isMinor(c.q) && c.q !== 'dim' && c.q !== 'dim7' && c.q !== 'm7b5';
    let out = minorQ ? rn.toLowerCase().replace('♭', '♭').replace('♯', '♯') : rn;
    if (c.q === 'dim' || c.q === 'dim7') out = rn.toLowerCase() + '°';
    if (c.q === 'm7b5') out = rn.toLowerCase() + 'ø';
    const ext = { '7': '7', m7: '7', maj7: 'maj7', sus2: 'sus2', sus4: 'sus4', add9: 'add9', '6': '6', m6: '6', '9': '9', '5': '5' }[c.q] || '';
    void maj;
    return out + ext + (c.bass != null ? '/' + ({ 0: '1', 2: '2', 3: '♭3', 4: '3', 5: '4', 7: '5', 9: '6', 10: '♭7', 11: '7' }[mod12(c.bass - tonic)] || '?') : '');
  };
  /** Fonction harmonique (tonique, sous-dominante, dominante) en majeur. */
  T.functionOf = function (sym, tonic) {
    const c = T.parseChord(sym); if (!c) return null;
    const iv = mod12(c.root - tonic);
    if (iv === 0 || iv === 9 || iv === 4) return 'tonique';
    if (iv === 5 || iv === 2 || iv === 8 || iv === 10) return 'sous-dominante';
    if (iv === 7 || iv === 11) return 'dominante';
    return null;
  };
  /**
   * Tonalité la plus probable d'une suite d'accords : accords diatoniques (+2), emprunts courants (+0,6),
   * accords étrangers (−1,2), premier et dernier accord sur la tonique (+1,5 / +2), cadence V→I (+1).
   * @returns {tonic, minor, score, alt}
   */
  T.detectKey = function (syms) {
    const cs = syms.map(s => (typeof s === 'string' ? T.parseChord(s) : s)).filter(Boolean);
    if (!cs.length) return null;
    const scores = [];
    for (let tonic = 0; tonic < 12; tonic++) for (const minor of [false, true]) {
      const dia = T.diatonic(tonic, minor);
      let sc = 0;
      cs.forEach((c, i) => {
        const base = T.isMinor(c.q) ? (c.q === 'dim' || c.q === 'm7b5' || c.q === 'dim7' ? 'dim' : 'm') : (c.q === '5' ? '?' : '');
        const d = dia.find(x => x.pc === c.root);
        if (d && (d.q === base || base === '?' || (d.q === 'dim' && (c.q === 'm7b5' || c.q === 'dim')))) sc += 2;
        else {
          const iv = mod12(c.root - tonic);
          // emprunts fréquents : ♭VII, iv, ♭VI, ♭III en majeur ; V majeur et IV majeur en mineur
          const borrowed = !minor ? ((iv === 10 || iv === 8 || iv === 3) && base === '') || (iv === 5 && base === 'm')
            : (iv === 7 && base === '') || (iv === 5 && base === '');
          const secondary = !minor && (iv === 2 || iv === 4 || iv === 9) && base === '';          // V/V, V/vi, V/ii
          sc += borrowed ? 0.6 : secondary ? 0.2 : -1.2;
        }
        if (i > 0 && mod12(cs[i - 1].root - tonic) === 7 && c.root === tonic) sc += 1;
      });
      const tq = minor ? 'm' : '';
      const isTonic = c => c.root === tonic && (T.isMinor(c.q) ? 'm' : '') === tq;
      // dans une boucle, le premier accord est le meilleur indice ; le dernier compte moins
      if (isTonic(cs[0])) sc += 2;
      if (isTonic(cs[cs.length - 1])) sc += 1;
      // fréquence de l'accord de tonique
      sc += 0.5 * cs.filter(isTonic).length / cs.length * 4;
      scores.push({ tonic, minor, score: sc - (minor ? 0.4 : 0) });
    }
    scores.sort((a, b) => b.score - a.score);
    return Object.assign({}, scores[0], { alt: scores[1] });
  };

  /* ---------------------------------------------------------------- capodastre */
  /**
   * Capodastre le plus confortable pour une suite d'accords (sons réels) : pour chaque position 0–9,
   * on transpose les accords vers les formes à jouer, on additionne la difficulté des formes et des
   * changements, et l'on garde le meilleur (à égalité : le capo le plus bas).
   * @returns [{capo, shapes:[sym], cost, hard: nb de barrés}] trié
   */
  T.capoOptions = function (syms, o) {
    o = o || {};
    const seq = syms.map(s => T.parseChord(s)).filter(Boolean);
    if (!seq.length) return [];
    const out = [];
    for (let capo = 0; capo <= (o.maxCapo != null ? o.maxCapo : 7); capo++) {
      const shapes = seq.map(c => T.chordSym({ root: c.root - capo, q: c.q, bass: c.bass != null ? c.bass - capo : null }, false));
      const uniq = Array.from(new Set(shapes));
      let cost = 0, hard = 0, ok = true;
      const vs = {};
      for (const s of uniq) {
        const p = T.playable(s);
        if (!p) { ok = false; break; }
        vs[s] = p.v;
        cost += p.v.d + (p.simplified ? 0.8 : 0);
        if (T.isBarre(p.v)) hard++;
      }
      if (!ok) continue;
      let tc = 0, nt = 0;
      for (let i = 1; i < shapes.length; i++) if (shapes[i] !== shapes[i - 1]) { tc += T.transitionCost(vs[shapes[i - 1]], vs[shapes[i]]); nt++; }
      // au-delà de la case 5, le son s'amincit et les cases rétrécissent : petite pénalité
      const total = cost / uniq.length * 0.5 + (nt ? tc / nt : 0) + Math.max(...uniq.map(s => vs[s].d)) * 0.35 + (capo <= 5 ? capo * 0.04 : 0.2 + 0.3 * (capo - 5));
      out.push({ capo, shapes: uniq.map(s => T.chordSym(T.parseChord(s))), voicings: uniq.map(s => vs[s].id), cost: +total.toFixed(2), hard });
    }
    return out.sort((a, b) => a.cost - b.cost || a.capo - b.capo);
  };
  /** Tonalité réelle d'une forme jouée avec capo. */
  T.soundingSym = (shapeSym, capo) => T.transposeSym(shapeSym, capo);

  /* ---------------------------------------------------------------- rythmiques et arpèges */
  // slots : D = vers le bas, U = vers le haut, X = frappe étouffée (« chuck »), . = main qui passe sans toucher.
  // sig : temps par mesure ; sub : subdivisions par temps (2 = croches, 4 = doubles croches).
  // Le balancier : en croches, D sur les temps et U sur les « et » ; en doubles, D sur les croches, U entre.
  const SP = (id, name, sig, sub, slots, o) => Object.assign({ id, name, sig, sub, slots }, o || {});
  T.STRUMS = [
    SP('r0', 'Un coup par accord', 4, 2, 'D.......', { d: 0.2, family: 'base', desc: 'Un seul coup au début de chaque mesure, et on laisse sonner : idéal pour apprendre une grille.' }),
    SP('r1', 'Noires', 4, 2, 'D.D.D.D.', { d: 0.5, family: 'base', desc: 'Un coup vers le bas sur chaque temps : la pulsation pure.' }),
    SP('r2', 'Croches', 4, 2, 'DUDUDUDU', { d: 1.4, family: 'base', desc: 'Bas sur les temps, haut sur les « et » : le balancier ne s’arrête jamais.' }),
    SP('r3', 'Folk', 4, 2, 'D.DUD.DU', { d: 1.6, family: 'folk', desc: '« Bas, bas-haut, bas, bas-haut » : la base du folk.' }),
    SP('r4', 'Pop syncopée', 4, 2, 'D.DU.UDU', { d: 3.0, family: 'pop', desc: '« Bas, bas-haut, -haut-bas-haut » : la rythmique pop la plus utilisée. Le bas du 3e temps manque : la main passe sans toucher.' }),
    SP('r5', 'Contretemps', 4, 2, '.U.U.U.U', { d: 3.4, family: 'reggae', desc: 'Seulement les « et » vers le haut : le balancier continue en silence sur les temps.' }),
    SP('r6', 'Ballade', 4, 2, 'D.D.DUDU', { d: 1.7, family: 'pop', desc: 'Calme puis plus dense en fin de mesure.' }),
    SP('r7', 'Percussive noires', 4, 2, 'D.X.D.X.', { d: 2.4, family: 'perc', desc: 'Frappe étouffée (« chuck ») sur 2 et 4 : la caisse claire de ta guitare.' }),
    SP('r8', 'Percussive croches', 4, 2, 'D.XUDUXU', { d: 3.4, family: 'perc', desc: 'Basse, frappe, et des allers-retours : le groove acoustique pop.' }),
    SP('r9', 'Percussive pop', 4, 2, 'D.XU.UXU', { d: 4.2, family: 'perc', desc: 'La pop syncopée avec la frappe sur 2 et 4.' }),
    SP('r10', 'Valse', 3, 2, 'D.DUDU', { d: 1.9, family: 'ternaire', desc: 'Trois temps : « bas, bas-haut, bas-haut ».' }),
    SP('r11', 'Galop', 4, 4, 'D.DUD.DUD.DUD.DU', { d: 4.3, family: 'folk', desc: 'En doubles croches : « bas, bas-haut » sur chaque temps.' }),
    SP('r12', 'Funk acoustique', 4, 4, 'D.DUX.DUD.DUX.DU', { d: 5.4, family: 'perc', desc: 'Doubles croches avec frappe sur 2 et 4.' }),
    SP('r13', 'Pop percussive (16)', 4, 4, 'D..UX..U.UDUX.DU', { d: 6.5, family: 'perc', desc: 'Doubles croches syncopées et frappes : le style acoustique-pop moderne en solo.' }),
    SP('r14', 'Pop 16 syncopée', 4, 4, 'D..UD.DU.UDUD.DU', { d: 5.8, family: 'pop', desc: 'Syncopes en doubles croches, sans frappe.' }),
  ];
  const STRUM_BY = {}; T.STRUMS.forEach(p => { STRUM_BY[p.id] = p; });
  T.strum = id => STRUM_BY[id] || null;
  /** Événements d'une rythmique sur une mesure : [{slot, beat (en temps), k}]. */
  T.strumEvents = function (p) {
    const out = [];
    for (let i = 0; i < p.slots.length; i++) { const k = p.slots[i]; if (k !== '.') out.push({ slot: i, beat: i / p.sub, k }); }
    return out;
  };
  /**
   * Difficulté d'une rythmique (indépendante du tempo) : densité, coups vers le haut, syncopes (coup sur une
   * position faible suivi d'un silence sur la position forte suivante), doubles croches, frappes.
   */
  T.strumCost = function (p) {
    if (p.d != null) return p.d;                       // rythmiques du catalogue : difficulté fixée à la main
    const ev = T.strumEvents(p);
    const L = p.slots.length;
    let sync = 0;
    for (let i = 0; i < L; i++) {
      const strong = i % p.sub === 0;
      const next = (i + 1) % L;
      if (!strong && p.slots[i] !== '.' && next % p.sub === 0 && p.slots[next] === '.') sync++;
    }
    const ups = ev.filter(e => e.k === 'U').length, chucks = ev.filter(e => e.k === 'X').length;
    const rests = p.slots.split('').filter((k, i) => k === '.' && i % p.sub === 0 && i > 0).length;   // temps « sautés »
    const dens = ev.length / (p.sig * 2);
    let c = 0.4 + 0.5 * dens + 0.12 * ups * 8 / L + 0.85 * sync + 0.45 * rests + 0.55 * chucks * 8 / L + (p.sub === 4 ? 1.7 : 0) + (p.sig === 3 ? 0.3 : 0);
    if (p.slots.replace(/\./g, '').split('').every(k => k === 'U')) c += 0.8;   // contretemps purs
    return +Math.min(9, c).toFixed(2);
  };
  /** Comptage affiché sous une rythmique : « 1 & 2 & » ou « 1 e & a ». */
  T.countLabels = p => {
    const out = [];
    for (let b = 0; b < p.sig; b++) for (let s = 0; s < p.sub; s++) out.push(s === 0 ? String(b + 1) : p.sub === 2 ? '&' : ['', 'e', '&', 'a'][s]);
    return out;
  };

  // Arpèges : p = pouce (basse), P = basse alternée, i/m/a = cordes 3/2/1 ; « pa » = pincé (deux notes ensemble).
  const PP = (id, name, sig, sub, toks, o) => Object.assign({ id, name, sig, sub, toks }, o || {});
  T.PICKS = [
    PP('f0', 'Pouce seul (basse alternée)', 4, 2, ['p', '.', 'P', '.', 'p', '.', 'P', '.'], { d: 1.0, desc: 'Le pouce seul, une basse par temps, en alternant deux cordes : le socle de tout le jeu aux doigts.' }),
    PP('f0b', 'Pouce puis doigts', 4, 2, ['p', '.', 'i', '.', 'm', '.', 'i', '.'], { d: 1.5, desc: 'Une note par temps : pouce, index, majeur, index.' }),
    PP('f1', 'Arpège p-i-m-a', 4, 2, ['p', 'i', 'm', 'a', 'p', 'i', 'm', 'a'], { d: 2.2, desc: 'Pouce sur la basse, puis index, majeur, annulaire.' }),
    PP('f2', 'Arpège aller-retour', 4, 2, ['p', 'i', 'm', 'a', 'm', 'i', 'm', 'i'], { d: 2.6, desc: 'On monte, on redescend : idéal pour les ballades.' }),
    PP('f3', 'Folk p-i-m-i', 4, 2, ['p', 'i', 'm', 'i', 'P', 'i', 'm', 'i'], { d: 3.2, desc: 'Basse alternée sur les temps 1 et 3.' }),
    PP('f4', 'Travis', 4, 2, ['p', 'm', 'P', 'i', 'p', 'm', 'P', 'i'], { d: 4.5, desc: 'Le pouce alterne les basses sur chaque temps, les doigts jouent entre : le moteur du fingerstyle.' }),
    PP('f5', 'Travis pincé', 4, 2, ['pa', 'm', 'P', 'i', 'p', 'm', 'P', 'i'], { d: 5.2, desc: 'Comme le Travis, avec la basse et l’aigu pincés ensemble sur le 1.' }),
    PP('f6', 'Valse p-i-m', 3, 2, ['p', 'i', 'm', 'a', 'm', 'i'], { d: 2.6, desc: 'Arpège à trois temps.' }),
    PP('f7', 'Travis syncopé', 4, 2, ['pa', 'i', 'P', 'm', 'p', 'a', 'P', 'i'], { d: 6.3, desc: 'Travis avec des aigus déplacés : plus chantant, plus dur.' }),
  ];
  const PICK_BY = {}; T.PICKS.forEach(p => { PICK_BY[p.id] = p; });
  T.pick = id => PICK_BY[id] || null;
  T.pickCost = function (p) {
    if (p.d != null) return p.d;
    const toks = p.toks.filter(t => t !== '.');
    const pinch = toks.filter(t => t.length > 1).length;
    const alt = toks.includes('P') ? 1 : 0;
    const travis = toks.filter((t, i) => i % 2 === 0 && (t[0] === 'p' || t[0] === 'P')).length === toks.length / 2 && alt ? 1 : 0;
    let changes = 0; for (let i = 1; i < toks.length; i++) if (toks[i] !== toks[i - 1]) changes++;
    const c = 1.6 + 0.6 * alt + 1.4 * travis + 0.7 * pinch + 0.08 * changes + (p.id === 'f7' ? 1.2 : 0) + (p.sig === 3 ? 0.2 : 0);
    return +Math.min(9, c).toFixed(2);
  };
  /** Corde jouée par un jeton d'arpège pour une forme donnée. */
  T.pickString = function (tok, v) {
    const b = T.bassStrings(v);
    return { p: b.root, P: b.alt, i: 3, m: 4, a: 5 }[tok];
  };

  /* ---------------------------------------------------------------- progressions (composition, oreille) */
  T.PROGRESSIONS = [
    { id: 'axis', deg: ['I', 'V', 'vi', 'IV'], name: 'I–V–vi–IV', mood: 'lumineuse, entraînante', ex: 'Let It Be (Beatles), With or Without You (U2), Someone Like You (Adele)' },
    { id: 'sens', deg: ['vi', 'IV', 'I', 'V'], name: 'vi–IV–I–V', mood: 'mélancolique, puis porteuse', ex: 'Zombie (The Cranberries)' },
    { id: '50s', deg: ['I', 'vi', 'IV', 'V'], name: 'I–vi–IV–V', mood: 'tendre, rétro', ex: 'Stand By Me (Ben E. King), Perfect (Ed Sheeran : G–Em–C–D, capo 1)' },
    { id: 'pop4', deg: ['I', 'IV', 'vi', 'V'], name: 'I–IV–vi–V', mood: 'optimiste, ouverte', ex: 'pop acoustique' },
    { id: 'walk', deg: ['I', 'I/3', 'IV', 'V'], name: 'I–I/3–IV–V', mood: 'qui monte doucement (basse marchante)', ex: 'Thinking Out Loud (Ed Sheeran : D–D/F♯–G–A)' },
    { id: 'iivi', deg: ['ii', 'V', 'I'], name: 'ii–V–I', mood: 'cadence élégante (jazz, bossa)', ex: 'standards de jazz' },
    { id: 'mixo', deg: ['I', '♭VII', 'IV', 'I'], name: 'I–♭VII–IV–I', mood: 'rock, ouverte, un peu « sauvage »', ex: 'Sweet Child O’ Mine (Guns N’ Roses, couplet)' },
    { id: 'minpop', deg: ['vi', 'IV', 'I', 'V'], minor: false, name: 'i–VI–III–VII (en relatif)', mood: 'sombre mais dansante', ex: 'Despacito (Si mineur : Bm–G–D–A)' },
    { id: 'shape', deg: ['vi', 'ii', 'IV', 'V'], name: 'vi–ii–IV–V (i–iv–VI–VII)', mood: 'mineure et groovy', ex: 'Shape of You (Ed Sheeran : C♯m–F♯m–A–B)' },
    { id: 'andal', deg: ['vi', 'V', 'IV', 'III'], name: 'Cadence andalouse (i–♭VII–♭VI–V)', mood: 'dramatique, espagnole', ex: 'Hit the Road Jack (Am–G–F–E)' },
    { id: 'canon', deg: ['I', 'V', 'vi', 'iii', 'IV', 'I', 'IV', 'V'], name: 'Canon (Pachelbel)', mood: 'solennelle, émouvante', ex: 'Canon de Pachelbel, d’innombrables chansons pop' },
    { id: 'plagal', deg: ['I', 'IV', 'I', 'V'], name: 'I–IV–I–V', mood: 'simple, folk', ex: 'chansons folk et country' },
  ];
  /** Accord d'un degré (« vi », « ♭VII », « I/3 ») dans une tonalité majeure. */
  T.degreeChord = function (rn, tonic, flats) {
    const m = /^(♭|b)?(I|II|III|IV|V|VI|VII|i|ii|iii|iv|v|vi|vii)(°|ø)?(7|maj7)?(\/3|\/5)?$/.exec(rn);
    if (!m) return null;
    const idx = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'].indexOf(m[2].toUpperCase());
    let pc = mod12(tonic + MAJOR[idx] - (m[1] ? 1 : 0));
    const minor = m[2] === m[2].toLowerCase();
    let q = m[3] === '°' ? 'dim' : m[3] === 'ø' ? 'm7b5' : minor ? 'm' : '';
    if (m[4] === '7') q = q === 'm' ? 'm7' : q === '' ? '7' : q;
    if (m[4] === 'maj7') q = 'maj7';
    let bass = null;
    if (m[5] === '/3') bass = mod12(pc + (minor ? 3 : 4));
    if (m[5] === '/5') bass = mod12(pc + 7);
    const fl = flats != null ? flats : m[1] ? true : T.keyFlats(tonic, false);   // ♭VI, ♭VII : bémols (Mi♭, pas Ré♯)
    return T.chordSym({ root: pc, q, bass }, fl);
  };
  // Tendances des enchaînements en pop/rock (heuristique inspirée des corpus : I et IV dominent,
  // IV mène volontiers à I, V à I ou vi, vi à IV) — sert à proposer « et après ? » en composition.
  const NEXT = {
    I: { IV: 0.3, V: 0.25, vi: 0.2, ii: 0.08, iii: 0.04, '♭VII': 0.06, 'I/3': 0.07 },
    'I/3': { IV: 0.55, ii: 0.2, V: 0.15, vi: 0.1 },
    ii: { V: 0.5, IV: 0.15, I: 0.12, vi: 0.1, iii: 0.05 },
    iii: { vi: 0.45, IV: 0.35, ii: 0.1, I: 0.1 },
    IV: { I: 0.32, V: 0.28, vi: 0.12, ii: 0.08, iv: 0.06, '♭VII': 0.05, 'I/3': 0.04, iii: 0.05 },
    iv: { I: 0.6, V: 0.25, '♭VII': 0.15 },
    V: { I: 0.4, vi: 0.3, IV: 0.2, ii: 0.05, iii: 0.05 },
    vi: { IV: 0.4, V: 0.22, ii: 0.12, I: 0.12, iii: 0.08, iv: 0.06 },
    '♭VII': { IV: 0.45, I: 0.45, V: 0.1 },
    '♭VI': { '♭VII': 0.5, V: 0.3, I: 0.2 },
  };
  const WHY = {
    'I>IV': 'I → IV : le départ le plus courant, on s’éloigne de la maison en douceur.',
    'I>V': 'I → V : ouverture franche, crée une attente.',
    'I>vi': 'I → vi : même ambiance mais plus sombre (accords relatifs, 2 notes communes).',
    'IV>I': 'IV → I : retour « amen » (plagal), très fréquent en pop et rock.',
    'IV>V': 'IV → V : la tension monte avant la résolution.',
    'V>I': 'V → I : la résolution la plus forte (cadence parfaite).',
    'V>vi': 'V → vi : résolution « trompée » : surprise mélancolique.',
    'vi>IV': 'vi → IV : le cœur des progressions pop (I–V–vi–IV).',
    'ii>V': 'ii → V : prépare la dominante (ii–V–I).',
    'iii>vi': 'iii → vi : descente par quintes, très fluide.',
    '♭VII>I': '♭VII → I : retour rock (emprunt au mode mixolydien).',
    'IV>iv': 'IV → iv : l’accord mineur emprunté, nostalgie garantie.',
    'iv>I': 'iv → I : résolution douce-amère.',
  };
  /**
   * Suggestions du prochain accord (degrés) après une progression, avec la raison. Complète aussi les
   * boucles connues : après I–V–vi, propose IV (I–V–vi–IV).
   */
  T.suggestNext = function (degs) {
    const last = degs[degs.length - 1] || 'I';
    const scores = {};
    Object.entries(NEXT[last] || NEXT.I).forEach(([k, v]) => { scores[k] = (scores[k] || 0) + v; });
    for (const p of T.PROGRESSIONS) {
      const L = p.deg.length;
      for (let off = 0; off < L; off++) {
        const rot = p.deg.slice(off).concat(p.deg.slice(0, off));
        const n = Math.min(degs.length, L - 1);
        if (n < 2) continue;
        const tail = degs.slice(-n), head = rot.slice(0, n);
        if (tail.every((d, i) => d === head[i])) scores[rot[n]] = (scores[rot[n]] || 0) + 0.25 * n;
      }
    }
    // éviter de rester sur le même accord
    delete scores[last];
    return Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([deg, sc]) => ({ deg, score: +sc.toFixed(2), why: WHY[last + '>' + deg] || null }));
  };

  /* ---------------------------------------------------------------- grilles de chansons */
  const SECTION_RE = /^\s*[\[{(]?\s*(intro|couplet|verse|refrain|chorus|pré-?refrain|pre-?chorus|prechorus|pont|bridge|outro|fin|coda|solo|interlude|instrumental|break|riff|hook|post-?chorus|tag|ending|start_of_chorus|soc|start_of_verse|sov)\b[^\]})]*[\]})]?\s*:?\s*$/i;
  const SECTION_FR = { intro: 'Intro', couplet: 'Couplet', verse: 'Couplet', refrain: 'Refrain', chorus: 'Refrain', 'pré-refrain': 'Pré-refrain', prerefrain: 'Pré-refrain', 'pre-chorus': 'Pré-refrain', prechorus: 'Pré-refrain', pont: 'Pont', bridge: 'Pont', outro: 'Outro', fin: 'Outro', coda: 'Outro', ending: 'Outro', solo: 'Solo', interlude: 'Interlude', instrumental: 'Interlude', break: 'Break', riff: 'Riff', hook: 'Refrain', 'post-chorus': 'Post-refrain', postchorus: 'Post-refrain', tag: 'Outro', start_of_chorus: 'Refrain', soc: 'Refrain', start_of_verse: 'Couplet', sov: 'Couplet' };
  function sectionName(line) {
    const m = SECTION_RE.exec(line);
    if (!m) return null;
    const k = m[1].toLowerCase().replace(/\s/g, '');
    let nm = SECTION_FR[k] || SECTION_FR[k.replace('-', '')] || 'Section';
    const num = /(\d+)/.exec(line); if (num && nm !== 'Refrain') nm += ' ' + num[1];
    return nm;
  }
  /** Jetons d'une ligne qui ressemblent à des accords (« | », « x2 », « N.C. », « / » tolérés). */
  function chordTokens(line) {
    const toks = line.replace(/[|‖]/g, ' | ').split(/\s+/).filter(Boolean);
    const chords = [], bars = [];
    let cur = [], other = 0, any = 0;
    for (const t0 of toks) {
      const t = t0.replace(/^[(\[]|[)\],.;:]$/g, '');
      if (t === '|' || t === '||' || t === ':|' || t === '|:' ) { if (cur.length) { bars.push(cur); cur = []; } continue; }
      if (/^(x\d+|\d+x|×\d+|\(x\d+\)|%|\/|-|–|N\.?C\.?|n\.c\.|\.\.\.|\*)$/i.test(t)) { if (t === '/' || t === '%') { cur.push(t === '%' ? '%' : '/'); } continue; }
      const c = T.parseChord(t);
      if (c) { chords.push(c.sym); cur.push(c.sym); any++; } else other++;
    }
    if (cur.length) bars.push(cur);
    return { chords, bars, other, any };
  }
  /**
   * Lit une grille collée (ChordPro, accords au-dessus des paroles, ou mesures « | C | G | Am | F | »).
   * Les paroles restent sur le téléphone ; on en garde le texte pour l'affichage.
   * @returns {title, artist, capo, tempo, key, sections:[{name, lines:[{chords, lyrics, bars}]}], seq, uniq, warnings}
   */
  T.parseSong = function (text) {
    const out = { title: '', artist: '', capo: null, tempo: null, key: null, sections: [], seq: [], uniq: [], warnings: [] };
    const lines = String(text || '').replace(/\r/g, '').split('\n');
    let sec = null;
    const newSec = name => { sec = { name, lines: [] }; out.sections.push(sec); };
    const ensure = () => { if (!sec) newSec('Couplet'); };
    let pendingChords = null;
    for (let raw of lines) {
      const line = raw.replace(/\t/g, '    ');
      const trimmed = line.trim();
      if (!trimmed) { if (pendingChords) { ensure(); sec.lines.push(pendingChords); pendingChords = null; } continue; }
      // directives ChordPro
      const dir = /^\{\s*([a-z_]+)\s*:?\s*(.*?)\s*\}$/i.exec(trimmed);
      if (dir) {
        const k = dir[1].toLowerCase(), v = dir[2];
        if (k === 'title' || k === 't') out.title = v;
        else if (k === 'artist' || k === 'subtitle' || k === 'st') out.artist = out.artist || v;
        else if (k === 'capo') out.capo = parseInt(v, 10) || 0;
        else if (k === 'tempo') out.tempo = parseFloat(v) || null;
        else if (k === 'key') out.key = v;
        else if (k === 'comment' || k === 'c' || k === 'ci') { const nm = sectionName(v) || (v && v.length < 24 ? v : null); if (nm) newSec(nm); }
        else { const nm = sectionName(k); if (nm && !/^end/.test(k)) newSec(nm); }
        continue;
      }
      // métadonnées en clair
      let mm;
      if ((mm = /^\s*capo\s*:?\s*(\d+)/i.exec(trimmed)) || (mm = /^\(?\s*capo\s+(?:sur\s+(?:la\s+)?|on\s+)?(\d+)/i.exec(trimmed))) { out.capo = parseInt(mm[1], 10); continue; }
      if ((mm = /^\s*(?:tempo|bpm)\s*:?\s*(\d+)/i.exec(trimmed))) { out.tempo = parseInt(mm[1], 10); continue; }
      if ((mm = /^\s*(?:titre|title)\s*:\s*(.+)$/i.exec(trimmed))) { out.title = mm[1].trim(); continue; }
      if ((mm = /^\s*(?:artiste|artist)\s*:\s*(.+)$/i.exec(trimmed))) { out.artist = mm[1].trim(); continue; }
      if ((mm = /^\s*(?:tonalité|key)\s*:\s*(.+)$/i.exec(trimmed))) { out.key = mm[1].trim(); continue; }
      const sn = sectionName(trimmed);
      if (sn) { if (pendingChords) { ensure(); sec.lines.push(pendingChords); pendingChords = null; } newSec(sn); continue; }
      // « Intro: | C | G | » : section + accords sur la même ligne
      const inl = /^\s*\[?(intro|outro|couplet|verse|refrain|chorus|pont|bridge|solo|interlude)\s*\d*\]?\s*:\s*(.+)$/i.exec(trimmed);
      if (inl) {
        const tk = chordTokens(inl[2]);
        if (tk.any && tk.other === 0) { newSec(sectionName(inl[1]) || 'Section'); sec.lines.push({ chords: tk.chords, bars: tk.bars, lyrics: '' }); continue; }
      }
      // ChordPro en ligne : « [C]paroles [G]suite »
      if (/\[[^\]]{1,10}\]/.test(trimmed)) {
        const chords = []; let lyrics = '', ok = true;
        trimmed.replace(/\[([^\]]+)\]|([^\[]+)/g, (m0, ch, txt) => { if (ch) { const c = T.parseChord(ch); if (c) chords.push(c.sym); else ok = false; } else lyrics += txt; return m0; });
        if (ok && chords.length) { if (pendingChords) { ensure(); sec.lines.push(pendingChords); pendingChords = null; } ensure(); sec.lines.push({ chords, lyrics: lyrics.trim(), bars: null }); continue; }
      }
      const tk = chordTokens(trimmed);
      const isChordLine = tk.any > 0 && tk.other <= Math.max(0, Math.floor(tk.any / 4)) && tk.any >= tk.other * 3;
      if (isChordLine) {
        if (pendingChords) { ensure(); sec.lines.push(pendingChords); }
        const hasBars = /\|/.test(trimmed);
        pendingChords = { chords: tk.chords, bars: hasBars ? tk.bars : null, lyrics: '' };
        if (hasBars) { ensure(); sec.lines.push(pendingChords); pendingChords = null; }
        continue;
      }
      // paroles
      ensure();
      if (pendingChords) { pendingChords.lyrics = trimmed; sec.lines.push(pendingChords); pendingChords = null; }
      else sec.lines.push({ chords: [], lyrics: trimmed, bars: null });
    }
    if (pendingChords) { ensure(); sec.lines.push(pendingChords); }
    out.sections = out.sections.filter(s => s.lines.some(l => l.chords.length || l.lyrics));
    for (const s of out.sections) for (const l of s.lines) for (const c of l.chords) out.seq.push(c);
    out.uniq = Array.from(new Set(out.seq));
    if (!out.seq.length) out.warnings.push('Aucun accord reconnu : colle la grille avec les accords (ex. « C G Am F » ou « [C]paroles »).');
    return out;
  };
  /** Changements d'accords d'une suite (paires dans l'ordre, sans répétition consécutive), avec leur nombre. */
  T.transitionsOf = function (seq) {
    const m = {};
    for (let i = 1; i < seq.length; i++) {
      if (seq[i] === seq[i - 1]) continue;
      const k = T.pairKey(seq[i - 1], seq[i]);
      m[k] = (m[k] || 0) + 1;
    }
    return Object.entries(m).map(([k, n]) => ({ key: k, a: k.split('|')[0], b: k.split('|')[1], n })).sort((x, y) => y.n - x.n);
  };
  /** Réécrit une suite d'accords (ex. avec un capo) : chaque symbole transposé de −capo vers les formes jouées. */
  T.shapesFor = (seq, capo) => seq.map(s => T.transposeSym(s, -(capo || 0), false));
  /** Changements par minute exigés par une chanson : tempo / temps par accord. */
  T.requiredCpm = (tempo, beatsPerChord) => tempo / Math.max(1, beatsPerChord || 4);

  /** Grille en texte ChordPro (export d'une idée ou d'une chanson). */
  T.toChordPro = function (song) {
    let s = '';
    if (song.title) s += '{title: ' + song.title + '}\n';
    if (song.artist) s += '{artist: ' + song.artist + '}\n';
    if (song.capo) s += '{capo: ' + song.capo + '}\n';
    if (song.tempo) s += '{tempo: ' + song.tempo + '}\n';
    for (const sec of song.sections || []) {
      s += '\n{comment: ' + sec.name + '}\n';
      for (const l of sec.lines) s += (l.bars ? '| ' + l.bars.map(b => b.join(' ')).join(' | ') + ' |' : l.chords.map(c => '[' + c + ']').join(' ') + (l.lyrics ? ' ' + l.lyrics : '')) + '\n';
    }
    return s;
  };

  AC.theory = T;
  if (typeof module !== 'undefined' && module.exports) module.exports = T;
})(typeof globalThis !== 'undefined' ? globalThis : this);
