# ACCORD

Apprendre la guitare acoustique pour **s'accompagner en chantant** (à la Ed Sheeran, Justin Bieber…) et **composer ses propres chansons**, en une seule page web (`index.html`). Un programme de 16 semaines règle chaque séance sur ce que tu sais faire et sur la chanson que tu veux jouer. Rien ne quitte le téléphone : pas de compte, pas de serveur.

L'ancienne app d'exercices quotidiens reste disponible dans `corde.html` ; au premier lancement, ACCORD lit ses données (même adresse, même téléphone) pour proposer un point de départ.

## Pourquoi l'app ne t'écoute plus pour te juger

La version 1 jugeait le jeu au micro du téléphone. Je l'ai testée sur de vrais enregistrements de guitare passés dans une simulation de micro de téléphone (graves coupés, échos, gain automatique, bruit). Résultat :

- 1 coup de grattage sur 4 n'était pas détecté ;
- un accord propre sur deux était jugé « corde étouffée » ;
- 1 note sur 4 était mal reconnue, souvent à l'octave.

Un retour faux est pire que pas de retour : il fait corriger ce qui allait bien. La version 2 ne juge donc plus le jeu à l'oreille. Elle mesure exactement ce qui peut l'être, et elle t'apprend à t'écouter toi-même.

## Ce que fait l'app

- **Ta chanson au centre.** Colle la grille d'une chanson (copiée d'un site de tablatures, en ChordPro, ou en mesures `| C | G |`). L'app propose un capo pour des formes faciles, la transposition, et un score « prête à jouer » qui dit ce qui bloque (« Changement C → G : 22/min, il en faut 30 »). Les séances travaillent ses accords, ses changements et sa rythmique, puis la chanter en jouant, puis la jouer en entier.
- **Ce qui est mesuré exactement :**
  - **Tes tapes sur l'écran** : pulsation, puis rythmiques. Chaque tape est horodatée et comparée au clic. Le délai propre au téléphone (écran, haut-parleur, Bluetooth) est estimé puis retiré. L'app juge ta régularité, les coups manqués ou en trop (sur les silences du motif aussi), tes « haut » pressés, et ta dérive quand le clic se tait. Elle ne parle de dérive qu'au-delà du bruit de mesure.
  - **Ton chrono** : accords de mémoire, du signal à tes doigts posés.
  - **Ton compte** : changements d'accords en une minute, un record par paire.
  - **Tes réponses** : oreille fine (seuil estimé par ZEST), majeur/mineur, degrés, accord à retrouver sur la guitare, cartes de théorie en répétition espacée (FSRS).
- **Ce que tu évalues toi-même, guidé :**
  - **Corde par corde** : chaque corde de l'accord, une à une (claire, étouffée, ou elle frise). Avec une seule corde à la fois, l'oreille entend très bien.
  - **Critères après chaque prise jouée** avec le clic : « le rythme ne s'est jamais arrêté », « chaque changement tombait sur son temps »… Le micro t'enregistre pour que tu te réécoutes avant de cocher.
  - Ces réponses comptent moins qu'une mesure dans l'estimation de ton niveau (0,5 au lieu de 1), parce que l'auto-évaluation est souvent trop indulgente (Hewitt 2005).
  - Parfois, tu devines avant de voir la mesure ou avant de te réécouter. L'app suit à quel point ton ressenti en jouant est juste (« Ton écoute »).
