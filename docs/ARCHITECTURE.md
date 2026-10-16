# Architecture de KeyMine

Document vivant : il décrit les choix techniques et leur justification. L'état d'avancement exigence par exigence est dans [`EXIGENCES.md`](./EXIGENCES.md) ; ce document explique le *pourquoi*. Version initiale du checkpoint 1.

## 1. Vue d'ensemble

```mermaid
flowchart LR
  Browser["Navigateur<br/>(React 19, Tailwind)"]
  Next["Next.js 16<br/>pages + routes API (HTTP)"]
  RT["Serveur temps réel<br/>(ws, Bun/TypeScript)"]
  PG[("PostgreSQL")]
  Browser -- "HTTPS : pages, API" --> Next
  Browser -- "WSS : salle, course" --> RT
  Next -- "Kysely (SQL)" --> PG
  RT -- "Kysely + LISTEN/NOTIFY" --> PG
```

Deux processus applicatifs partagent la même base :

- **Next.js** sert les pages et les routes API HTTP (authentification, création/entrée en salle, profil, historique, résultats). Toute entrée est validée par Zod (TECH-07).
- **Le serveur temps réel** (`realtime/`) porte les WebSocket : présence dans la salle d'attente et déroulement des courses. Il est le **seul autorité** pendant une course (COURSE-06).

PostgreSQL est la source de vérité durable. Les deux processus ne s'appellent pas entre eux : ils se coordonnent par la base (écritures + notifications `LISTEN/NOTIFY`).

## 2. Modèle de données

```mermaid
erDiagram
  users ||--o{ key_stats : "heatmap par touche"
  users ||--o{ lobbies : "héberge (host_user_id)"
  lobbies ||--o{ lobby_players : "contient"
  users ||--o{ lobby_players : "joue (ou invité : guest_id)"
  lobbies ||--o{ races : "enchaîne"
  races ||--o{ race_participants : "classe"
  users ||--o{ race_participants : "historique"
  lobby_players ||--o| race_participants : "figé au départ"

  users {
    uuid id PK
    text username UK
    text password_hash
    text display_name
    text avatar_url
    int best_wpm
    int total_races
  }
  lobbies {
    uuid id PK
    text code UK "6 caractères sans 0/O/1/I/L"
    uuid host_user_id FK
    text access "public | unlisted | private"
    text status "lobby | countdown | racing | finished | closed"
    text text_type "coherent | aleatoire"
    text complexity "easy | medium | hard"
    int max_players "2 à 30"
    int duration_seconds "0 (sans limite) ou 30 à 600"
  }
  lobby_players {
    uuid id PK
    uuid lobby_id FK
    uuid user_id FK "ou guest_id"
    text role "participant | spectator"
    bool is_bot
    bool active "unique par personne (SALLE-06)"
    timestamptz last_seen_at
  }
  races {
    uuid id PK
    uuid lobby_id FK
    text text_content
    text status "countdown | racing | finished"
    timestamptz starts_at
  }
  race_participants {
    uuid id PK
    uuid race_id FK
    uuid user_id FK
    int progress_chars
    real wpm
    real accuracy
    int rank
    jsonb key_correct
    jsonb key_errors
  }
  corpus_texts {
    int id PK
    text language
    text content
    text difficulty "easy | medium | hard"
  }
  corpus_words {
    int id PK
    text language
    text word
    int frequency_rank
  }
```

Points notables :

- **Une seule salle par personne (SALLE-06)** est garantie par la base, pas seulement par l'interface : deux index uniques partiels (`lobby_players_one_room_user` / `_guest`, `where active`). Un déclencheur libère les joueurs quand la salle passe à `closed`.
- **Invités** : pas de ligne `users` ; identité = cookie JWT signé (`km_guest`) avec pseudonyme, stockée dans `lobby_players.guest_id`. À la connexion, l'historique de l'invité est fusionné dans son compte.
- **Corpus en base (CONF-03)** : `corpus_texts` (passages du domaine public, difficulté calculée) et `corpus_words` (dictionnaire classé par rang de fréquence), remplis par `db/seed.ts`.
- **Migrations** : fichiers SQL versionnés dans `db/migrations/`, appliqués par `db/migrate.ts` (table `_migrations`). Types Kysely écrits à la main dans `db/types.ts`.

