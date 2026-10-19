# Utilisation de l'IA

## Agents et outils utilisés

- **Claude (Anthropic)** via l'application de bureau Claude (mode Cowork / Claude Code) : écriture et refactorisation du code, des tests et de la documentation technique, sous la direction de l'équipe.
- Aucun outil d'IA n'a servi pour le **nom, le logo, le moodboard, la palette et les typographies** : cette partie est faite à la main par l'équipe (DES-01 à DES-03, voir `DEMARCHE-CREATIVE.md`).

## Fichiers d'instructions d'agent (commités)

- [`AGENTS.md`](../AGENTS.md) : règles du projet pour les agents (règles non négociables du cahier des charges, architecture, commandes, pièges d'environnement, règles de commit et de tests).
- [`CLAUDE.md`](../CLAUDE.md) : renvoie vers `AGENTS.md`.

## Trois situations où l'IA s'est trompée

Dix-huit erreurs ont été détectées et corrigées pendant le projet. Les trois ci-dessous sont les plus instructives ; toutes sont détaillées dans le [journal complet](IA-JOURNAL.md).

### 1. Un « ORM » qui n'en était pas un (TECH-04)

**Ce qui s'est passé.** Le cahier demande « PostgreSQL, avec l'ORM de votre choix (Prisma, Drizzle, etc.) ». Le binaire de Prisma ne se téléchargeait pas : l'agent a pris Kysely, un simple constructeur de requêtes, puis a déclaré TECH-04 « complet » avec la note « pas un ORM : choix à défendre ».
**Détection.** L'étudiant a relu le cahier et a demandé si on utilisait bien un ORM, puisque chaque exigence avait été annoncée comme vérifiée.
**Correction.** Tout l'accès aux données passe maintenant par Drizzle ORM (schéma dans `db/schema.ts`), migré fichier par fichier en 6 commits avec les tests à chaque étape. Un test vérifie que le schéma correspond aux migrations. Toutes les exigences ont ensuite été relues une par une contre le PDF. **Leçon :** un écart qu'on peut défendre reste un écart. L'exigence est alors « partielle », et c'est à l'étudiant de décider.

### 2. Un Dockerfile jamais lancé qui échouait au premier déploiement (TECH-05)

**Ce qui s'est passé.** L'agent avait écrit le `Dockerfile` sans pouvoir le lancer (pas de Docker dans son environnement), en notant TECH-05 « partiel ». Sur le vrai serveur, le build s'est arrêté : `next build` charge `lib/db.ts`, qui exige `DATABASE_URL`, absente au moment du build.
**Détection.** L'étudiant a lancé le build sur son VPS et a copié l'erreur (« DATABASE_URL manquant »).
**Correction.** Une adresse factice est donnée à la seule commande de build ; le correctif a été vérifié contre une base injoignable avant d'être livré. **Leçon :** un fichier de déploiement jamais exécuté reste une hypothèse.

### 3. La première frappe après le décompte pouvait être perdue (COURSE-03)

**Ce qui s'est passé.** La page de course n'acceptait la frappe que si le serveur avait annoncé le départ ET si sa propre horloge, mise à jour toutes les 200 ms, l'avait aussi vu passer. Juste après le décompte, une frappe immédiate pouvait être ignorée.
**Détection.** En lançant toute la suite e2e en local à la demande de l'étudiant : 3 à 4 tests échouaient sur une machine plus lente. L'enregistrement des messages WebSocket a montré la frappe partie sans qu'aucun avancement soit envoyé.
**Correction.** La frappe est acceptée dès l'annonce du serveur (ou dès l'heure de départ si l'annonce tarde), et l'écoute du clavier est posée avant l'affichage. Les 63 tests e2e passent. **Leçon :** un test qui échoue « seulement sur une machine lente » révèle un vrai problème que les joueurs rencontreront aussi.

### Les quinze autres, en une ligne

| N° | Erreur | Comment elle a été vue |
| --- | --- | --- |
| 1 | Matrice d'exigences avec de faux identifiants | relecture du PDF |
| 2 | Postgres de dev réinitialisé à chaque démarrage | script lancé deux fois |
| 3 | Retour dans une salle → erreur 500 ; invité pouvant devenir hôte | tests en base |
| 4 | Passages du corpus écrits de mémoire | comparaison mot à mot avec Gutenberg |
| 5 | Pénalité d'erreurs affichée mais jamais appliquée | l'étudiant, en jouant |
| 6 | Graphique « vérifié » mais inutile (secondes divisées par 1000) | l'étudiant, puis capture d'écran |
| 7 | Formulaire qui élargissait la page sur mobile | capture d'écran à 360 px |
| 8 | Animation qui cassait le contraste ; filtre de noms trop strict | audit axe ; tests de faux positifs |
| 9 | Référence de moodboard inventée | l'étudiant |
| 11 | I18N-01 « complet » avec des messages OAuth en dur | relecture des exigences |
| 12 | Refactor qui retenait l'avancement jusqu'à la fin du texte | nouveau test e2e des bonus |
| 13 | CONF-01 « complet » avec des durées hors du cahier | comparaison de la matrice avec le PDF |
| 14 | Photo absente de la salle ; lien refusé sans issue | l'étudiant, sur le site en ligne |
| 15 | Fusion invité → compte qui pouvait planter la connexion | nouveau test en base |
| 16 | Chaque déploiement aurait annulé l'XP dépensée | relecture de tout le code qui écrit l'XP |

## Réflexion sur notre façon de travailler avec les agents

_À rédiger par l'équipe, avec ses propres mots : ce qui a bien marché, ce qui a demandé de la vigilance, ce que nous referions autrement._

## Limites connues liées à l'IA

- Les passages du corpus (`db/seed-data/corpus.ts`) ont été vérifiés contre Project Gutenberg, mais pas contre Wikisource (inaccessible depuis l'environnement de travail).
- Le premier gros commit (1er octobre 2026, 62 fichiers) contient la base générée par l'agent en une séance ; le travail a ensuite été découpé en petits commits.