- **L'accordeur, seul outil qui écoute encore, en mode guidé.** Tu choisis la corde, il ne cherche la note qu'autour d'elle : plus d'erreur d'octave. Un passe-bas corrige le biais des harmoniques aiguës. Il n'affiche « juste » que si la lecture est stable. Sur les mêmes enregistrements « téléphone », 97,5 % de ses lectures sont à ±5 cents en cordes acier (62 % avant ces corrections), 100 % en nylon. Une note de référence tenue permet aussi d'accorder à l'oreille.
- **Un vrai système d'apprentissage** (sources dans l'app, « Comment ça marche ») :
  - Chaque compétence (accords, changements, barrés, pulsation, rythmiques, picking, oreille, harmonie, chant + guitare, chansons, composition) a un niveau estimé et une incertitude.
  - Chaque exercice est réglé pour réussir environ 4 prises sur 5 : tempo, objectif, tolérance (Wilson et al. 2019 ; Guadagnoli & Lee 2004). Un exercice nouveau démarre plus facile (Maxwell et al. 2001).
  - Rythmique : tu la dis, tu la tapes, puis tu la joues. Le modèle joue la première mesure avec toi, puis tu continues seul (un guide qui s'efface : Winstein & Schmidt 1990).
  - Un accord nouveau au plus par séance (Allen 2013). Les exercices connus alternent (Shea & Morgan 1979 ; Carter & Grahn 2016). Une compétence oubliée revient d'elle-même.
  - Pauses sans geste (Simmons et al. 2019). Voix ajoutée par paliers : compter, parler, fredonner, chanter (Beilock et al. 2002). Filages enregistrés sous légère pression (Oudejans & Pijpers 2009).
  - Bilan d'entrée si tu joues déjà, puis bilans toutes les 4 semaines, avec seulement des mesures fiables. Forme du jour, doigts, douleur, charge de la semaine et échéance (anniversaire, scène ouverte) ajustent la séance.
- **Composer.** Studio : grilles dans une tonalité, accords empruntés, « et après ? » (enchaînements fréquents en pop), écoute en boucle avec la rythmique choisie, idées gardées. Ateliers guidés dans le programme : contraintes de grille, rythmique, mélodie fredonnée enregistrée pour la réécouter, structure, texte.
- **Outils.** Accordeur guidé, métronome (le clic peut se taire, tempo tapé), dictionnaire d'accords avec son, exercices au choix.

## Utilisation

Ouvre `index.html` depuis une adresse https (GitHub Pages par exemple), puis « Ajouter à l'écran d'accueil ». Le micro, s'il est autorisé, sert seulement à t'enregistrer et à l'accordeur.

Pour taper en rythme, pose le téléphone devant toi, haut-parleur à volume moyen ou casque **filaire**. Le Bluetooth fonctionne, mais son délai varie : évite-le pour ces exercices.

Sauvegarde : Réglages → Exporter (un fichier JSON à garder dans tes fichiers ou ton cloud), Importer pour restaurer. En passant de la version 1 à la version 2, les records mesurés au micro (changements/min, rythmiques, propreté des accords, sections) repartent de zéro, car ils n'étaient pas fiables. Le reste est gardé : niveaux (rendus incertains pour qu'ils se recalent vite), vocabulaire, oreille, cartes, chansons, idées et historique.

## Limites (honnêtement)

- Taper un motif mesure ton rythme, pas ton bras sur les cordes. C'est pourquoi chaque rythmique tapée est ensuite jouée à la guitare, réécoutée et notée par critères.
- L'auto-évaluation reste moins sûre qu'une mesure. Elle pèse moins dans ton niveau, elle s'appuie sur des critères précis et sur la réécoute, et l'app suit si ton ressenti devient plus juste.
- L'analyse des tapes est validée sur des tapeurs simulés (délai du téléphone, irrégularité, dérive, coups oubliés). L'accordeur est validé sur des guitares de synthèse et sur de vrais échantillons passés dans une simulation de micro de téléphone, pas encore sur un grand nombre de téléphones réels. Un accordeur à pince reste le plus sûr.

## Tests

- `node tests/run.js` (27 tests, environ 30 s, aucune dépendance). Ils couvrent :
  - la théorie : accords en français et en anglais, grilles collées, tonalité, capo, degrés ;
  - l'analyse des tapes : délai du téléphone retrouvé (Bluetooth compris), dispersion mesurée identique à celle des tapes, coups oubliés et tapes en trop, dérive de ±3–4 % mesurée à ±1 %, doubles croches, « haut » pressés ;
  - l'accordeur guidé : 6 cordes désaccordées, cordes inharmoniques, micro de téléphone, toutes les lectures stables à ±3 cents, fin de note tenue, nouvelle attaque prise en compte ;
  - la guitare de l'app, les exercices et leurs jugements (avec les poids des mesures), les cartes, l'état (dont le passage v1 → v2) et le programme de 16 semaines sur un élève simulé.
  - `node tests/run.js tapes` : seulement les tests dont le nom contient « tapes ».
- `node tests/browser.js` : il nécessite Playwright (`npm i -D playwright && npx playwright install chromium`). Il vérifie :
  - les sons de l'app dans un vrai moteur Web Audio (justesse, rythme, saturation) et la conversion d'une tape de l'écran vers l'horloge du son ;
  - le parcours de l'interface avec un micro factice : passage v1 → v2, premier lancement, chanson collée, studio, accordeur guidé ;
  - des séances complètes : vraies tapes envoyées sur l'écran, rythmique tapée puis jouée et notée, corde par corde, chrono, comptage, accord retrouvé, cartes, composition, filage, section de chanson, bilan interrompu puis repris, sauvegarde.

Le code est dans `index.html`, découpé en modules (`/* ==== theory.js ==== */`, `dsp.js`, `taps.js`, `gsynth.js`, `model.js`, `srs.js`, `catalog.js`, `state.js`, `planner.js`, puis `audio.js`, `ui-*.js`). Les modules avant `audio.js` sont purs (sans navigateur) : `tests/load.js` les charge tels quels.
