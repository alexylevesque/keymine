# Utilisation de l'IA

## Agents et outils utilisés

- **Claude (Anthropic)** via l'application de bureau Claude (mode Cowork / Claude Code) : écriture et refactorisation du code, des tests et de la documentation technique, sous la direction de l'équipe.
- Aucun outil d'IA n'a servi pour le **nom, le logo, le moodboard, la palette et les typographies** : cette partie est faite à la main par l'équipe (DES-01 à DES-03, voir `DEMARCHE-CREATIVE.md`).

## Fichiers d'instructions d'agent (commités)

- [`AGENTS.md`](../AGENTS.md) : règles du projet pour les agents (règles non négociables du cahier des charges, architecture, commandes, pièges d'environnement, règles de commit et de tests).
- [`CLAUDE.md`](../CLAUDE.md) : renvoie vers `AGENTS.md`.

## Situations où l'IA s'est trompée

### 1. Une matrice d'exigences avec de faux identifiants

**Ce qui s'est passé.** Le premier README contenait un tableau d'exigences dont les identifiants (`COUR-1`, `JEU-8`…) venaient d'une ancienne version du travail, pas du PDF du cahier des charges. L'agent les présentait comme « le cahier des charges ».
**Détection.** En relisant le PDF officiel (`docs/cahier-des-charges.pdf`) : les identifiants (`SALLE-06`, `COURSE-06`, `CONF-03`…) ne correspondaient pas.
**Correction.** Le tableau a été supprimé et remplacé par `docs/EXIGENCES.md`, 90 lignes bâties sur les vrais identifiants, avec des statuts volontairement prudents. Règle ajoutée à `AGENTS.md` : le PDF fait foi.

### 2. Un script de base de données qui réinitialisait Postgres à chaque démarrage

**Ce qui s'est passé.** Le script `db:dev` (Postgres embarqué pour le développement) appelait `initialise()` à chaque lancement : au second démarrage, il tentait de recréer une base existante.
**Détection.** Lancement du script deux fois de suite pendant la mise en place de la CI et du seed.
**Correction.** Le script vérifie la présence de `PG_VERSION` avant d'initialiser ; le même garde-fou a été repris dans `scripts/build-with-db.ts`.

### 3. Une règle d'entrée en salle qui plantait dans un cas réel

**Ce qui s'est passé.** `joinLobby` ne regardait que les salles *actives* : une personne libérée automatiquement (absente) puis revenue dans la même salle provoquait une violation de l'index unique `lobby_players_user_unique` et une erreur 500. En parallèle, le transfert d'hôte pouvait désigner un invité, alors qu'un invité ne doit jamais gérer une salle.
**Détection.** En écrivant les tests d'intégration contre une vraie base (`tests/db/join.test.ts`, `tests/db/sweep.test.ts`) : le cas « libéré puis de retour » n'avait jamais été exercé à la main.
**Correction.** Réactivation de la ligne existante au lieu d'une insertion, rôle conservé, capacité vérifiée, et transfert limité aux comptes ; les tests restent dans la CI.

Autres erreurs corrigées en cours de route (plus petites) : curseur de capacité allant jusqu'à 100 alors que la validation serveur plafonne à 30 (le formulaire aurait été refusé), copie de travail effacée par une option `rsync` trop large, types `ws` manquants qui cassaient `tsc`. Les premiers tests dans un vrai navigateur ont aussi révélé quatre défauts que lint, types et tests unitaires ne voyaient pas : deux erreurs d'hydratation React sur la page de création de salle (durée formatée par `Intl` avec une espace insécable différente entre Node et Chrome, aperçu de texte tiré au hasard côté serveur), un changement de langue qui ne rafraîchissait pas les pages rendues côté serveur, et des textes illisibles en thème clair (couleurs fixes sur fond variable). Une capture d'écran de la page des résultats a ensuite montré un graphique vide : le serveur annonçait la fin de la course avant d'avoir écrit les résultats en base, et la page s'ouvrait sur des données incomplètes (ordre corrigé, test navigateur ajouté).

### 4. Des passages de corpus transcrits de mémoire

**Ce qui s'est passé.** L'agent avait écrit de mémoire les extraits d'œuvres du domaine public du corpus de textes, en les présentant comme des passages réels.
**Détection.** Vérification mot à mot de chacun des 21 passages contre Project Gutenberg : quatre coquilles (« Et bonjour » au lieu de « Hé ! bonjour » chez La Fontaine, « monsieur le baron » au lieu de « M. le baron » dans Candide, la ponctuation du Petit Poucet, une phrase de Dorian Gray coupée en plein milieu).
**Correction.** Passages corrigés ; les adaptations volontaires (vers fondus en prose, tirets longs remplacés par des virgules, graphie modernisée) sont documentées en tête de `db/seed-data/corpus.ts`.

### 5. Une option affichée mais jamais appliquée (pénalité d'erreurs)

**Ce qui s'est passé.** L'agent avait ajouté au formulaire, au schéma Zod et à la base l'option « Pénalité : +1 s par erreur non corrigée », mais le moteur de course ne la lisait jamais : l'interface promettait un comportement absent.
**Détection.** L'étudiant, en jouant : un joueur qui martelait le clavier terminait premier avec un temps très court. Aucun test ne couvrait l'option car aucun code ne l'utilisait.
**Correction.** Le moteur calcule maintenant le temps classé (temps réel + erreurs × pénalité, mode libre seulement), la pénalité est enregistrée (`penalty_ms`) et affichée ; sept tests unitaires et un test navigateur couvrent le cas. Leçon : tout réglage proposé dans l'interface doit avoir un test qui prouve son effet.

### 6. Un graphique « vérifié » qui n'affichait rien d'utile

**Ce qui s'est passé.** Le graphique du MPM de la page des résultats divisait par 1000 des temps déjà exprimés en secondes : tous les points tombaient à l'instant 0 et les courbes de tous les participants se superposaient sur une seule verticale.
**Détection.** L'étudiant a remarqué que les bots « se confondaient sur la même ligne » ; la correction a été confirmée sur une capture d'écran. Le test e2e existant ne comptait que le nombre de courbes (une par participant), pas leur forme.
**Correction.** Unité corrigée, test unitaire du moteur sur l'unité de `t`, tests du composant (courbes, masquage, étiquettes), et refonte du graphique pour qu'il reste lisible quand des courbes se superposent. Leçon : un test « il y a N éléments » ne prouve pas que le dessin est juste ; regarder le rendu.

### 7. Un formulaire qui élargissait toute la page sur mobile

**Ce qui s'est passé.** La carte des symboles du formulaire de création (rangées de touches de largeur fixe, dans une zone qui défile) était placée dans un `<fieldset>`. Un `fieldset` a par défaut une largeur minimale égale à celle de son contenu : à 360 px de large, la page entière s'élargissait à 526 px au lieu de faire défiler la carte seule.
**Détection.** Aucun test ne l'avait vu ; la capture d'écran à 360 px montrait la page plus large que l'écran, confirmée en mesurant `scrollWidth`.
**Correction.** `min-w-0` sur les `fieldset` et rangées de symboles refaites en 4 × 8 touches ; `scrollWidth` égal à la largeur de l'écran. Leçon : tester chaque nouvel écran à 360 px (DES-06), pas seulement au bureau.

### 8. Une animation qui cassait le contraste, et un filtre de noms trop zélé

**Ce qui s'est passé.** Deux fois dans la même série de changements : (a) une animation d'entrée qui faisait varier l'opacité des cartes a fait échouer la vérification de contraste d'axe (les couleurs sont mesurées en pleine transition) ; (b) le premier filtre de noms de salle refusait des mots légitimes (« Scunthorpe », « salopette », « Bordeleau ») parce qu'il cherchait des mots interdits à l'intérieur d'autres mots.
**Détection.** Le test d'accessibilité existant pour (a) ; des tests unitaires de faux positifs écrits exprès pour (b), puis un ordre de vérification corrigé (longueur, caractères, lettres, lien, liste).
**Correction.** Animations limitées au déplacement (sans opacité) ; mots courts ou ambigus retirés de la détection « collée », gardés seulement en comparaison mot entier. Leçon : un filtre de mots doit se tester avec des mots innocents autant qu'avec des mots interdits.

### 9. Une référence de moodboard inventée par l'agent

**Ce qui s'est passé.** En rédigeant la démarche créative à partir des mots de l'étudiant, l'agent a ajouté au moodboard un paragraphe sur un site de jeu de frappe (« Je l'ai parcouru pour voir comment il organise ses lobbys… »), écrit à la première personne comme si l'étudiant l'avait visité. Rien dans ce que l'étudiant avait dit ne le justifiait : le nom venait d'une note de travail, pas de lui. Or le cahier des charges demande une démarche créative personnelle (DES-01 à DES-03).
**Détection.** Au moment de prendre les captures, l'étudiant a demandé quel rapport ce site avait avec son projet ; l'agent a vérifié l'historique de la conversation et n'a rien trouvé.
**Correction.** Le paragraphe a été supprimé (par l'étudiant), le moodboard ne garde que les 5 références réellement consultées, chacune avec sa capture. Leçon : dans un document écrit « par l'étudiant », l'agent ne rédige que ce que l'étudiant a dit ou montré, sans compléter avec des détails plausibles.

### 10. Un Dockerfile jamais lancé qui échouait au premier vrai déploiement

**Ce qui s'est passé.** L'agent avait écrit le `Dockerfile` et le `docker-compose` de production sans pouvoir les lancer (pas de Docker dans son environnement), en le notant dans `docs/EXIGENCES.md` (TECH-05 « partiel »). Au premier déploiement réel, le build de l'image s'est arrêté : `next build` charge `lib/db.ts`, qui lève une erreur si `DATABASE_URL` est absente, et le Dockerfile ne la définissait pas au moment du build.
**Détection.** L'étudiant a lancé le build sur son serveur et a copié l'erreur (« DATABASE_URL manquant »).
**Correction.** Une adresse factice est fournie à la seule commande `bun run build` (aucune page n'interroge la base pendant le build) ; le build a été revérifié avec cette adresse sur une base injoignable avant de corriger le fichier. La vraie adresse arrive au démarrage par le docker-compose. Leçon : un fichier de déploiement non exécuté reste une hypothèse ; la mention « non testé » dans les exigences était justifiée.

### 11. Une exigence « complète » avec des messages codés en dur

**Ce qui s'est passé.** I18N-01 était noté « complet » dans `docs/EXIGENCES.md`, mais les routes OAuth (Discord et GitHub) renvoyaient vers la page de connexion avec un message en français écrit en dur dans l'URL (« Échec de la connexion GitHub »), affiché tel quel, même en anglais. En plus, la page affichait n'importe quel texte passé dans `?error=` : un lien piégé pouvait y faire apparaître un faux message.
**Détection.** En relisant les exigences encore « partielles » avec l'étudiant, une recherche des chaînes `encodeURIComponent("…")` dans `app/api` a montré ces quatre messages ; le test d'usage des clés de traduction ne les voyait pas, car il ne cherche que les appels `t("…")`.
**Correction.** Les routes renvoient maintenant un code (`oauth_failed` ou `oauth_not_configured`) et le fournisseur ; la page de connexion valide ces deux valeurs avec Zod et affiche le message traduit du dictionnaire, sinon rien. Tests unitaire et e2e ajoutés (message traduit, texte libre ignoré). Leçon : une exigence « complète » se revérifie quand on ajoute une fonctionnalité qui la touche (ici, l'OAuth ajouté après coup).

### 12. Un refactor qui retenait l'avancement jusqu'à la fin du texte

**Ce qui s'est passé.** Pour tester le regroupement des envois (TECH-06), l'agent a sorti la logique dans `lib/race/throttle.ts` et l'a branchée dans la page de course avec un `useEffect` qui recréait le regroupeur à chaque nouvelle fonction `send`. Or cette fonction change à chaque rendu : l'envoi en attente était annulé à chaque frappe, et le serveur ne recevait l'avancement qu'au début et à la fin du texte. Les tests unitaires du regroupeur passaient, et les tests e2e de course aussi (l'envoi immédiat de fin de texte suffisait à finir la course).
**Détection.** En écrivant le test e2e des bonus (BONUS-03), aucun bonus ne se déclenchait : le serveur voyait le joueur à 3 MPM. L'agent a enregistré les messages WebSocket envoyés par la page : un seul message pendant toute la rafale.
**Correction.** Le regroupeur est créé une seule fois et appelle la dernière version de `send` par une référence. Nouveau test e2e qui lit les messages WebSocket envoyés : moins de messages que de frappes, et le dernier contient bien la dernière frappe. Leçon : tester un utilitaire isolé ne suffit pas, il faut aussi tester son branchement dans la page.

### 13. Une exigence « complète » qui ne respectait pas le cahier (temps maximal)

**Ce qui s'est passé.** CONF-01 était noté « complet » avec « durée max 15 s à 2 h ». Le cahier des charges demande pourtant « aucun, ou une durée entre 30 secondes et 10 minutes » : l'agent avait vérifié que le réglage existait et était validé, sans relire les bornes exactes du cahier.
**Détection.** En relisant les exigences de configuration pour répondre aux retours de l'étudiant sur le formulaire de création, l'agent a comparé chaque ligne de `docs/EXIGENCES.md` au texte du PDF.
**Correction.** Choix « Sans limite » puis de 30 s à 10 min ; règle commune au formulaire, au schéma Zod et à une contrainte en base (migration 0012, qui ramène les anciennes salles dans l'intervalle) ; course sans limite gérée par le moteur (fin quand tous ont fini) et chronomètre du temps écoulé. Tests unitaires et e2e. Leçon : une exigence se coche contre le texte exact du cahier, pas contre le souvenir qu'on en a.

### 14. Deux oublis trouvés par l'étudiant en testant le site en ligne

**Ce qui s'est passé.** (a) Après l'ajout de l'avatar généré (AUTH-03), la salle d'attente montrait ce motif même pour un compte avec photo : la liste des joueurs n'avait jamais reçu les photos, et l'agent ne l'avait pas vérifié avec un vrai compte. (b) Sur la page d'un lien d'invitation refusé, le bouton « Annuler » fermait le message et laissait la page sur « Un instant… » sans fin.
**Détection.** L'étudiant, en testant keymine.quest avec son compte Discord et un lien déjà utilisé.
**Correction.** (a) La photo du compte est transmise dans l'état de la salle (test en base et e2e). (b) Sur les pages qui n'ont rien d'autre à montrer (lien d'invitation, lien direct d'une salle), un refus propose « Retour à l'accueil » (test e2e). Leçon : vérifier une fonctionnalité visuelle avec les vrais cas (compte avec photo, lien déjà utilisé), pas seulement le cas le plus simple.

### 15. Une fusion invité → compte qui pouvait planter la connexion

**Ce qui s'est passé.** La fonction qui donne au compte les courses jouées en invité (`mergeGuestHistory`, appelée à l'inscription, à la connexion et après l'OAuth) avait été écrite par l'agent sans test. Elle réassignait toutes les lignes de salle de l'invité au compte d'un coup. Si le compte était déjà dans la même salle (deux onglets), ou déjà actif dans une autre salle, la base refusait la mise à jour (index uniques de SALLE-06) et la connexion échouait avec une erreur 500.
**Détection.** En écrivant enfin le test en base de cette fusion, à la demande de l'étudiant : le cas « même salle » a échoué sur `lobby_players_user_unique`.
**Correction.** La fusion se fait dans une transaction : la ligne en double de l'invité est retirée (ses courses pointent vers la ligne du compte), et sa place active est libérée si le compte est déjà dans une salle. Cinq tests en base (`tests/db/guest-merge.test.ts`). Leçon : du code sans test, même court, cache des cas limites ; les contraintes de la base en font partie.

### 16. Chaque déploiement aurait rendu l'XP dépensée en boutique

**Ce qui s'est passé.** Le script qui reprend l'XP des anciennes courses (`db/xp-backfill.ts`, lancé par le seed à chaque déploiement) recalculait l'XP totale de chaque compte comme la somme de ses courses. C'était juste quand l'XP ne venait que des courses. En ajoutant la boutique, l'enchantement et les objets jetés, l'agent n'a pas revu ce script : à chaque déploiement, toute l'XP dépensée (ou gagnée hors course) aurait été annulée.
**Détection.** En préparant les prix du classement (de l'XP donnée hors course), l'agent a relu tout ce qui écrit `users.xp_total` et a trouvé ce recalcul.
**Correction.** Le script ajoute seulement l'XP des courses qu'il vient de calculer, sans jamais recalculer le total. Nouveau test en base : un achat, puis un deuxième seed, et l'XP dépensée reste dépensée. Leçon : quand une valeur gagne une nouvelle source de changement, il faut chercher tout le code qui l'écrit, pas seulement celui qu'on ajoute.

## Réflexion sur notre façon de travailler avec les agents

_À rédiger par l'équipe, avec ses propres mots : ce qui a bien marché, ce qui a demandé de la vigilance, ce que nous referions autrement._

## Limites connues liées à l'IA

- Les passages du corpus de textes (`db/seed-data/corpus.ts`) ont été vérifiés contre Project Gutenberg mais pas contre Wikisource (inaccessible depuis l'environnement de travail) ; une relecture rapide sur Wikisource avant la remise reste souhaitable pour les textes français.