## 3. Machine à états de la course (COURSE-01)

États du cahier : `EN_ATTENTE → DÉCOMPTE → EN_COURSE → RÉSULTATS → (EN_ATTENTE | FERMÉE)`, stockés dans `lobbies.status`.

| État du cahier | Valeur en base | Ce qui est possible |
| --- | --- | --- |
| EN_ATTENTE | `lobby` | On rejoint, on quitte ; l'hôte règle la salle, ajoute des bots, expulse, démarre (≥ 2 participants dont ≥ 1 humain). |
| DÉCOMPTE | `countdown` | Décompte synchronisé 3-2-1 ; le texte n'est envoyé qu'au début du décompte ; on ne peut plus rejoindre (SALLE-09). |
| EN_COURSE | `racing` | Frappe, progression serveur-autoritaire, bonus, abandon, reconnexion sous 30 s. |
| RÉSULTATS | `finished` | Podium, tableau, graphiques ; l'hôte relance (→ EN_ATTENTE) ou ferme (→ FERMÉE) ; on peut encore rejoindre. |
| FERMÉE | `closed` | Plus d'accès ; les joueurs sont libérés (déclencheur SQL). |

```mermaid
stateDiagram-v2
  [*] --> EN_ATTENTE : création de la salle
  EN_ATTENTE --> DÉCOMPTE : l'hôte démarre (≥ 2 participants, ≥ 1 humain)
  DÉCOMPTE --> EN_COURSE : fin du décompte (heure serveur)
  EN_COURSE --> RÉSULTATS : tous terminés/abandonnés ou temps écoulé
  RÉSULTATS --> EN_ATTENTE : l'hôte relance
  EN_ATTENTE --> FERMÉE : l'hôte ferme, ou plus aucun compte présent (SALLE-08)
  RÉSULTATS --> FERMÉE : l'hôte ferme
  DÉCOMPTE --> FERMÉE : plus aucun humain
  FERMÉE --> [*]
```

Les transitions autorisées sont codées dans une table unique (`lib/race/state.ts`) et testées ; toute écriture de `lobbies.status` passe par elle.

## 4. Temps réel : ADR-001

**Décision** : WebSocket (bibliothèque `ws`) dans un processus séparé, avec `LISTEN/NOTIFY` PostgreSQL pour propager les changements de salle.

**Contexte** : il faut (a) une liste de présence à jour sans rechargement, (b) une piste de progression avec ≥ 4 mises à jour perçues par seconde, (c) un serveur autoritaire, (d) un déploiement simple sur un seul VPS.

| Option | Pour | Contre |
| --- | --- | --- |
| Polling HTTP | Trivial | Latence, charge, pas de poussée serveur ; refusé comme mécanisme principal (gardé en repli). |
| Server-Sent Events | Simple, reconnexion native | Un seul sens : la progression des joueurs devrait passer par des POST. |
| MQTT | Pub/sub mûr | Broker supplémentaire à déployer et sécuriser, mal adapté à l'état autoritaire. |
| **WebSocket (`ws`)** | Bidirectionnel, faible latence, simple | Process à part (Next.js ne gère pas bien les WS persistants). |

**Conséquences** :

