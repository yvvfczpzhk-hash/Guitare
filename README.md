# ACCORD

Apprendre la guitare acoustique pour **s'accompagner en chantant** (à la Ed Sheeran, Justin Bieber…) et **composer ses propres chansons**, en une seule page web (`index.html`). Le micro du téléphone mesure ce que tu joues ; un programme de 16 semaines règle chaque séance sur tes mesures et sur la chanson que tu veux jouer. Rien ne quitte le téléphone : pas de compte, pas de serveur.

L'ancienne app d'exercices quotidiens reste disponible dans `corde.html` ; au premier lancement, ACCORD lit ses données (même adresse, même téléphone) pour proposer un point de départ.

## Ce que fait l'app

- **Ta chanson au centre.** Colle la grille d'une chanson (copiée d'un site de tablatures, en ChordPro, ou en mesures `| C | G |`) : capo conseillé pour des formes faciles, transposition, et un score « prête à jouer » avec ce qui bloque (« Changement C → G : 22/min, il en faut 30 »). Les séances travaillent ses accords, ses changements et sa rythmique, puis la chanter en jouant, puis la jouer en entier.
- **Mesuré au micro.**
  - Chaque coup de médiator comparé au clic du métronome (à quelques millisecondes près) ; la latence du téléphone est mesurée à chaque prise grâce à un clic aigu repéré dans l'enregistrement.
  - Coups manqués, coups en trop sur les « silences » du motif, frappes étouffées (« chuck ») de la pop percussive.
  - Pulsation quand le métronome se tait : tempo réellement tenu, accélération.
  - Accords : empreinte de chaque doigté ; corde à vide au lieu d'une case, case voisine, corde à éviter qui sonne.
  - Corde par corde : quelle corde est étouffée ou fausse, et quelle note sonne à la place.
  - Changements par minute sur chaque paire d'accords (seuls les changements propres comptent).
  - Accordeur 6 cordes d'un coup, puis aiguille corde par corde ; temps de formation d'un accord au signal ; main droite pendant que tu chantes ; mélodie fredonnée sur ta grille.
  - Capodastre : les accords écrits sous « Capo N » sont lus comme des formes ; les modèles sonnent à la vraie hauteur, l'analyse tient compte du capo et repère un capo oublié.
- **Un vrai système d'apprentissage** (sources dans l'app, « Comment ça marche ») :
  - Chaque compétence (accords, changements, barrés, pulsation, rythmiques, picking, oreille, harmonie, chant + guitare, chansons, composition) a un niveau estimé et une incertitude.
  - Chaque exercice est généré pour réussir environ 4 prises sur 5 (Wilson et al. 2019 ; Guadagnoli & Lee 2004). Un exercice nouveau démarre plus facile (Maxwell et al. 2001).
  - Un accord nouveau au plus par séance (Allen 2013). Les exercices connus alternent (Shea & Morgan 1979 ; Carter & Grahn 2016). Une compétence oubliée revient d'elle-même.
  - Écoute du modèle avant de jouer (Cash et al. 2014) ; retour bref après la prise ; parfois tu devines d'abord (« c'était propre ? »).
  - Pauses sans geste (Simmons et al. 2019) ; cartes de théorie en répétition espacée (FSRS).
  - Voix ajoutée par paliers : compter, parler, fredonner, chanter (Beilock et al. 2002). Filages enregistrés sous légère pression (Oudejans & Pijpers 2009).
  - Bilans au micro toutes les 4 semaines. Forme du jour, doigts, douleur, charge de la semaine et échéance (anniversaire, scène ouverte) ajustent la séance.
- **Composer.** Studio : grilles dans une tonalité, accords empruntés, « et après ? » (enchaînements fréquents en pop), écoute en boucle avec la rythmique choisie, idées gardées. Ateliers guidés dans le programme : contraintes de grille, rythmique, mélodie fredonnée analysée (notes de l'accord sur les temps forts, petits pas), structure, texte.
- **Outils.** Accordeur, métronome (le clic peut se taire, tempo tapé), dictionnaire d'accords avec son, exercices au choix, mesure de la latence.

## Utilisation

Ouvre `index.html` depuis une adresse https (GitHub Pages par exemple) — le micro l'exige —, puis « Ajouter à l'écran d'accueil ». Pendant les prises : téléphone posé à 30–60 cm de la rosace, haut-parleur à volume moyen (le clic est mesuré dans la prise) ou casque **filaire** ; pas de casque Bluetooth pour les exercices de rythme (latence trop longue et variable).

Sauvegarde : Réglages → Exporter (un fichier JSON à garder dans tes fichiers ou ton cloud), Importer pour restaurer.

## Ce que le micro ne sait pas faire (honnêtement)

- Une corde étouffée **dans un accord gratté** ne s'entend pas toujours : l'exercice « corde par corde » est là pour ça.
- La frisure (« bzzz ») et le sens des coups (bas/haut) ne sont pas mesurés de façon fiable : l'app ne les juge pas.
- Une voix mêlée à une guitare grattée aussi fort qu'elle n'est pas toujours séparable : « Chanter en jouant » juge la main droite (le vrai enjeu de cette double tâche) et ne pénalise pas une voix non détectée.
- Les mesures sont validées sur des guitares de synthèse réalistes (cordes inharmoniques, micro de téléphone, pièce réverbérante, bruit), pas encore sur un grand nombre de vraies guitares. Si une mesure te semble fausse, « Mesure fausse ? » la remplace par ton ressenti.

## Tests

- `node tests/run.js` : théorie (accords en français et en anglais, grilles collées, tonalité, capo, degrés), moteur d'analyse sur des guitares de synthèse (attaques, latence, rythmiques, frappes, pulsation, accords, diagnostic, changements par minute, corde par corde, accordeurs, temps de réaction, voix), guitare de synthèse de l'app, exercices, cartes, état et programme de 16 semaines sur un élève simulé. Aucune dépendance.
- `node tests/browser.js` : sons de l'app dans un vrai moteur Web Audio (justesse, accords reconnus, rythme, clics, saturation) et parcours de l'interface avec un micro factice (premier lancement, chanson collée, studio, outils, séances, reprise, sauvegarde). Nécessite Playwright (`npm i -D playwright && npx playwright install chromium`).

Le code est dans `index.html`, découpé en modules (`/* ==== theory.js ==== */`, `dsp.js`, `gsynth.js`, `model.js`, `srs.js`, `catalog.js`, `state.js`, `planner.js`, puis `audio.js`, `ui-*.js`). Les modules avant `audio.js` sont purs (sans navigateur) : `tests/load.js` les charge tels quels.
