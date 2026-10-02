/* ==== catalog.js ==== */
/* ACCORD — bibliothèque d'exercices.
   Chaque exercice : paramètres → difficulté (même échelle 0–10 que les niveaux), étapes (modèle écouté,
   préparation, prise au micro), analyse, jugement et retour. Les consignes tournent l'attention vers l'effet
   produit — le son de chaque corde, le groove — plutôt que vers le corps (Wulf 2013 ; Duke, Cash & Allen 2011
   chez les pianistes). Le modèle sonore est écouté avant de jouer (Cash et al. 2014). */
(function (root) {
  'use strict';
  const AC = root.AC || (root.AC = {});
  const req = n => (typeof require !== 'undefined' ? require(n) : null);
  const T = AC.theory || req('./theory.js');
  const M = AC.model || req('./model.js');
  const C = {};

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const f0 = v => Math.round(v);
  const fr1 = v => Number(v).toFixed(1).replace('.', ',');
  const P = s => T.pretty(s);
  const vName = id => { const v = T.voicing(id); return v ? P(v.sym) + (v.variant ? ' (' + v.variant + ')' : '') : id; };
  const vSym = id => { const v = T.voicing(id); return v ? P(v.sym) : id; };
  C.vName = vName; C.vSym = vSym;
  function rng(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
  C.rng = rng;
  const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];

  /* ---------------------------------------------------------------- vocabulaire d'accords */
  // Ordre d'apprentissage : formes faciles et utiles d'abord (Mi mineur, La sus2…), puis les accords des chansons
  // pop (Sol, Do, Ré, La mineur), les couleurs (sus, add9, maj7), la famille « pop » à doigts fixes
  // (Sol 4 doigts, Cadd9, Em7, Dsus4) et enfin les barrés. Un seul nouvel accord par séance au plus :
  // deux gestes nouveaux et proches se gênent pendant la consolidation (Allen 2013).
  C.VOCAB_ORDER = ['Em', 'Asus2', 'E', 'Am', 'A', 'D', 'G', 'C', 'Em7', 'Dsus2', 'Am7', 'E7', 'A7', 'Dm', 'G-pop', 'Cadd9', 'Em7-pop', 'Dsus4', 'D7', 'G7', 'Cmaj7', 'Fmaj7', 'B7', 'Am-b3', 'F-mini', 'Asus4', 'Esus4', 'Am7-b4', 'G/B', 'D/F#', 'C7', 'Bm7', 'Bm-mini', 'A|E5', 'F', 'Bm', 'F#m', 'B', 'C#m', 'Gm', 'Cm', 'Bb'];
  C.isBarreId = id => { const v = T.voicing(id); return !!v && T.isBarre(v); };

  /* ---------------------------------------------------------------- barèmes de difficulté */
  // Tolérance de justesse rythmique (écart moyen au clic, ms) : ±70 → 0 ; ±22 → 3,6
  C.TOLS = [70, 55, 45, 35, 28, 22];
  C.tolCost = tol => 3.6 * Math.log2(70 / tol) / Math.log2(70 / 22);
  /** Tempo d'une rythmique : au-delà de 80 (croches) ou 65 (doubles), chaque doublement coûte ≈ 2,2 ; très lent aussi. */
  C.tempoCost = (sub, tempo) => {
    const ref = sub === 4 ? 65 : 80;
    let c = tempo > ref ? 2.2 * Math.log2(tempo / ref) : 0;
    if (tempo < 62) c += 0.03 * (62 - tempo);
    return c;
  };
  /** Changements libres : difficulté d'atteindre `cpm` changements/min sur une paire de coût `cost`. */
  C.dMinute = (cost, cpm) => 0.35 * cost - 1.6 + 7.2 * Math.pow(Math.max(1, cpm) / 100, 0.8);
  /** Inverse : changements/min attendus à un niveau donné (θ = d) pour une paire. */
  C.cpmAt = (cost, th) => 100 * Math.pow(Math.max(0.01, (th + 1.6 - 0.35 * cost) / 7.2), 1 / 0.8);
  /** Changements en rythme : `rate` changements/min imposés par le tempo, plus exigeant que libre (à l'heure). */
  C.dRhythmChange = (cost, rate) => 0.35 * cost - 1.0 + 7.2 * Math.pow(Math.max(1, rate * 1.35) / 100, 0.8);
  const pairCost = (a, b) => T.transitionCost(a, b);
  C.pairCost = pairCost;
  const meanCost = seq => { let s = 0, n = 0; for (let i = 0; i < seq.length; i++) { const a = seq[i], b = seq[(i + 1) % seq.length]; if (a !== b) { s += pairCost(a, b); n++; } } return n ? s / n : 0; };
  C.seqCost = meanCost;

  /* ---------------------------------------------------------------- partitions (grilles minutées) */
  /**
   * Partition d'une prise rythmée, en temps : décompte (countIn temps), puis `bars` mesures. Chaque accord dure
   * `bpc` temps ; le motif de grattage se répète. clickBars : clic audible ou non par mesure (après le décompte).
   */
  function rhythmScore(o) {
    const pat = o.strum ? T.strum(o.strum) : null, pk = o.pick ? T.pick(o.pick) : null;
    const sig = (pat || pk || { sig: 4 }).sig, sub = (pat || pk || { sub: 2 }).sub;
    const bars = o.bars || 4, events = [], segments = [];
    const seq = o.seq, bpc = o.bpc || sig;
    const chordAt = beat => seq[Math.floor(beat / bpc) % seq.length];
    for (let b = 0; b < bars; b++) {
      if (pat) for (const e of T.strumEvents(pat)) { const beat = b * sig + e.beat; events.push({ beat, k: e.k, v: chordAt(beat) }); }
      else if (pk) pk.toks.forEach((tok, i) => { if (tok === '.') return; const beat = b * sig + i / sub; events.push({ beat, k: 'D', tok, v: chordAt(beat) }); });
      else for (let i = 0; i < sig * (o.sub || 1); i++) { const beat = b * sig + i / (o.sub || 1); events.push({ beat, k: 'D', v: chordAt(beat) }); }
    }
    for (let beat = 0; beat < bars * sig; beat += bpc) segments.push({ beat0: beat, beat1: Math.min(bars * sig, beat + bpc), v: chordAt(beat) });
    return { tempo: o.tempo, sig, sub, countIn: o.countIn != null ? o.countIn : sig, bars, clickBars: o.clickBars || new Array(bars).fill(true), events, segments, strum: o.strum || null, pick: o.pick || null, seq, bpc };
  }
  C.rhythmScore = rhythmScore;

  /* ---------------------------------------------------------------- retours communs */
  /** Problèmes d'enregistrement : on ne juge pas une prise mal captée. */
  function recordingIssues(res) {
    const fb = [];
    if (!res) return [{ kind: 'warn', text: 'Pas d’enregistrement.' }];
    if (res.issues.includes('silence')) fb.push({ kind: 'warn', text: 'Je ne t’ai pas entendu — pose le téléphone à 30–60 cm de la rosace et joue après le décompte.' });
    if (res.issues.includes('clip')) fb.push({ kind: 'warn', text: 'Son saturé : éloigne un peu le téléphone.' });
    if (res.issues.includes('noise')) fb.push({ kind: 'warn', text: 'Pièce bruyante : la mesure est moins sûre.' });
    return fb;
  }
  C.recordingIssues = recordingIssues;
  const STR = s => 'corde de ' + T.STRING_FR[s] + ' (' + T.STRING_NUM[s] + ')';
  C.STR = STR;
  /** Phrase d'explication d'une note étrangère trouvée dans un accord gratté. */
  function foreignText(f, v) {
    const fret = v.frets[f.s];
    if (f.kind === 'open') return 'La ' + STR(f.s) + ' sonne à vide au lieu de la case ' + fret + ' : appuie le doigt ' + v.fingers[f.s] + ' juste derrière la frette, bout du doigt bien vertical.';
    if (f.kind === 'fret+1' || f.kind === 'fret-1') return 'Sur la ' + STR(f.s) + ', on entend la case ' + (fret + (f.kind === 'fret+1' ? 1 : -1)) + ' au lieu de la ' + fret + ' : vérifie la position du doigt ' + v.fingers[f.s] + '.';
    if (f.kind === 'mute') return 'La ' + STR(f.s) + ' sonne alors qu’elle ne fait pas partie de l’accord : évite-la au grattage' + (f.s === 0 ? ' (commence sur la corde de La)' : '') + '.';
    return 'Une note étrangère s’entend.';
  }
  C.foreignText = foreignText;
  /** Retour rythmique : coups manqués, coups en trop, avance/retard, régularité. tol en ms. */
  function rhythmFeedback(res, score, tol, o) {
    o = o || {};
    const fb = [];
    const evs = res.events || [], n = evs.length;
    const miss = evs.filter(e => !e.hit), ex = res.extras || [];
    if (res.hitRate >= 0.97 && !ex.length) fb.push({ kind: 'good', text: 'Tous les coups au bon endroit ✓' });
    else {
      if (miss.length) {
        const kinds = {}; miss.forEach(e => { kinds[e.k] = (kinds[e.k] || 0) + 1; });
        const what = Object.entries(kinds).map(([k, c]) => c + ' coup' + (c > 1 ? 's' : '') + ' ' + ({ D: 'vers le bas', U: 'vers le haut', X: 'percussif' }[k] || '')).join(', ');
        fb.push({ kind: 'bad', text: miss.length + '/' + n + ' coups manqués (' + what + ').' });
      }
      if (ex.length) {
        const beatDur = 60 / score.tempo, slotDur = beatDur / score.sub;
        const onRest = ex.filter(x => { const rel = (x.t - (o.t0 || 0)) / slotDur; const slot = ((Math.round(rel) % (score.sig * score.sub)) + score.sig * score.sub) % (score.sig * score.sub); return score.strum && T.strum(score.strum).slots[slot] === '.'; }).length;
        fb.push({ kind: 'bad', text: ex.length + ' coup' + (ex.length > 1 ? 's' : '') + ' en trop' + (onRest ? ' — dont ' + onRest + ' sur une case « silence » : la main passe sans toucher les cordes' : '') + '.' });
      }
    }
    if (isFinite(res.mean) && Math.abs(res.mean) > tol * 0.6) fb.push({ kind: 'warn', text: (res.mean < 0 ? 'En avance' : 'En retard') + ' de ' + f0(Math.abs(res.mean)) + ' ms en moyenne : ' + (res.mean < 0 ? 'laisse venir le clic, ne le devance pas.' : 'pars avec le clic, pas après lui.') });
    else if (isFinite(res.mae)) fb.push({ kind: res.mae <= tol ? 'good' : 'warn', text: 'Écart moyen au clic : ' + f0(res.mae) + ' ms (objectif ≤ ' + tol + ')' });
    if (isFinite(res.sd) && res.sd > tol) fb.push({ kind: 'tip', text: 'Régularité : ±' + f0(res.sd) + ' ms. Garde le bras en mouvement continu, comme un balancier : bas sur les temps, haut sur les « et ».' });
    if (res.chuckOk != null && res.chuckOk < 0.75) fb.push({ kind: 'tip', text: 'Les frappes (✕) sonnent encore comme des accords : pose le tranchant de la main (ou les doigts à plat) sur les cordes en même temps que tu frappes — un « tchack » sec, sans note.' });
    return fb;
  }
  C.rhythmFeedback = rhythmFeedback;

  /* ---------------------------------------------------------------- choix des paramètres */
  /** Parmi des candidats, celui dont la difficulté est la plus proche de la cible (avec un peu de variété). */
  C.choose = function (ex, target, ctx, r) {
    const cands = ex.candidates(ctx, r || Math.random);
    let best = null, bd = Infinity;
    const scored = cands.map(p => ({ p, d: ex.difficulty(p, ctx) })).filter(o => isFinite(o.d));
    for (const o of scored) { const e = Math.abs(o.d - target); if (e < bd) { bd = e; best = o; } }
    if (!best) return null;
    const near = scored.filter(o => Math.abs(o.d - target) <= bd + 0.3);
    const o = near.length ? near[Math.floor((r || Math.random)() * near.length) % near.length] : best;
    return { params: o.p, d: o.d };
  };

  /** Accords connus (vocabulaire) jouables dans le contexte (sans barrés tant qu'ils ne sont pas abordés). */
  function vocab(ctx, o) {
    o = o || {};
    let v = (ctx.vocab || []).filter(id => T.voicing(id));
    if (!o.barres && !o.onlyBarres) v = v.filter(id => !C.isBarreId(id));
    // « barrés » : les vrais barrés, et les petits barrés qui y préparent (Fa sur 4 cordes, Ré m7, La 6)
    if (o.onlyBarres) v = v.filter(id => C.isBarreId(id) || !!(T.voicing(id).barre));
    return v;
  }
  C.vocab = vocab;
  /** Paires candidates : celles de la chanson travaillée d'abord, puis les plus faibles, puis au hasard. */
  function pairs(ctx, r, o) {
    o = o || {};
    if (ctx.focusPair) return [ctx.focusPair];
    const vs = vocab(ctx, o), out = [];
    const add = (a, b) => { if (a && b && a !== b && vs.includes(a) && vs.includes(b) && !out.some(p => T.pairKey(p[0], p[1]) === T.pairKey(a, b))) out.push([a, b]); };
    (ctx.songPairs || []).forEach(p => add(p[0], p[1]));
    const all = [];
    for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) all.push([vs[i], vs[j]]);
    // les paires les moins sûres d'abord (record bas ou jamais travaillées), un peu de hasard
    const stat = p => (ctx.pairStat ? ctx.pairStat(p[0], p[1]) : null);
    all.sort((x, y) => { const sx = stat(x), sy = stat(y); return ((sx ? sx.best : 0) - (sy ? sy.best : 0)) + (r() - 0.5) * 20; });
    all.slice(0, o.max || 10).forEach(p => add(p[0], p[1]));
    if (o.onlyBarres) return out.filter(p => T.voicing(p[0]).barre || T.voicing(p[1]).barre);
    return out;
  }
  C.pairs = pairs;

  /* ================================================================ EXERCICES */
  const EX = [];

  /* -------------------------------------------------- main gauche */
  function propreFactory(id, comp, onlyBarres) {
    return {
      id, comp, also: comp === 'barres' ? { accords: 0.3 } : {}, kind: 'play', load: comp === 'barres' ? 1.4 : 0.8, pillar: 'gauche',
      name: comp === 'barres' ? 'Barré propre, corde par corde' : 'Accord propre, corde par corde',
      why: comp === 'barres'
        ? 'Un barré qui sonne, c’est d’abord un index qui appuie juste assez au bon endroit. On vérifie chaque corde une à une : le micro dit laquelle reste muette ou sonne faux.'
        : 'La base de tout accompagnement : chaque corde de l’accord doit sonner. Le micro écoute chaque corde une à une et te dit précisément laquelle est étouffée ou fausse.',
      how: ['Forme l’accord et garde-le.', 'Joue une corde à la fois, de la plus grave à la plus aiguë (seulement les cordes de l’accord), en laissant sonner.', 'Écoute chaque note : elle doit sonner comme une cloche, sans « toc ».'],
      cue: 'Fais sonner chaque corde comme une petite cloche : un son long et clair, pas un « toc » étouffé.',
      candidates(ctx) {
        let vs = onlyBarres ? vocab(ctx, { onlyBarres: true }) : vocab(ctx);
        // accords appris récemment et pas encore propres : on y revient en priorité (rappel espacé)
        const fresh = (ctx.freshChords || []).filter(id => vs.includes(id));
        if (fresh.length && !((ctx.takeIndex || 0) % 2)) vs = fresh;         // une prise sur deux, au plus
        const extra = ctx.newChord && (onlyBarres ? !!T.voicing(ctx.newChord).barre : !C.isBarreId(ctx.newChord)) ? [ctx.newChord] : [];
        return Array.from(new Set(vs.concat(extra))).map(v => ({ v }));
      },
      difficulty(p) { const v = T.voicing(p.v); return v ? 0.85 * v.d + 0.3 : NaN; },
      label: p => vName(p.v),
      steps(p) {
        const v = T.voicing(p.v), n = T.sounding(v).length;
        return [
          { t: 'show', v: [p.v], label: 'Forme ' + vName(p.v), sub: 'Pose les doigts, puis touche « Prêt ».' },
          { t: 'listen', play: { kind: 'arp', v: p.v, gap: 0.55 }, label: 'Écoute : chaque corde, de la plus grave à la plus aiguë' },
          { t: 'play', label: 'Joue les ' + n + ' cordes, une par une', sub: 'De la ' + STR(T.sounding(v)[0]) + ' à la ' + STR(T.sounding(v)[n - 1]) + '. Prends ton temps.', rec: { kind: 'plucks', v: p.v }, sec: Math.min(14, 3 + n * 1.3), stopOnSilence: true, show: [p.v] },
        ];
      },
      judge(res, p) {
        const fb = recordingIssues(res);
        if (!res || !res.ok || !res.strings || !res.strings.length) return { y: null, success: null, fb };
        const v = T.voicing(p.v), bad = res.strings.filter(s => s.status !== 'ok');
        const y = !bad.length ? 1 : bad.length === 1 ? 0.5 : 0;
        if (!bad.length) fb.push({ kind: 'good', text: 'Les ' + res.strings.length + ' cordes sonnent ✓' });
        for (const s of bad.slice(0, 3)) {
          const fg = v.fingers[s.s], fret = v.frets[s.s];
          if (s.status === 'muted') fb.push({ kind: 'bad', text: 'La ' + STR(s.s) + ' est étouffée.' + (fret > 0 ? ' Doigt ' + fg + ' : bien sur le bout, juste derrière la frette.' : ' Un doigt voisin la touche : cambre-le pour la laisser passer dessous.') });
          else if (s.status === 'wrong') fb.push({ kind: 'bad', text: 'Sur la ' + STR(s.s) + ', j’entends ' + T.noteName(s.got) + ' au lieu de ' + T.noteName(s.exp) + (fret > 0 ? ' : vérifie la case du doigt ' + fg + '.' : ' : cette corde doit sonner à vide.') });
          else if (s.status === 'missing') fb.push({ kind: 'warn', text: 'Je n’ai pas entendu la ' + STR(s.s) + ' (sautée ?).' });
        }
        if (bad.some(s => s.status === 'muted')) fb.push({ kind: 'tip', text: 'Astuce : pouce derrière le manche, à mi-hauteur ; poignet un peu avancé. Les doigts arrivent alors d’en haut, comme des marteaux.' });
        return { y, success: y === 1, fb, metrics: { nOk: res.nOk, n: res.strings.length }, chord: { id: p.v, clean: !bad.length, strings: res.strings.map(s => s.status) } };
      },
    };
  }
  EX.push(propreFactory('propre', 'accords', false));
  EX.push(propreFactory('barre', 'barres', true));

  EX.push({
    id: 'forme', name: 'De mémoire, au signal', comp: 'accords', also: { changements: 0.25 }, kind: 'play', load: 0.8, pillar: 'gauche',
    why: 'Retrouver un accord de mémoire, vite, sans regarder de diagramme : c’est ce qu’il faut pour suivre une grille. Se tester ainsi fait mieux retenir que relire (Roediger & Karpicke 2006), et le mélange des accords fait mieux retenir que la répétition en bloc (Shea & Morgan 1979).',
    how: ['Un nom d’accord s’affiche avec un bip.', 'Forme-le le plus vite possible, puis gratte une fois.', 'Relâche, et attends le suivant.'],
    cue: 'Vois la forme dans ta tête avant de bouger : les doigts se posent ensemble, comme un tampon.',
    candidates(ctx, r) {
      const vs = vocab(ctx);
      if (vs.length < 3) return [];
      const out = [];
      for (let k = 0; k < 8; k++) {
        const pool = vs.slice(), chords = [];
        while (chords.length < 4 && pool.length) { const c = pool.splice(Math.floor(r() * pool.length), 1)[0]; if (chords[chords.length - 1] !== c) chords.push(c); }
        while (chords.length < 4) chords.push(pick(r, vs));
        for (const limit of [6, 5, 4, 3, 2.5, 2, 1.6, 1.3]) out.push({ chords, limit });
      }
      return out;
    },
    difficulty(p) { const ds = p.chords.map(id => T.voicing(id).d); return 0.55 * (ds.reduce((a, b) => a + b, 0) / ds.length) + 0.25 * Math.max(...ds) + 2.4 * Math.log2(4.5 / p.limit) - 0.2; },
    label: p => p.chords.map(vSym).join(' · ') + ' · ' + fr1(p.limit) + ' s',
    steps(p) {
      const gap = p.limit + 2.2;
      return [
        { t: 'show', text: 'Les accords : ' + p.chords.map(vSym).join(', ') + '. Tu auras ' + fr1(p.limit) + ' s pour chacun.', label: 'Prépare-toi', sub: 'Pas de diagramme pendant la prise : de mémoire !' },
        { t: 'play', label: 'Au signal : forme et gratte', rec: { kind: 'cues', cues: p.chords.map((v, i) => ({ at: 1.2 + i * gap, v, limit: p.limit })) }, sec: 1.2 + p.chords.length * gap + 0.8, cueChords: true },
      ];
    },
    judge(res, p) {
      const fb = recordingIssues(res);
      if (!res || !res.ok || !res.cues) return { y: null, success: null, fb };
      const good = res.cues.filter(c => c.hit && c.ok && c.inTime).length, n = res.cues.length;
      const y = good >= n - 1 && good >= 3 ? 1 : good >= Math.ceil(n / 2) ? 0.5 : 0;
      fb.push({ kind: good === n ? 'good' : good >= n - 1 ? 'warn' : 'bad', text: good + '/' + n + ' accords justes à temps' });
      const rts = res.cues.filter(c => c.hit && c.ok).map(c => c.rt);
      if (rts.length) fb.push({ kind: 'info', text: 'Temps de formation : ' + rts.map(t => fr1(t) + ' s').join(' · ') });
      res.cues.forEach(c => {
        if (!c.hit) fb.push({ kind: 'bad', text: vSym(c.v) + ' : pas de coup entendu.' });
        else if (!c.ok) fb.push({ kind: 'bad', text: vSym(c.v) + ' : j’ai entendu ' + (c.heard ? vSym(c.heard) : 'un autre accord') + '.' + (c.foreign && c.foreign[0] ? ' ' + foreignText(c.foreign[0], T.voicing(c.v)) : '') });
        else if (!c.inTime) fb.push({ kind: 'warn', text: vSym(c.v) + ' : juste, mais en ' + fr1(c.rt) + ' s (limite ' + fr1(p.limit) + ' s).' });
      });
      return { y, success: y === 1, fb, metrics: { good, n, rt: rts.length ? rts.reduce((a, b) => a + b, 0) / rts.length : null }, forms: res.cues.filter(c => c.hit && c.ok).map(c => ({ id: c.v, rt: c.rt })) };
    },
  });

  EX.push({
    id: 'minute', name: 'Changements en une minute', comp: 'changements', also: { accords: 0.2 }, kind: 'play', load: 1.0, pillar: 'gauche',
    why: 'Le goulot de presque toutes les chansons : passer d’un accord à l’autre. On compte les changements propres par minute, une mesure simple et objective de ta fluidité sur chaque paire — et elle prédit directement les chansons que tu peux jouer.',
    how: ['Alterne entre les deux accords, un seul coup de médiator par accord.', 'Va aussi vite que possible EN RESTANT PROPRE : un changement raté ne compte pas.', 'Ne regarde pas tes doigts si tu peux : écoute le son.'],
    cue: 'Pense « les doigts arrivent ensemble » : un seul geste, pas un doigt après l’autre. Si un doigt ne bouge pas d’un accord à l’autre, laisse-le en place comme un pivot.',
    candidates(ctx, r) {
      const out = [];
      for (const [a, b] of pairs(ctx, r)) for (const sec of [30, 45]) for (let cpm = 10; cpm <= 110; cpm += 4) out.push({ a, b, sec, target: cpm });
      return out;
    },
    difficulty: p => C.dMinute(pairCost(p.a, p.b), p.target) + (p.sec >= 45 ? 0.25 : 0),
    label: p => vSym(p.a) + ' ⇄ ' + vSym(p.b) + ' · objectif ' + p.target + '/min · ' + p.sec + ' s',
    steps(p) {
      return [
        { t: 'show', v: [p.a, p.b], label: vSym(p.a) + ' ⇄ ' + vSym(p.b), sub: pivotText(p.a, p.b) },
        { t: 'listen', play: { kind: 'changes', a: p.a, b: p.b, n: 6, gap: 60 / Math.max(20, p.target) }, label: 'Écoute l’allure visée (' + p.target + ' changements/min)' },
        { t: 'play', label: 'Alterne ' + vSym(p.a) + ' ⇄ ' + vSym(p.b), sub: 'Un coup par accord, propre avant d’être rapide.', rec: { kind: 'changes', a: p.a, b: p.b }, sec: p.sec, countdown: true, show: [p.a, p.b] },
      ];
    },
    judge(res, p) {
      const fb = recordingIssues(res);
      if (!res || !res.ok || !res.strums) return { y: null, success: null, fb };
      const cpm = res.cpm;
      const y = cpm >= p.target ? 1 : cpm >= 0.8 * p.target ? 0.5 : 0;
      fb.push({ kind: y === 1 ? 'good' : y ? 'warn' : 'bad', text: f0(cpm) + ' changements/min (objectif ' + p.target + ')' });
      if (res.flawed) {
        const fl = res.strums.find(s => s.foreign && s.foreign.length);
        const v = fl ? T.voicing(fl.chord === 'a' ? p.a : p.b) : null;
        fb.push({ kind: 'warn', text: res.flawed + ' coup' + (res.flawed > 1 ? 's' : '') + ' pas propre' + (res.flawed > 1 ? 's' : '') + ' (non compté' + (res.flawed > 1 ? 's' : '') + ')' + (fl && v ? ' — ' + foreignText(fl.foreign[0], v) : '.') });
      }
      if (res.unclear >= 3) fb.push({ kind: 'tip', text: res.unclear + ' coups trop flous pour être reconnus : ralentis un peu, la vitesse viendra de la propreté.' });
      if (res.repeats >= 3) fb.push({ kind: 'info', text: 'J’ai entendu ' + res.repeats + ' fois le même accord deux fois de suite.' });
      const lvl = C.dMinute(pairCost(p.a, p.b), cpm);
      return { y, success: y === 1, fb, metrics: { cpm: +cpm.toFixed(1), flawed: res.flawed || 0 }, pair: { a: p.a, b: p.b, cpm }, observe: cpm >= 6 ? { comp: 'changements', level: clamp(lvl, 0, 10), noise: 1.4 } : null };
    },
  });
  /** Repère de doigté pour un changement : doigts qui restent en place (pivots) ou glissent sur leur corde. */
  function pivotText(a, b) {
    const va = T.voicing(a), vb = T.voicing(b);
    if (!va || !vb) return '';
    const same = [], slide = [];
    for (let s = 0; s < 6; s++) {
      const fa = va.fingers[s], fb = vb.fingers[s];
      if (fa && fa === fb && va.frets[s] === vb.frets[s] && va.frets[s] > 0) same.push(fa);
      else if (fa && fa === fb && va.frets[s] > 0 && vb.frets[s] > 0) slide.push(fa);
    }
    const u = arr => Array.from(new Set(arr));
    if (same.length) return 'Pivot : le doigt ' + u(same).join(' et ') + ' ne bouge pas. Les autres arrivent ensemble.';
    if (slide.length) return 'Guide : le doigt ' + u(slide).join(' et ') + ' glisse sur sa corde, sans la quitter.';
    return 'Tous les doigts changent : vise la forme entière d’un seul geste.';
  }
  C.pivotText = pivotText;

  function basculeFactory(id, comp, onlyBarres) {
    return {
      id, comp, also: { pulsation: 0.25 }, kind: 'play', load: comp === 'barres' ? 1.4 : 1.0, pillar: 'gauche',
      name: comp === 'barres' ? 'Barrés en rythme' : 'Changements en rythme',
      why: 'Dans une chanson, le changement doit arriver à l’heure, sur le temps, sans trou. On joue la grille avec le métronome : le micro vérifie chaque accord et chaque coup.',
      how: ['Écoute le modèle.', 'Joue la grille avec le métronome (un décompte d’une mesure).', 'Change sur le premier temps de chaque accord ; le dernier coup avant le changement peut être « à vide » pour te laisser le temps.'],
      cue: 'Pense déjà au prochain accord pendant le dernier temps : les yeux et la tête un temps en avance, les mains suivent.',
      candidates(ctx, r) {
        const out = [];
        const ps = pairs(ctx, r, { onlyBarres, barres: onlyBarres });
        const seqs = ps.map(p => p.slice());
        if (!onlyBarres && ctx.songSeq && ctx.songSeq.length >= 3) seqs.push(ctx.songSeq.slice(0, 4));
        for (const seq of seqs) for (const bpc of [8, 4, 2, 1]) for (let tempo = 50; tempo <= 130; tempo += 5) for (const strum of ['r1', 'r2']) { if (strum === 'r2' && bpc === 1) continue; out.push({ seq, bpc, tempo, strum }); }
        return out;
      },
      difficulty(p) { const rate = p.tempo / p.bpc; return C.dRhythmChange(meanCost(p.seq), rate) + (p.strum === 'r2' ? 0.6 : 0) + (p.seq.length > 2 ? 0.3 : 0); },
      label: p => p.seq.map(vSym).join(' → ') + ' · ' + p.tempo + ' BPM · ' + ({ 8: '1 accord toutes les 2 mesures', 4: '1 accord/mesure', 2: '2 accords/mesure', 1: '1 accord/temps' })[p.bpc] + (p.strum === 'r2' ? ' · croches' : ''),
      steps(p) {
        const bars = Math.max(4, Math.ceil(p.seq.length * p.bpc / 4) * 2);
        const score = rhythmScore({ strum: p.strum, seq: p.seq, bpc: p.bpc, tempo: p.tempo, bars });
        return [
          { t: 'show', v: p.seq, label: p.seq.map(vSym).join(' → '), sub: p.seq.length === 2 ? pivotText(p.seq[0], p.seq[1]) : 'Change d’accord ' + ({ 8: 'toutes les 2 mesures', 4: 'à chaque mesure', 2: 'tous les 2 temps', 1: 'à chaque temps' })[p.bpc] + '.', pattern: p.strum },
          { t: 'listen', play: { kind: 'pattern', strum: p.strum, seq: p.seq, bpc: p.bpc, tempo: p.tempo, bars: 2 }, label: 'Écoute le modèle' },
          { t: 'play', label: 'À toi', rec: { kind: 'rhythm', tol: 70 }, score },
        ];
      },
      judge(res, p, ctx, extra) {
        const fb = recordingIssues(res);
        if (!res || !res.ok || !res.events) return { y: null, success: null, fb };
        const segs = (res.chords || []).filter(c => c.ok != null);
        const okSeg = segs.filter(c => c.ok).length, segRate = segs.length ? okSeg / segs.length : 0;
        const timingOk = res.hitRate >= 0.85 && (!isFinite(res.mae) || res.mae <= 70);
        const y = segRate >= 0.9 && timingOk ? 1 : segRate >= 0.7 && res.hitRate >= 0.7 ? 0.5 : 0;
        fb.push({ kind: segRate >= 0.9 ? 'good' : 'bad', text: okSeg + '/' + segs.length + ' accords reconnus au bon moment' });
        const wrong = segs.find(c => !c.ok);
        if (wrong) fb.push({ kind: 'warn', text: 'Mesure avec ' + vSym(wrong.v) + ' : j’ai entendu ' + (wrong.heard ? vSym(wrong.heard) : 'autre chose') + ' — le changement est arrivé trop tard ?' });
        const dirty = segs.find(c => c.ok && c.foreign && c.foreign.length);
        if (dirty) fb.push({ kind: 'tip', text: foreignText(dirty.foreign[0], T.voicing(dirty.v)) });
        rhythmFeedback(res, (extra && extra.score) || rhythmScore({ strum: p.strum, seq: p.seq, bpc: p.bpc, tempo: p.tempo }), 70).forEach(f => fb.push(f));
        return { y, success: y === 1, fb, metrics: { segRate: +segRate.toFixed(2), hit: +res.hitRate.toFixed(2), mae: isFinite(res.mae) ? +res.mae.toFixed(1) : null }, rhythmPair: p.seq.length === 2 && y === 1 ? { a: p.seq[0], b: p.seq[1], tempo: p.tempo, bpc: p.bpc } : null };
      },
    };
  }
  EX.push(basculeFactory('bascule', 'changements', false));
  EX.push(basculeFactory('barre-rythme', 'barres', true));

  /* -------------------------------------------------- main droite */
  EX.push({
    id: 'pulse', name: 'Pulsation (le métronome se tait)', comp: 'pulsation', also: {}, kind: 'play', load: 0.4, pillar: 'droite',
    why: 'Pour accompagner, c’est toi le métronome. On joue avec le clic, puis il se tait quelques mesures : le micro mesure si tu accélères ou ralentis. C’est l’horloge intérieure qui se muscle (Repp 2005).',
    how: ['Étouffe les cordes avec la main gauche (ou joue un Mi mineur).', 'Un coup par temps (ou par croche), avec le clic.', 'Quand le clic se tait, continue exactement pareil — il revient à la fin.'],
    cue: 'Fais bouger tout le corps avec le temps : un pied qui marque la pulsation, la tête qui hoche. Le silence n’arrête pas la danse.',
    candidates() {
      const out = [];
      for (let tempo = 56; tempo <= 132; tempo += 8) for (const sub of [1, 2]) for (const silent of [0, 1, 2, 4]) for (const tol of C.TOLS) out.push({ tempo, sub, silent, tol });
      return out;
    },
    difficulty: p => 0.3 + C.tolCost(p.tol) + [0, 0.8, 1.4, 2.2][[0, 1, 2, 4].indexOf(p.silent)] + (p.sub === 2 ? 0.4 : 0) + (p.tempo < 64 ? 0.03 * (64 - p.tempo) : 0) + (p.tempo > 120 ? 0.03 * (p.tempo - 120) : 0),
    label: p => p.tempo + ' BPM · ' + (p.sub === 2 ? 'croches' : 'noires') + (p.silent ? ' · ' + p.silent + ' mesure' + (p.silent > 1 ? 's' : '') + ' sans clic' : '') + ' · ±' + p.tol + ' ms',
    steps(p) {
      const bars = 2 + p.silent + 1;
      const clickBars = []; for (let b = 0; b < bars; b++) clickBars.push(b < 2 || b === bars - 1);
      const score = rhythmScore({ seq: ['Em'], tempo: p.tempo, bars, sub: p.sub, clickBars });
      return [
        { t: 'show', text: (p.sub === 2 ? 'Bas-haut sur chaque temps (croches).' : 'Un coup vers le bas sur chaque temps.') + (p.silent ? ' Après 2 mesures, le clic se tait ' + p.silent + ' mesure' + (p.silent > 1 ? 's' : '') + ' : continue !' : ''), label: 'Pulsation à ' + p.tempo, sub: 'Cordes étouffées ou Mi mineur.' },
        { t: 'play', label: p.silent ? 'Avec le clic… puis sans' : 'Avec le clic', rec: { kind: 'rhythm', tol: p.tol }, score, silentLabel: 'Continue sans le clic…' },
      ];
    },
    judge(res, p) {
      const fb = recordingIssues(res);
      if (!res || !res.ok || !res.events) return { y: null, success: null, fb };
      const clicked = res.events.filter(e => !e.free);
      const hitC = clicked.length ? clicked.filter(e => e.hit).length / clicked.length : 0;
      let y = hitC >= 0.9 && res.mae <= p.tol ? 1 : hitC >= 0.75 && res.mae <= 1.6 * p.tol ? 0.5 : 0;
      fb.push({ kind: res.mae <= p.tol ? 'good' : 'warn', text: 'Avec le clic : écart moyen ' + f0(res.mae) + ' ms (objectif ≤ ' + p.tol + '), régularité ±' + f0(res.sd || 0) + ' ms' });
      if (isFinite(res.mean) && Math.abs(res.mean) > 20) fb.push({ kind: 'info', text: (res.mean < 0 ? 'Tu anticipes' : 'Tu suis') + ' le clic de ' + f0(Math.abs(res.mean)) + ' ms en moyenne' + (res.mean < 0 ? ' (très courant : on « attend » le clic trop tôt).' : '.') });
      if (p.silent && res.drift) {
        const pct = (res.drift.tempoRatio - 1) * 100, endErr = res.drift.endErr;
        const ok = Math.abs(pct) <= 3 && Math.abs(endErr) <= 2.2 * p.tol;
        if (!ok && y === 1) y = 0.5;
        fb.push({ kind: ok ? 'good' : 'bad', text: 'Sans le clic : ' + (Math.abs(pct) < 1 ? 'tempo tenu' : (pct > 0 ? 'tu accélères' : 'tu ralentis') + ' de ' + fr1(Math.abs(pct)) + ' %') + ' ; au retour du clic, ' + f0(Math.abs(endErr)) + ' ms ' + (endErr < 0 ? 'd’avance' : 'de retard') + '.' });
        if (!ok) fb.push({ kind: 'tip', text: pct > 0 ? 'On accélère presque toujours dans le silence : pense « posé », compte les temps à voix basse.' : 'Garde le mouvement du bras régulier, même entre les coups.' });
      } else if (p.silent) fb.push({ kind: 'warn', text: 'Pas assez de coups mesurés pendant le silence.' });
      const sd = res.sd;
      return { y, success: y === 1, fb, metrics: { mae: +(res.mae || 0).toFixed(1), sd: isFinite(sd) ? +sd.toFixed(1) : null, drift: res.drift ? +((res.drift.tempoRatio - 1) * 100).toFixed(1) : null }, observe: isFinite(sd) && clicked.length >= 6 ? { comp: 'pulsation', level: M.scale(sd, M.SCALES.timingSd), noise: 1.5 } : null };
    },
  });

  EX.push({
    id: 'rythme', name: 'Rythmique', comp: 'rythmiques', also: { pulsation: 0.25 }, kind: 'play', load: 0.6, pillar: 'droite',
    why: 'La main droite fait le style : folk, pop syncopée, percussif à la Ed Sheeran. Le micro vérifie chaque coup (bon endroit, à l’heure) et les coups en trop sur les cases vides.',
    how: ['Regarde le motif et compte-le à voix haute (« 1 et 2 et… »).', 'Écoute le modèle.', 'Joue avec le métronome : le bras fait toujours bas-haut, même quand il ne touche pas les cordes.'],
    cue: 'Le bras est un balancier qui ne s’arrête jamais : bas sur les temps, haut sur les « et ». Les silences, c’est la main qui passe au-dessus des cordes sans les toucher.',
    candidates(ctx, r) {
      const out = [];
      const pats = C.strumsFor(ctx);
      const chordSets = [[ctx.easyChord || 'Em']];
      const ps = pairs(ctx, r, { max: 3 });
      if (ps.length) chordSets.push(ps[0]);
      if (ctx.songPairs && ctx.songPairs[0]) chordSets.push(ctx.songPairs[0]);
      for (const p of pats) for (let tempo = 56; tempo <= 136; tempo += 8) for (const seq of chordSets) for (const tol of [70, 55, 45, 35]) out.push({ p, tempo, seq, tol });
      return out;
    },
    difficulty(p) { const pat = T.strum(p.p); return T.strumCost(pat) + C.tempoCost(pat.sub, p.tempo) + 0.5 * C.tolCost(p.tol) + (p.seq.length > 1 ? 0.25 * meanCost(p.seq) : 0) - 0.3; },
    label: p => T.strum(p.p).name + ' · ' + p.tempo + ' BPM · ' + p.seq.map(vSym).join(' / ') + ' · ±' + p.tol + ' ms',
    steps(p) {
      const pat = T.strum(p.p), score = rhythmScore({ strum: p.p, seq: p.seq, bpc: pat.sig, tempo: p.tempo, bars: 4 });
      return [
        { t: 'show', pattern: p.p, v: p.seq, label: pat.name, sub: pat.desc },
        { t: 'listen', play: { kind: 'pattern', strum: p.p, seq: p.seq, bpc: pat.sig, tempo: p.tempo, bars: 2 }, label: 'Écoute le motif' },
        { t: 'play', label: 'À toi : ' + pat.name, rec: { kind: 'rhythm', tol: p.tol }, score },
      ];
    },
    judge(res, p, ctx, extra) {
      const fb = recordingIssues(res);
      if (!res || !res.ok || !res.events) return { y: null, success: null, fb };
      const pat = T.strum(p.p), n = res.events.length, ex = (res.extras || []).length;
      const chuckOk = res.chuckOk == null || res.chuckOk >= 0.75;
      const y = res.hitRate >= 0.9 && ex <= Math.max(1, Math.round(n * 0.06)) && res.mae <= p.tol && chuckOk ? 1 : res.hitRate >= 0.75 && ex <= Math.round(n * 0.15) && res.mae <= 1.7 * p.tol ? 0.5 : 0;
      rhythmFeedback(res, (extra && extra.score) || rhythmScore({ strum: p.p, seq: p.seq, bpc: pat.sig, tempo: p.tempo }), p.tol, { t0: extra && extra.t0 }).forEach(f => fb.push(f));
      return { y, success: y === 1, fb, metrics: { hit: +res.hitRate.toFixed(2), extras: ex, mae: +(res.mae || 0).toFixed(1), sd: isFinite(res.sd) ? +res.sd.toFixed(1) : null }, pattern: y === 1 ? { id: p.p, tempo: p.tempo } : null };
    },
  });
  /** Rythmiques proposées : déverrouillées par le bloc du programme et le niveau. */
  C.strumsFor = function (ctx) {
    const th = ctx.level ? ctx.level('rythmiques') : 3, blk = ctx.block || 1;
    return T.STRUMS.filter(p => {
      const d = T.strumCost(p);
      if (p.family === 'perc' && blk < 2 && th < 4) return false;
      if (p.sub === 4 && blk < 3 && th < 5) return false;
      return d <= th + 2.5;
    }).map(p => p.id);
  };

  EX.push({
    id: 'picking', name: 'Arpèges et Travis', comp: 'picking', also: { pulsation: 0.2 }, kind: 'play', load: 0.6, pillar: 'droite',
    why: 'Jouer aux doigts ouvre les ballades et les intros (style « Perfect », « Photograph »). Le pouce tient la basse comme un métronome, les doigts chantent au-dessus. Le micro vérifie chaque note à l’heure.',
    how: ['Pouce (p) sur les basses, index (i) corde de Sol, majeur (m) corde de Si, annulaire (a) Mi aigu.', 'Écoute le modèle, puis joue avec le métronome.', 'Le pouce ne s’arrête jamais : c’est lui qui tient le temps.'],
    cue: 'Écoute la basse comme une marche régulière ; les doigts se posent dessus comme une mélodie.',
    candidates(ctx) {
      const out = [];
      const th = ctx.level ? ctx.level('picking') : 2;
      const pks = T.PICKS.filter(p => T.pickCost(p) <= th + 2.5).map(p => p.id);
      const chords = vocab(ctx).filter(id => ['C', 'G', 'Am', 'Em', 'D', 'A', 'E', 'G-pop', 'Cadd9', 'Dsus2', 'Asus2', 'Fmaj7', 'Em7', 'Am7'].includes(id));
      if (!chords.length) chords.push('Em');
      for (const p of pks.length ? pks : ['f0']) for (let tempo = 44; tempo <= 130; tempo += 6) for (const v of chords.slice(0, 5)) out.push({ p, tempo, v });
      return out;
    },
    difficulty(p) { return T.pickCost(T.pick(p.p)) + (p.tempo > 64 ? 2.0 * Math.log2(p.tempo / 64) : 0) + 0.25 * (T.voicing(p.v).d - 1.5) - 0.2; },
    label: p => T.pick(p.p).name + ' · ' + vSym(p.v) + ' · ' + p.tempo + ' BPM',
    steps(p) {
      const pk = T.pick(p.p), score = rhythmScore({ pick: p.p, seq: [p.v], tempo: p.tempo, bars: 4 });
      return [
        { t: 'show', v: [p.v], pick: p.p, label: pk.name, sub: pk.desc },
        { t: 'listen', play: { kind: 'pick', pick: p.p, seq: [p.v], tempo: p.tempo, bars: 2 }, label: 'Écoute' },
        { t: 'play', label: 'À toi : ' + pk.name, rec: { kind: 'rhythm', tol: 55 }, score },
      ];
    },
    judge(res, p, ctx, extra) {
      const fb = recordingIssues(res);
      if (!res || !res.ok || !res.events) return { y: null, success: null, fb };
      const ex = (res.extras || []).length, n = res.events.length;
      const y = res.hitRate >= 0.88 && ex <= Math.max(1, Math.round(n * 0.08)) && res.mae <= 55 ? 1 : res.hitRate >= 0.7 && res.mae <= 90 ? 0.5 : 0;
      rhythmFeedback(res, (extra && extra.score) || rhythmScore({ pick: p.p, seq: [p.v], tempo: p.tempo }), 55).forEach(f => fb.push(f));
      if (y < 1) fb.push({ kind: 'tip', text: 'Ralentis jusqu’à ce que ce soit facile, puis remonte de 4 BPM à la fois (pratique lente : Duke et al. 2009).' });
      return { y, success: y === 1, fb, metrics: { hit: +res.hitRate.toFixed(2), extras: ex, mae: +(res.mae || 0).toFixed(1) }, pick: y === 1 ? { id: p.p, tempo: p.tempo } : null };
    },
  });

  /* -------------------------------------------------- oreille et harmonie */
  EX.push({
    id: 'discri', name: 'Oreille fine (accordage)', comp: 'oreille', also: {}, kind: 'quiz', load: 0, pillar: 'oreille',
    why: 'S’accorder à l’oreille, entendre qu’une corde est un peu fausse : ça s’entraîne. En quelques heures d’entraînement, des non-musiciens rejoignent souvent le seuil des musiciens (Micheyl et al. 2006). L’écart s’ajuste à chaque réponse (estimation bayésienne ZEST, King-Smith et al. 1994).',
    how: ['Deux notes de guitare, l’une après l’autre.', 'La 2ᵉ est-elle plus haute ou plus basse ?', 'Réponds même si tu doutes : l’écart s’adapte.'],
    cue: 'Écoute la note juste après l’attaque : chante-la intérieurement, puis compare.',
    candidates: () => [{ trials: 20 }],
    difficulty: () => 3,
    label: () => '20 essais · écart adaptatif',
    steps: p => [{ t: 'quiz', quiz: 'discri', trials: p.trials }],
    judge(res) {
      if (!res || !isFinite(res.threshold)) return { y: null, success: null, fb: [] };
      const lvl = M.scale(res.threshold, M.SCALES.jnd);
      return { y: null, success: null, fb: [{ kind: 'info', text: 'Seuil : ' + f0(res.threshold) + ' cents (75 % de bonnes réponses). Plus bas = oreille plus fine. Un écart de 10 cents s’entend dans un accord.' }], metrics: { jnd: +res.threshold.toFixed(1) }, observe: { comp: 'oreille', level: lvl, noise: 1.3 } };
    },
  });

  const QUALITY_SETS = {
    Mm: { name: 'Majeur ou mineur', opts: ['', 'm'], d: 1.4 },
    Mm7: { name: 'Majeur, mineur ou 7', opts: ['', 'm', '7'], d: 3.2 },
    sus: { name: 'Majeur, mineur ou sus', opts: ['', 'm', 'sus4', 'sus2'], d: 4.2 },
    sept: { name: 'maj7, m7 ou 7', opts: ['maj7', 'm7', '7'], d: 5.0 },
  };
  C.QUALITY_SETS = QUALITY_SETS;
  EX.push({
    id: 'qualite', name: 'Majeur ou mineur ?', comp: 'oreille', also: { harmonie: 0.15 }, kind: 'quiz', load: 0, pillar: 'oreille',
    why: 'Reconnaître la couleur d’un accord à l’oreille : la première étape pour relever une chanson et choisir tes accords en composant.',
    how: ['Un accord est joué (gratté ou en arpège).', 'Choisis sa couleur.', 'Majeur : lumineux, stable. Mineur : plus sombre, intime. 7 : tendu, il veut avancer.'],
    cue: 'Chante la tierce dans ta tête : celle du majeur monte, celle du mineur se replie.',
    candidates() { const out = []; for (const set of Object.keys(QUALITY_SETS)) for (const arp of [false, true]) out.push({ set, arp, n: 8 }); return out; },
    difficulty: p => QUALITY_SETS[p.set].d + (p.arp ? 0.5 : 0),
    label: p => QUALITY_SETS[p.set].name + (p.arp ? ' · arpège' : ' · gratté') + ' · ' + p.n + ' questions',
    steps: p => [{ t: 'quiz', quiz: 'qualite', set: p.set, arp: p.arp, n: p.n }],
    judge(res, p) {
      if (!res || !res.n) return { y: null, success: null, fb: [] };
      const y = res.correct >= p.n - 1 ? 1 : res.correct >= Math.ceil(p.n * 0.6) ? 0.5 : 0;
      return { y, success: y === 1, fb: [{ kind: y === 1 ? 'good' : 'warn', text: res.correct + '/' + res.n + ' justes' }].concat(res.confusions ? [{ kind: 'info', text: res.confusions }] : []), metrics: { pc: +(res.correct / res.n).toFixed(2) } };
    },
  });

  const DEGREE_SETS = [
    { id: 'I-V', set: ['I', 'V'], d: 1.2 },
    { id: 'IV-V', set: ['I', 'IV', 'V'], d: 2.0 },
    { id: 'pop', set: ['I', 'IV', 'V', 'vi'], d: 3.0 },
    { id: 'pop5', set: ['I', 'ii', 'IV', 'V', 'vi'], d: 4.2 },
    { id: 'all6', set: ['I', 'ii', 'iii', 'IV', 'V', 'vi'], d: 5.2 },
    { id: 'emprunts', set: ['I', 'IV', 'V', 'vi', '♭VII', 'iv'], d: 6.0 },
  ];
  C.DEGREE_SETS = DEGREE_SETS;
  EX.push({
    id: 'degres', name: 'Entendre les degrés', comp: 'oreille', also: { harmonie: 0.3 }, kind: 'quiz', load: 0, pillar: 'oreille',
    why: 'Les chansons pop réutilisent les mêmes fonctions : I (la maison), IV, V, vi. Les reconnaître à l’oreille, c’est pouvoir jouer d’oreille et composer avec intention. Chacun a déjà une intuition implicite de l’harmonie ; l’entraînement la rend explicite (Bigand & Poulin-Charronnat 2006).',
    how: ['Une cadence installe la tonalité (I–IV–V–I).', 'Puis un accord : quel degré ?', 'Compare-le à la « maison » (I) : repos, éloignement, tension ?'],
    cue: 'Fredonne la note de base de la tonalité (le I) : l’accord entendu s’en éloigne-t-il, ou t’y ramène-t-il ?',
    candidates() { const out = []; for (const s of DEGREE_SETS) for (const prog of [false, true]) out.push({ set: s.id, prog, n: 8 }); return out; },
    difficulty: p => DEGREE_SETS.find(s => s.id === p.set).d + (p.prog ? 1.4 : 0),
    label: p => DEGREE_SETS.find(s => s.id === p.set).set.join(' · ') + (p.prog ? ' · progressions' : '') + ' · ' + p.n + ' questions',
    steps: p => [{ t: 'quiz', quiz: 'degres', set: DEGREE_SETS.find(s => s.id === p.set).set, prog: p.prog, n: p.n }],
    judge(res, p) {
      if (!res || !res.n) return { y: null, success: null, fb: [] };
      const y = res.correct >= p.n - 1 ? 1 : res.correct >= Math.ceil(p.n * 0.6) ? 0.5 : 0;
      return { y, success: y === 1, fb: [{ kind: y === 1 ? 'good' : 'warn', text: res.correct + '/' + res.n + ' justes' }].concat(res.confusions ? [{ kind: 'info', text: res.confusions }] : []), metrics: { pc: +(res.correct / res.n).toFixed(2) } };
    },
  });

  EX.push({
    id: 'releve', name: 'Retrouve l’accord', comp: 'oreille', also: { accords: 0.2, harmonie: 0.2 }, kind: 'play', load: 0.6, pillar: 'oreille',
    why: 'Jouer d’oreille : tu entends un accord dans une tonalité donnée, tu le retrouves sur ta guitare. Le micro vérifie ton accord.',
    how: ['Écoute la tonalité (cadence), puis l’accord mystère.', 'Cherche-le sur ta guitare : essaie, compare, corrige.', 'Quand tu l’as, gratte-le franchement au signal.'],
    cue: 'Cherche d’abord la basse : chante la note grave de l’accord, trouve-la sur les cordes graves, puis la couleur (majeur/mineur).',
    candidates(ctx, r) {
      const out = [];
      const vs = vocab(ctx);
      for (const k of [7, 0, 2, 9, 4]) {
        const dia = T.diatonic(k, false).slice(0, 6).map(x => T.playable(x.sym)).filter(x => x && !x.simplified && vs.includes(x.v.id)).map(x => x.v.id);
        for (let size = 2; size <= dia.length; size++) {
          const set = dia.slice(0, size);
          // les degrés les plus utiles d'abord : I, V, IV, vi
          out.push({ key: k, chords: [pick(r, set), pick(r, set), pick(r, set)], set });
        }
      }
      return out;
    },
    difficulty: p => 0.6 + 0.5 * p.set.length + (p.key === 9 || p.key === 4 ? 0.3 : 0),
    label: p => 'En ' + T.keyName(p.key, false) + ' · parmi ' + p.set.map(vSym).join(', '),
    steps(p) {
      const steps = [];
      p.chords.forEach((v, i) => {
        steps.push({ t: 'listen', play: { kind: 'cadence', key: p.key, then: v }, label: 'Accord mystère ' + (i + 1) + '/3 (en ' + T.keyName(p.key, false) + ')', sub: 'Possibles : ' + p.set.map(vSym).join(', '), replay: true });
        steps.push({ t: 'wait', label: 'Cherche-le sur ta guitare', sub: 'Essaie, compare avec le modèle (« Réécouter »), puis touche « Je l’ai ».', button: 'Je l’ai', replay: { kind: 'cadence', key: p.key, then: v } });
        steps.push({ t: 'play', label: 'Au signal : gratte ton accord une fois', rec: { kind: 'cues', cues: [{ at: 1.0, v, limit: 2.5 }], vocab: p.set }, sec: 4, hidden: true });
      });
      return steps;
    },
    multi: true,
    judge(res, p, ctx, extra) {
      const all = (extra && extra.multi) || [res];
      const fb = [];
      let good = 0;
      all.forEach((r, i) => {
        const c = r && r.cues && r.cues[0];
        if (c && c.hit && c.ok) { good++; fb.push({ kind: 'good', text: (i + 1) + '. ' + vSym(p.chords[i]) + ' ✓' }); }
        else fb.push({ kind: 'bad', text: (i + 1) + '. C’était ' + vSym(p.chords[i]) + ' (' + T.roman(T.voicing(p.chords[i]).sym, p.key, false) + ')' + (c && c.heard ? ' — tu as joué ' + vSym(c.heard) : '') + '.' });
      });
      const y = good === all.length ? 1 : good >= 2 ? 0.5 : 0;
      return { y, success: y === 1, fb, metrics: { good } };
    },
  });

  EX.push({
    id: 'cartes', name: 'Révision express', comp: 'harmonie', also: {}, kind: 'quiz', load: 0, pillar: 'oreille',
    why: 'Tonalités, capo, degrés, notes du manche : quelques cartes par jour, revues juste avant de les oublier (répétition espacée, FSRS). Se tester fait mieux retenir que relire (Roediger & Karpicke 2006). Et c’est une vraie pause pour les doigts (Simmons et al. 2019).',
    how: ['Lis la question et cherche la réponse dans ta tête AVANT que les choix apparaissent.', 'Puis choisis.', 'Les cartes ratées reviennent en fin de série et demain.'],
    cue: 'Réponds d’abord dans ta tête : c’est l’effort de rappel qui fixe la mémoire.',
    candidates: () => [{ max: 12 }],
    difficulty: () => 3,
    label: () => 'Cartes du jour',
    steps: p => [{ t: 'quiz', quiz: 'cartes', max: p.max }],
    judge(res) {
      if (!res || !res.n) return { y: null, success: null, fb: [{ kind: 'info', text: 'Aucune carte à revoir aujourd’hui.' }] };
      return { y: null, success: null, fb: [{ kind: res.correct >= res.n * 0.8 ? 'good' : 'warn', text: res.correct + '/' + res.n + ' justes du premier coup' }], metrics: { pc: +(res.correct / res.n).toFixed(2) }, cardsDone: true };
    },
  });

  /* -------------------------------------------------- musique */
  const VOICE_LEVELS = [
    { id: 'compter', name: 'en comptant à voix haute', d: 0.6, text: '« 1 et 2 et 3 et 4 et »' },
    { id: 'parler', name: 'en parlant en rythme', d: 1.3, text: '« Au clair de la lune, mon ami Pierrot, prête-moi ta plume, pour écrire un mot » — dit en rythme' },
    { id: 'fredonner', name: 'en fredonnant la mélodie', d: 1.9, text: 'Fredonne (bouche fermée) la mélodie de ta chanson, ou « Au clair de la lune »' },
    { id: 'chanter', name: 'en chantant', d: 2.5, text: 'Chante les paroles de ta chanson (ou « Au clair de la lune »)' },
  ];
  C.VOICE_LEVELS = VOICE_LEVELS;
  EX.push({
    id: 'chanter', name: 'Chanter en jouant', comp: 'chant', also: { pulsation: 0.25, rythmiques: 0.2 }, kind: 'play', load: 0.6, pillar: 'musique',
    why: 'Pour chanter par-dessus, la main droite doit devenir automatique. On ajoute la voix par paliers (compter, parler, fredonner, chanter) : un geste bien automatisé résiste à une tâche en plus (Beilock et al. 2002). Le micro vérifie que la rythmique reste en place pendant que tu chantes.',
    how: ['Lance la rythmique avec le métronome.', 'Ajoute la voix dès la 2ᵉ mesure : ' + 'compter, parler, fredonner ou chanter selon le palier.', 'La main droite ne doit pas changer : c’est elle que le micro écoute.'],
    cue: 'Laisse la main droite « en pilote automatique » : ton attention va à la voix et au sens des mots.',
    candidates(ctx, r) {
      const out = [];
      const pats = C.strumsFor(ctx).filter(id => T.strum(id).sub === 2);
      const seqs = [];
      if (ctx.songPairs && ctx.songPairs[0]) seqs.push(ctx.songPairs[0]);
      const ps = pairs(ctx, r, { max: 2 }); if (ps[0]) seqs.push(ps[0]);
      if (!seqs.length) seqs.push([ctx.easyChord || 'Em']);
      for (const p of pats) for (let tempo = 60; tempo <= 120; tempo += 8) for (const seq of seqs) for (const lv of VOICE_LEVELS) out.push({ p, tempo, seq, voice: lv.id });
      return out;
    },
    difficulty(p) { const pat = T.strum(p.p); return T.strumCost(pat) + C.tempoCost(pat.sub, p.tempo) + (p.seq.length > 1 ? 0.25 * meanCost(p.seq) : 0) + VOICE_LEVELS.find(v => v.id === p.voice).d - 0.2; },
    label: p => T.strum(p.p).name + ' · ' + p.tempo + ' BPM · ' + VOICE_LEVELS.find(v => v.id === p.voice).name,
    steps(p, ctx) {
      const pat = T.strum(p.p), lv = VOICE_LEVELS.find(v => v.id === p.voice);
      const score = rhythmScore({ strum: p.p, seq: p.seq, bpc: pat.sig, tempo: p.tempo, bars: 6 });
      const lyr = ctx && ctx.songLyrics && (p.voice === 'chanter' || p.voice === 'parler') ? 'Ou les paroles de ta chanson : « ' + ctx.songLyrics + ' »' : '';
      return [
        { t: 'show', pattern: p.p, v: p.seq, label: 'Rythmique + voix (' + lv.name + ')', sub: lv.text + (lyr ? '. ' + lyr : '') },
        { t: 'listen', play: { kind: 'pattern', strum: p.p, seq: p.seq, bpc: pat.sig, tempo: p.tempo, bars: 1 }, label: 'Le motif' },
        { t: 'play', label: 'Joue, et ' + lv.name.replace('en ', '') + ' dès la 2ᵉ mesure', rec: { kind: 'rhythm', tol: 55, voice: p.voice !== 'compter' || true }, score, voiceText: lv.text },
      ];
    },
    judge(res, p, ctx, extra) {
      const fb = recordingIssues(res);
      if (!res || !res.ok || !res.events) return { y: null, success: null, fb };
      const n = res.events.length, ex = (res.extras || []).length;
      const voiceOk = res.voiceShare == null || res.voiceShare >= 0.15;
      let y = res.hitRate >= 0.88 && ex <= Math.max(1, Math.round(n * 0.08)) && res.mae <= 55 ? 1 : res.hitRate >= 0.7 && res.mae <= 90 ? 0.5 : 0;
      if (!voiceOk) { y = Math.min(y, 0.5); fb.push({ kind: 'warn', text: 'Je n’ai presque pas entendu ta voix : le but est de la garder du début à la fin.' }); }
      else if (res.voiceShare != null) fb.push({ kind: 'good', text: 'Voix présente ✓' });
      rhythmFeedback(res, (extra && extra.score) || rhythmScore({ strum: p.p, seq: p.seq, bpc: 4, tempo: p.tempo }), 55).forEach(f => fb.push(f));
      const solo = ctx && ctx.patternStat ? ctx.patternStat(p.p) : null;
      if (solo && solo.mae && isFinite(res.mae)) { const cost = res.mae - solo.mae; if (cost > 8) fb.push({ kind: 'info', text: 'Avec la voix, ton écart au clic passe de ' + f0(solo.mae) + ' à ' + f0(res.mae) + ' ms : la main droite n’est pas encore tout à fait automatique. Reviens au palier précédent quelques prises.' }); }
      return { y, success: y === 1, fb, metrics: { hit: +res.hitRate.toFixed(2), mae: +(res.mae || 0).toFixed(1), voice: res.voiceShare != null ? +res.voiceShare.toFixed(2) : null }, chant: y === 1 ? { p: p.p, tempo: p.tempo, voice: p.voice } : null };
    },
  });

  /** Mesures d'une section → suite d'accords à la demi-mesure (2 accords max par mesure). */
  function sectionSeq(sec) {
    const seq = [];
    sec.bars.forEach(bar => { if (bar.length >= 2) { seq.push(bar[0]); seq.push(bar[1]); } else { seq.push(bar[0]); seq.push(bar[0]); } });
    return seq;
  }
  C.sectionSeq = sectionSeq;
  EX.push({
    id: 'chanson', name: 'Ma chanson (section)', comp: 'chansons', also: { changements: 0.3, rythmiques: 0.2 }, kind: 'play', load: 1.0, pillar: 'musique',
    why: 'Tout ce que tu travailles sert ici : une section de ta chanson, à un tempo et une rythmique réglés pour réussir, qui montent vers la vraie version. Le micro vérifie les accords mesure par mesure. Varier le tempo de façon logique d’une prise à l’autre, c’est ce que font les meilleurs (Duke, Simmons & Cash 2009).',
    how: ['Regarde la grille de la section.', 'Écoute le modèle au tempo de travail.', 'Joue avec le métronome, sans t’arrêter même si tu te trompes.'],
    cue: 'Joue la chanson, pas les accords : pense à l’ambiance et aux mots qui arrivent.',
    candidates(ctx) {
      const sg = ctx.song; if (!sg || !sg.sections || !sg.sections.length) return [];
      const out = [];
      const modes = Array.from(new Set(['r0', 'r1', sg.strum || 'r3']));
      sg.sections.forEach((sec, i) => { if (!sec.bars || !sec.bars.length) return; for (const mode of modes) for (const ratio of [0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]) out.push({ song: sg.id, sec: i, ratio, mode }); });
      return out;
    },
    difficulty(p, ctx) {
      const sg = ctx.song, sec = sg && sg.sections[p.sec];
      if (!sec) return NaN;
      const tempo = Math.round(sg.tempo * p.ratio), pat = T.strum(p.mode || sg.strum || 'r3');
      const seq = sectionSeq(sec), uniq = seq.filter((x, i) => i === 0 || x !== seq[i - 1]);
      const changesPerBar = Math.max(1, (uniq.length) / sec.bars.length);
      const rate = tempo / 4 * changesPerBar;
      return Math.max(C.dRhythmChange(meanCost(uniq.length > 1 ? uniq : [uniq[0], uniq[0]]), rate), T.strumCost(pat) + C.tempoCost(pat.sub, tempo)) + 0.15 + 0.04 * sec.bars.length;
    },
    label: (p, ctx) => { const sg = ctx.song; return (sg ? sg.sections[p.sec].name : 'Section') + ' · ' + Math.round((sg ? sg.tempo : 90) * p.ratio) + ' BPM · ' + (T.strum(p.mode || 'r3') || {}).name; },
    steps(p, ctx) {
      const sg = ctx.song, sec = sg.sections[p.sec], tempo = Math.round(sg.tempo * p.ratio), pat = T.strum(p.mode || sg.strum || 'r3');
      const seq = sectionSeq(sec);
      let score;
      if (pat.id === 'r0') {
        // un coup à chaque changement d'accord (et au début de chaque mesure)
        score = rhythmScore({ seq, bpc: 2, tempo, bars: sec.bars.length, sub: 1 });
        score.events = score.events.filter((e, i, arr) => e.beat % 4 === 0 || (e.beat % 2 === 0 && e.v !== (arr.find(z => z.beat === e.beat - 2) || {}).v));
        score.strum = 'r0';
      } else score = rhythmScore({ strum: pat.id, seq, bpc: 2, tempo, bars: sec.bars.length });
      return [
        { t: 'show', songSection: { song: sg.id, sec: p.sec }, label: sg.title + ' — ' + sec.name, sub: tempo + ' BPM (' + Math.round(p.ratio * 100) + ' % du tempo) · ' + pat.name, pattern: pat.id },
        { t: 'listen', play: { kind: 'pattern', strum: pat.id, seq: seq.slice(0, 4), bpc: 2, tempo, bars: 2 }, label: 'Le début, au tempo de travail' },
        { t: 'play', label: sec.name + ' : sans t’arrêter', rec: { kind: 'rhythm', tol: 70, save: true }, score, showSong: { song: sg.id, sec: p.sec } },
      ];
    },
    judge(res, p) {
      const fb = recordingIssues(res);
      if (!res || !res.ok || !res.events) return { y: null, success: null, fb };
      const segs = (res.chords || []).filter(c => c.ok != null), ok = segs.filter(c => c.ok).length;
      const segRate = segs.length ? ok / segs.length : 0;
      const y = segRate >= 0.9 && res.hitRate >= 0.85 ? 1 : segRate >= 0.7 && res.hitRate >= 0.7 ? 0.5 : 0;
      fb.push({ kind: segRate >= 0.9 ? 'good' : 'warn', text: ok + '/' + segs.length + ' accords reconnus au bon moment · ' + Math.round(res.hitRate * 100) + ' % des coups en place' });
      segs.filter(c => !c.ok).slice(0, 2).forEach(c => fb.push({ kind: 'bad', text: 'Là où il faut ' + vSym(c.v) + ', j’ai entendu ' + (c.heard ? vSym(c.heard) : 'autre chose') + '.' }));
      if (isFinite(res.mean) && Math.abs(res.mean) > 45) fb.push({ kind: 'tip', text: res.mean < 0 ? 'Tu pousses le tempo : pose-toi sur le clic.' : 'Tu traînes derrière le clic : pense au prochain accord un temps à l’avance.' });
      return { y, success: y === 1, fb, metrics: { segRate: +segRate.toFixed(2), hit: +res.hitRate.toFixed(2), ratio: p.ratio }, song: { id: p.song, sec: p.sec, ratio: p.ratio, mode: p.mode, ok: y === 1 } };
    },
  });

  EX.push({
    id: 'filage', name: 'Filage (comme sur scène)', comp: 'chansons', also: { chant: 0.4 }, kind: 'song', load: 1.2, pillar: 'musique',
    why: 'Jouer la chanson entière, en chantant, sans t’arrêter quoi qu’il arrive, en t’enregistrant : la pression légère d’une prise unique prépare à jouer devant les autres (Oudejans & Pijpers 2009). Tu réécoutes et tu notes ce qui était réussi.',
    how: ['Une seule prise, du début à la fin.', 'Si tu te trompes, continue comme sur scène.', 'Réécoute-toi et coche ce qui était réussi.'],
    cue: 'Raconte l’histoire de la chanson à quelqu’un : la guitare est là pour la porter.',
    candidates: ctx => (ctx.song ? [{ song: ctx.song.id }] : []),
    difficulty: (p, ctx) => (ctx.song ? ctx.song.diff || 4 : NaN),
    label: (p, ctx) => (ctx.song ? ctx.song.title : 'Ta chanson'),
    steps: () => [{ t: 'song', pressure: true }],
    judge: () => ({ y: null, success: null, fb: [] }),
  });

  const COMPO = {
    grille: { name: 'Écrire une grille', d: 2.4, how: ['Choisis une tonalité facile à jouer.', 'Construis une boucle de 4 accords avec la contrainte du jour.', 'Écoute-la, ajuste, puis joue-la toi-même.'] },
    rythme: { name: 'Trouver le groove', d: 3.0, how: ['Prends ta grille.', 'Essaie 3 rythmiques et 2 tempos.', 'Garde celle qui colle à l’émotion voulue.'] },
    melodie: { name: 'Une mélodie sur ta grille', d: 4.4, how: ['Lance ta boucle.', 'Fredonne une mélodie : notes de l’accord sur les temps forts, petits pas entre elles.', 'Enregistre 2 ou 3 essais, garde le meilleur.'] },
    structure: { name: 'Couplet et refrain', d: 5.4, how: ['Écris une grille de couplet et une de refrain qui contrastent.', 'Le refrain monte (énergie, accords plus « ouverts », mélodie plus haute).', 'Enchaîne les deux et écoute.'] },
    texte: { name: 'Paroles qui chantent', d: 4.0, how: ['Écris 4 vers sur ta mélodie ou ta grille.', 'Place les syllabes accentuées sur les temps forts.', 'Lis-les à voix haute en rythme avant de les chanter.'] },
  };
  C.COMPO = COMPO;
  EX.push({
    id: 'compo', name: 'Atelier composition', comp: 'composition', also: { harmonie: 0.3 }, kind: 'compose', load: 0.3, pillar: 'musique',
    why: 'Composer s’apprend comme le reste : par des contraintes précises et beaucoup d’essais. Les chansons pop réutilisent quelques progressions (I–V–vi–IV…) ; les connaître et les détourner, c’est le point de départ. Tes idées sont gardées dans « Studio ».',
    how: ['Lis la contrainte du jour.', 'Construis, écoute, ajuste.', 'Garde ton idée et note-la.'],
    cue: 'Cherche une émotion précise, pas « une belle suite d’accords ».',
    candidates(ctx) {
      const out = [];
      for (const task of Object.keys(COMPO)) out.push({ task });
      return out.filter(p => !(p.task === 'structure' && (ctx.block || 1) < 3) && !(p.task === 'melodie' && (ctx.block || 1) < 2));
    },
    difficulty: p => COMPO[p.task].d,
    label: p => COMPO[p.task].name,
    steps: p => [{ t: 'compose', task: p.task }],
    judge(res) {
      if (!res) return { y: null, success: null, fb: [] };
      const fb = [];
      if (res.melody && res.melody.n) fb.push({ kind: res.melody.strongRatio >= 0.6 ? 'good' : 'info', text: Math.round(100 * (res.melody.strongRatio || 0)) + ' % de tes notes sur les temps forts sont des notes de l’accord' + (res.melody.strongRatio >= 0.6 ? ' : ta mélodie colle à l’harmonie.' : ' : essaie de poser plus de notes de l’accord sur les temps 1 et 3.') });
      return { y: null, success: null, fb, metrics: res.melody ? { strong: res.melody.strongRatio } : {} };
    },
  });

  /* -------------------------------------------------- échauffement, pauses, retour au calme */
  EX.push({
    id: 'accordage', name: 'Accordage', comp: null, kind: 'tune', load: 0, pillar: 'echauffement', warm: true,
    why: 'Une guitare fausse rend tout faux, même les accords bien faits — et fausse aussi la mesure du micro.',
    how: ['Gratte les 6 cordes à vide une fois : je vérifie l’accordage.', 'Corrige les cordes signalées avec l’accordeur, une à une.'],
    cue: 'Monte toujours vers la note juste (desserre un peu, puis remonte) : la corde tient mieux l’accord.',
    candidates: () => [{}], difficulty: () => 0, label: () => '6 cordes', steps: () => [{ t: 'tune' }], judge: () => ({ y: null, success: null, fb: [] }),
  });
  EX.push({
    id: 'echauffe', name: 'Échauffement doux', comp: null, kind: 'guided', load: 0.2, pillar: 'echauffement', warm: true,
    why: 'Quelques minutes de jeu facile et léger réveillent les doigts sans les fatiguer.',
    how: ['Doigts 1-2-3-4 sur les cases 1 à 4, corde par corde, au clic.', 'Appuie à peine : juste assez pour que la note ne frise pas.', 'Secoue les mains 10 secondes à la fin.'],
    cue: 'Le moins de force possible : la note doit sonner, pas la corde s’écraser.',
    candidates: () => [{ sec: 90 }], difficulty: () => 0, label: p => Math.round(p.sec / 60 * 10) / 10 + ' min',
    steps: p => [{ t: 'timer', sec: p.sec, label: '1-2-3-4, léger', play: { kind: 'clicks', tempo: 60 } }],
    judge: () => ({ y: null, success: null, fb: [] }),
  });
  EX.push({
    id: 'pause', name: 'Pause des doigts', comp: null, kind: 'guided', load: 0, pillar: 'echauffement', rest: true,
    why: 'Une courte pause sans geste au milieu de la séance soulage la peau et les tendons — et les pauses « sans geste » aident la consolidation (Simmons et al. 2019).',
    how: ['Pose la guitare.', 'Secoue les mains, ouvre-ferme les poings, respire.'],
    cue: 'Relâche les épaules et la mâchoire.',
    candidates: () => [{ sec: 45 }], difficulty: () => 0, label: () => '45 s',
    steps: p => [{ t: 'timer', sec: p.sec, label: 'Pause' }],
    judge: () => ({ y: null, success: null, fb: [] }),
  });
  EX.push({
    id: 'libre', name: 'Jeu libre', comp: null, kind: 'guided', load: 0.3, pillar: 'echauffement', cooldown: true,
    why: 'Finir en jouant ce que tu aimes, sans objectif : le plaisir et l’autonomie entretiennent la motivation (Wulf & Lewthwaite 2016).',
    how: ['Joue ce que tu veux : ta chanson, une grille, une improvisation.', 'Puis note une intention précise pour la prochaine fois.'],
    cue: 'Joue pour toi.',
    candidates: () => [{ sec: 90 }], difficulty: () => 0, label: () => '1–2 min',
    steps: p => [{ t: 'timer', sec: p.sec, label: 'Joue ce que tu aimes' }],
    judge: () => ({ y: null, success: null, fb: [] }),
  });

  /** Difficulté la plus basse que l'exercice peut proposer dans ce contexte (pour éviter un exercice hors de portée). */
  C.minDifficulty = function (ex, ctx, r) {
    let mn = Infinity;
    for (const p of ex.candidates(ctx, r || Math.random)) { const d = ex.difficulty(p, ctx); if (d < mn) mn = d; }
    return mn;
  };
  C.EXERCISES = EX;
  C.EX = {}; EX.forEach(e => { C.EX[e.id] = e; });
  C.byComp = comp => EX.filter(e => e.comp === comp);

  /* ---------------------------------------------------------------- oreille fine : ZEST */
  // Estimation bayésienne adaptative du seuil (King-Smith et al. 1994) : densité sur log(cents), Weibull.
  C.zest = {
    init(start, slope) {
      const grid = [], post = [];
      for (let l = Math.log(1.5); l <= Math.log(150); l += 0.02) { grid.push(l); post.push(Math.exp(-0.5 * Math.pow((l - Math.log(start || 30)) / 1.2, 2))); }
      return { grid, post, beta: slope || 2.2, n: 0, correct: 0 };
    },
    pc(z, cents, l) { const t = Math.exp(l) / 0.8714; return 0.5 + 0.47 * (1 - Math.exp(-Math.pow(cents / t, z.beta))); },
    next(z) {
      let s = 0, m = 0; for (let i = 0; i < z.grid.length; i++) { s += z.post[i]; m += z.post[i] * z.grid[i]; }
      return Math.min(120, Math.max(2, Math.exp(m / s)));
    },
    update(z, cents, ok) {
      for (let i = 0; i < z.grid.length; i++) { const p = C.zest.pc(z, cents, z.grid[i]); z.post[i] *= ok ? p : 1 - p; }
      let mx = 0; for (const v of z.post) mx = Math.max(mx, v); for (let i = 0; i < z.post.length; i++) z.post[i] /= mx;
      z.n++; if (ok) z.correct++;
    },
    estimate(z) {
      let s = 0, m = 0; for (let i = 0; i < z.grid.length; i++) { s += z.post[i]; m += z.post[i] * z.grid[i]; }
      const mu = m / s;
      let v = 0; for (let i = 0; i < z.grid.length; i++) v += z.post[i] * Math.pow(z.grid[i] - mu, 2);
      const sd = Math.sqrt(v / s);
      return { threshold: Math.exp(mu), lo80: Math.exp(mu - 1.28 * sd), hi80: Math.exp(mu + 1.28 * sd), n: z.n, correct: z.correct };
    },
  };

  AC.catalog = C;
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})(typeof globalThis !== 'undefined' ? globalThis : this);