- Authentification à la connexion par les **cookies signés** (`km_session` / `km_guest`) vérifiés avec le même secret ; contrôle de l'en-tête `Origin` ; sans cookie valide la connexion est fermée (code 4401).
- Tous les messages entrants sont décrits par des schémas **Zod** (`realtime/protocol.ts`) ; un message invalide est ignoré, un flux trop rapide est limité (PERF-02).
- Salle d'attente : des triggers SQL émettent `pg_notify('lobby_changed', code)` ; le serveur temps réel écoute, recharge l'instantané et pousse à chaque client **sa** vue (qui est l'hôte, qui est moi, qui est connecté). Les battements de présence n'émettent pas de notification.
- Repli : si le WebSocket échoue, la page de salle interroge l'API HTTP et envoie un battement de présence ; le WebSocket est retenté en arrière-plan.
- Présence : l'hôte absent 30 s est remplacé par le compte connecté présent depuis le plus longtemps ; s'il n'en reste aucun, la salle est fermée (SALLE-08). Un joueur silencieux 60 s est libéré.

## 5. Course serveur-autoritaire (COURSE-06)

Le client n'envoie que son **avancement** (caractères validés, erreurs, compteurs par touche). Le serveur :

- fixe lui-même l'heure de départ et de fin ;
- recalcule le MPM (`caractères corrects / 5 / minutes`) ; un MPM fourni par le client n'est jamais lu ;
- **rejette les progressions impossibles** : retour en arrière, saut supérieur à ce que permet la vitesse maximale (250 MPM) plus une petite marge, dépassement de la longueur du texte ;
- calcule le classement (COURSE-10) et applique les bonus.

## 6. Bots (BOT-01 à BOT-05) : approche

Les bots sont simulés **côté serveur** par un moteur pur et **déterministe** : `(niveau, graine, texte, temps écoulé) → caractères tapés`. La graine rend le moteur testable unitairement (même graine ⇒ même course).

- Cinq niveaux (Noob, Débutant, Intermédiaire, Expert, Impossible) avec une plage de MPM et un taux d'erreur ; valeurs ajustées et documentées dans `lib/race/bots.ts`.
- La vitesse **varie** : bruit lissé (accélérations/ralentissements), hésitations aléatoires, ralentissement sur les mots longs ou accentués.
- Une erreur coûte du temps de correction ; en mode « correction obligatoire » le bot s'arrête jusqu'à avoir corrigé, en mode « libre » il continue et l'erreur est comptée.
- Les bots reçoivent bonus et malus comme les humains et sont identifiés dans l'interface.

## 7. Bonus de remontée (BONUS-01 à 04) : règle documentée

Quand les bonus sont activés :

1. Les points de contrôle sont atteints quand le **meneur** passe 25 %, 50 % et 75 % de **son** texte.
2. À chaque point de contrôle, est « en retard » tout participant qui est **dernier** ou à **plus de 25 points de pourcentage** derrière le meneur (le meneur lui-même n'est jamais en retard).
3. Chaque joueur en retard reçoit **un** bonus par point de contrôle, **3 au maximum par course**.
4. Types (tirés avec la graine de la course) : `-3 mots` (retire 3 mots au texte du retardataire), `+3 mots` (ajoute 3 mots au texte du meneur), `brouillard` (les prochains mots du meneur sont flous quelques secondes).
5. La progression est toujours calculée **par rapport au texte courant du joueur** ; le MPM brut compte les caractères réellement tapés, ce qui reste cohérent quand un texte est allongé ou raccourci.

## 8. Complexité du texte (CONF-05) : critères mesurables

Mot (texte aléatoire) :

- **facile** : 2 à 5 lettres, sans accent ;
- **moyen** : 4 à 8 lettres ;
- **difficile** : 7 lettres ou plus, ou mot accentué de 6 lettres ou plus.

Passage (texte cohérent), mesuré à l'import (`lib/text/difficulty.ts`) : longueur moyenne des mots et part de caractères « spéciaux » (accents, ponctuation, chiffres) :

- **facile** : longueur moyenne ≤ 4,8 et spéciaux ≤ 3 % ;
- **difficile** : longueur moyenne ≥ 5,6 ou spéciaux ≥ 8 % ;
- **moyen** : le reste.

Choix pour CONF-06/07 : en mode cohérent, le vrai passage est tapé **tel qu'écrit** (majuscules, ponctuation, accents, chiffres) ; les options de texte et l'inclusion/exclusion de caractères sont **désactivées** en mode cohérent et ne s'appliquent qu'au texte aléatoire (l'exclusion l'emporte sur l'inclusion). Les accents ne s'appliquent qu'au français.

### Expérience et niveaux (fonctionnalité ajoutée)

Ajout demandé par l'étudiant, hors cahier des charges (règles validées le 16 octobre 2026). Code : `lib/xp.ts` (règles pures, testées), `lib/xp-award.ts` (fin de course), `db/xp-backfill.ts` (historique), migration `0013_experience.sql`.

- **Niveaux** : courbe de Minecraft, sans maximum. Passer du niveau n au suivant demande 2n + 7 XP (n ≤ 15), 5n − 38 (16 à 30), puis 9n − 158.
- **XP d'une course** : 10 × complexité (facile 1, moyen 1,5, difficile 2) × longueur (mots ÷ 40, entre 0,5 et 3) × adversaires (1 + poids ÷ 10, au plus 4 ; noob 0,5, débutant 1, intermédiaire 1,5, expert 2, impossible 3, humain 2) × place (1er 2, 2e 1,5, 3e 1,25, autres 1, temps écoulé 0,5), arrondi, + 5 XP à 95 % de précision ou + 10 XP à 100 %.
- **Abandon volontaire** : perte d'un niveau complet, la barre garde son pourcentage (rien au niveau 0), annoncée dans la fenêtre de confirmation. Une déconnexion ne coûte rien.
- **Qui** : comptes seulement (pas les invités ni les bots, AUTH-03), participants seulement. L'XP est calculée par le serveur temps réel à la fin de la course (serveur autoritaire) et enregistrée par participation (`xp_gained`, négative pour un abandon) ; `users.xp_total` en est la somme.
- **Historique** : le seed calcule une fois l'XP des courses jouées avant l'ajout (anciens abandons sans perte).
- **Affichage** : barre style Minecraft (niveau vert, 18 segments) dans l'en-tête et en grand sur le profil, colonne « XP » dans le classement des résultats.

### Inventaire, boutique, craft et four (fonctionnalité ajoutée)

Ajout demandé par l'étudiant, hors cahier des charges (règles validées le 16 octobre 2026). Code : `lib/items.ts` (catalogue, prix, effets), `lib/inventory.ts` (cases, déplacements, recettes 3 × 3, four, effets de l'équipement : logique pure, testée), `lib/shop.ts` (offres du jour), `lib/inventory-store.ts` (base de données, transactions), routes `app/api/inventory` et `app/api/shop` (Zod), pages `/inventaire` et `/boutique`, migration `0014_inventaire.sql`. Les icônes sont des dessins pixel originaux (`components/items/ItemIcon.tsx`), pas les textures de Minecraft.

- **Serveur autoritaire** : le client envoie une intention (déplacer, fabriquer, acheter, activer) ; le serveur verrouille la ligne du compte (`select … for update`), valide avec la logique pure, puis enregistre. Un refus (case interdite, sac plein, XP insuffisante) ne change rien.
- **Inventaire** : 4 cases d'armure, table de craft 3 × 3, four (minerai, charbon, sortie), sac de 27 cases ; piles de 64 (armure, totem, bouclier, potion : 1). Déplacement au clic ou toucher (prendre puis poser, avec TOUT / MOITIÉ / 1), au clavier (Entrée, Échap) ou par glisser-déposer. Chaque case a un petit (i) qui ouvre la fiche de l'objet.
- **Recettes** (comme Minecraft, motif n'importe où sur la table) : casque 5, plastron 8, jambières 7, bottes 4 matériaux (cuir, lingot de cuivre, de fer, d'or, diamant) ; lingot de netherite = 4 fragments + 4 lingots d'or ; pièce en netherite = pièce en diamant + 1 lingot de netherite.
- **Four** : minerai + charbon → lingot (débris antique → fragment de netherite), 10 s par objet, 8 objets par charbon. La cuisson continue page fermée : à chaque lecture, le serveur rattrape le temps écoulé depuis `furnaces.updated_at` (pas de tâche de fond).
- **Boutique** : 6 offres par jour et par compte, tirées au premier passage (graine = compte + jour : testable), renouvelées à minuit heure de Toronto. Raretés : commun 60 % (8 achats par jour), peu commun 25 % (4), rare 12 % (2), épique 3 % (1). Payé en XP : le niveau peut baisser. Pièce d'armure « déjà faite » : environ 70 % du coût de ses matériaux, jamais en netherite.
- **Effets en course** : au départ, l'armure portée et l'objet activé sont figés dans `race_participants.loadout` (l'objet est consommé). Esquive d'un malus (+3 mots, brouillard) par pièce : cuir 2 %, cuivre 3 %, fer 4 %, or 3 %, diamant 6 %, netherite 8 % ; armure complète +5 % (maximum 37 %). L'or donne +5 % d'XP par pièce, +10 % pour l'armure complète (maximum +30 %). Objets à usage unique : pomme dorée enchantée (tous les malus bloqués), vision nocturne (brouillard), bouclier (premier malus), fiole d'expérience (+50 % d'XP), totem d'immortalité (pas de perte de niveau à l'abandon). Un malus arrêté est annoncé dans la course (`blocked` dans le bonus) ; le retardataire a quand même joué son bonus. Le tirage d'esquive utilise le générateur de la course, seulement si la cible porte de l'armure.
- **Usure** : chaque course jouée enlève 1 de durabilité aux pièces portées (cuir 20, cuivre 30, fer 50, or 25, diamant 100, netherite 150) ; à 0, la pièce se brise.
- **Charbon au podium** : sur le podium d'une course finie avec au moins un adversaire, 60 % de chance au 1er (1 ou 2 charbons), 40 % au 2e et 25 % au 3e (1 charbon). Annoncé dans les résultats ; perdu si le sac est plein.
- **Qui** : comptes seulement, comme l'XP (les invités voient une invitation à créer un compte).

## 9. Authentification et sécurité

- Comptes : mot de passe haché (bcrypt), session JWT en cookie `httpOnly`, `sameSite=lax`, `secure` en production ; verrouillage temporaire après des échecs répétés ; OAuth Discord/GitHub optionnels.
- Invités : pseudonyme (3 à 20 caractères) dans un cookie JWT signé ; un invité **ne crée pas** de salle et ne peut pas être hôte.
- Validation : Zod sur toutes les routes et tous les messages temps réel ; requêtes SQL paramétrées (Kysely) ; WebSocket protégé par origine + cookie ; limitation de débit des messages.

### Invitations, expulsions et limitation des tentatives (SALLE-03, 04, 07, 10)

- **Liens d'invitation** : jeton aléatoire de 256 bits stocké en base (`lobby_invites`), plusieurs liens par salle avec libellé et statut (non utilisé, utilisé par…, révoqué). Au premier usage, le lien est lié à la personne **et à son adresse IP** par une mise à jour atomique (`where claimed_ip is null`) : si deux personnes cliquent en même temps, une seule gagne. Ensuite seule la même IP peut le réutiliser. L'IP est la dernière entrée de `X-Forwarded-For` : cela suppose le reverse proxy du déploiement (voir `DEPLOIEMENT.md`).
- **Accès** : publique (listée), sur code (non listée, code ou lien), privée (lien seulement, l'hôte et les personnes déjà présentes restent admis). Le code seul ne suffit jamais pour une salle privée.
- **Expulsion** : la ligne `lobby_players` est supprimée, une ligne de `lobby_bans` interdit le retour (compte ou invité) et les liens utilisés par cette personne sont révoqués. Tous les liens deviennent invalides à la fermeture de la salle.
- **Force brute (SALLE-10)** : 10 tentatives *échouées* par minute et par IP (code inconnu, salle privée sans lien, lien invalide), puis 429. Les entrées réussies ne comptent pas, pour qu'une classe derrière une même IP puisse jouer.

### Fin de course et résultats (RES-02)

À la fin d'une course, le serveur temps réel écrit **d'abord** les résultats en base (classement, MPM, précision, série de MPM, touches), **puis** annonce la fin aux clients. Les clients redirigent vers `/resultats/<code>` dès qu'ils reçoivent l'annonce : dans l'ordre inverse, la page s'ouvrait sur des données incomplètes (bug trouvé par un test navigateur). Aucun autre tick ne diffuse pendant l'écriture.

### Interface : langue et identité

La langue est décidée côté serveur (cookie `km_lang`, sinon `Accept-Language`) ; changer de langue réécrit le cookie et rafraîchit les pages rendues côté serveur. Les erreurs d'API sont traduites côté serveur (`lib/api-messages.ts`) et les noms de bots sont recomposés depuis leur niveau (`lib/bot-name.ts`). L'identité affichée dans l'en-tête (pseudo, photo ou « Invité ») est lue une fois dans `app/layout.tsx` et passée par un contexte (`lib/viewer.tsx`). Tout texte tiré au hasard (aperçu des réglages) n'est calculé qu'après l'hydratation, et les formats qui dépendent des données `Intl` (espaces insécables) sont écrits à la main pour la durée : sinon Node et le navigateur produisent des textes différents et React échoue à l'hydratation.

## 10. Stratégie de tests

| Niveau | Outil | Ce qui est couvert |
| --- | --- | --- |
| Unitaires | Vitest | Génération et complexité du texte, protocole Zod, schémas des entrées et audit des routes API, regroupement des envois, avatar généré, limiteur, authentification WebSocket, bots, états. |
| Intégration base | Vitest + Postgres réel (`bun run test:db`) | Contraintes SALLE-06, notifications, balayage d'hôte (salle d'attente, résultats et course), règles d'entrée en salle, seed idempotent, serveur temps réel complet avec vrais cookies. |
| Bout en bout | Playwright (Chromium) | 56 tests : accueil, langue et thème, 360 px, inscription/connexion par mot de passe, photo et pseudonyme, téléversements refusés, avatar généré, salle privée par lien, rejoindre par code, explorateur et partie rapide, force brute sur les codes, course complète hôte + invité + bot jusqu'aux résultats et « rejouer », modes d'erreur, rechargement en course, bonus, envois WebSocket regroupés, expulsion, réglages en direct, actions réservées à l'hôte (401/403), 30 participants (images/s), parcours au clavier, audit d'accessibilité axe dans les deux thèmes (salle, course et résultats compris). |
| CI | GitHub Actions | Lint, typecheck, tests unitaires ; Postgres 18 pour migrations, tests base, build et e2e (Playwright démarre aussi le serveur temps réel). |

## 11. Décisions notables (ADR courts)

- **ADR-002 — Kysely plutôt qu'un ORM complet.** Le cahier laisse le choix de l'« ORM ». Kysely est un *query builder* typé : le SQL reste visible, les migrations sont du SQL versionné, pas de génération de code ni de moteur binaire à déployer. Compromis : les types de tables sont écrits à la main.
- **ADR-003 — Bun.** Un seul outil pour installer, exécuter les scripts TypeScript (migrations, seed, serveur temps réel) et lancer les tests ; le même binaire sert en production.
- **ADR-004 — Rôle d'hôte réservé aux comptes.** « Personne humaine connectée » est interprété comme un compte : un invité ne peut pas créer de salle (AUTH), donc pas la gérer non plus.
