<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# KeyMine — instructions pour les agents

Course de frappe multijoueur en temps réel (travail de session Web V). Le
cahier des charges officiel est `docs/cahier-des-charges.pdf` : **c'est la
référence**, avec ses identifiants (`AUTH-01`, `SALLE-04`, `COURSE-06`,
`BOT-05`, `TECH-07`…). Ne jamais se fier à d'anciens identifiants (`COUR-`,
`JEU-`, `TXT-`, `H16`…) : ils viennent d'une version abandonnée.

## Règles non négociables du cahier des charges

- **TypeScript à 100 %** : aucun `.js`/`.jsx`/`.mjs` écrit à la main (les
  scripts de `scripts/` sont en `.ts`), `strict: true`, aucun `any` explicite, aucun `@ts-ignore` /
  `@ts-expect-error` sans commentaire justificatif.
- **PostgreSQL** obligatoire. Migrations SQL versionnées dans `db/migrations/`
  (runner maison `db/migrate.ts`) et un script de **seed** (corpus de textes,
  utilisateurs, historique).
- **Toute entrée serveur est validée par Zod** : routes API, actions serveur
  et messages WebSocket (TECH-07).
- **Serveur autoritaire** : temps, progression, classement et bonus sont
  décidés côté serveur (COURSE-06). Actions d'hôte autorisées côté serveur
  (SEC-01).
- **Aucun texte en dur dans l'interface** : tout passe par le dictionnaire
  FR/EN (I18N-01). Dates et nombres formatés selon la langue (I18N-03).
- **Pas de secret commité** ; toute variable d'environnement est documentée
  dans `.env.example` (TECH-10).
- **Le nom et le logo viennent de l'étudiant, sans IA** (DES-01, DES-02).
  Ne jamais proposer ni inventer de nom, de logo ou de moodboard.
  `docs/DEMARCHE-CREATIVE.md` est rédigé par l'étudiant ; palette et
  typographies sont centralisées en variables CSS pour être changées en un
  seul endroit.
- **Honnêteté de `docs/EXIGENCES.md`** : une exigence n'est « complète »
  que si elle est vérifiée (code + test ou vérification manuelle notée).
  Une fausse déclaration est plus pénalisée qu'un « partiel ». Mettre à
  jour ce fichier dans le **même commit** que le travail qu'il décrit.

## Architecture

- Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS v4, Bun.
- `app/` pages et routes API (`app/api/**`). `components/` composants UI.
- `lib/` logique serveur/partagée : `db.ts` (Drizzle ORM + pg), `auth/` (sessions
  JWT `jose`, invités, OAuth Discord/GitHub fait main), `lobby*.ts`, `stats.ts`,
  `text/` (génération de textes), `i18n.tsx`, `heatmap.ts`.
- `db/` : `migrations/*.sql`, `migrate.ts`, `schema.ts` (schéma Drizzle de
  toutes les tables — garder en phase avec les migrations ; vérifié par
  `tests/db/schema.test.ts`), `types.ts` (valeurs énumérées).
- `realtime/` : serveur WebSocket séparé (`ws`), `server.ts` + `bots.ts`.
  Lancé par `bun run realtime`, indépendant de Next.
- `scripts/` : outils de dev (Postgres embarqué, build contre une vraie base).
- `tests/unit` (Vitest) et `tests/e2e` (Playwright).
- Accès aux données : **Drizzle ORM** seulement (TECH-04 exige un ORM ; ADR-002
  dans `docs/ARCHITECTURE.md`). Pas de SQL écrit à la main hors des
  migrations, sauf un fragment `sql` dans une requête Drizzle quand l'ORM ne
  sait pas l'exprimer. Ne pas migrer vers Prisma : son binaire est bloqué par
  le réseau de l'environnement de dev.

## Commandes

```bash
bun install
bun run db:dev        # Postgres embarqué (laisser tourner)
bun run db:migrate    # appliquer les migrations
bun run dev:all       # Next + serveur temps réel
bun run lint && bun run typecheck && bun run test
bun run test:e2e      # Playwright (nécessite une base migrée)
```

`bun run typecheck` lance `next typegen` avant `tsc` (les types `PageProps`
et `LayoutProps` sont générés par Next).

## Environnement de travail (pièges connus)

- Le shell `device_bash` tourne dans une **VM Linux**, pas sur le Mac. Le
  `node_modules` du dossier partagé contient les binaires **macOS** : ne
  jamais lancer `bun install` ni les tests dans ce dossier depuis la VM.
  Travailler ainsi : éditer dans `~/mnt/keymine`, synchroniser vers une copie
  `~/work/keymine` (`rsync -a --exclude node_modules --exclude .next
  --exclude .data --exclude .git`), faire `bun install` et lancer
  lint/typecheck/tests/build **dans la copie**, puis commiter depuis
  `~/mnt/keymine`.
- `bun` est dans `~/.local/bin` (pas dans le PATH par défaut).
- Postgres embarqué : `scripts/build-with-db.ts <commande>` démarre une base
  jetable, migre, exécute la commande et arrête la base. Toujours
  `rm -rf .data` avant dans la copie de travail.
- Git ne peut pas supprimer ses verrous tant que la suppression n'est pas
  autorisée pour la session : si `.git/*.lock` traîne, le supprimer.
- `git push` échoue depuis la VM (pas d'identifiants) : c'est l'étudiant qui
  pousse, sauf si la session tourne sur le dépôt GitHub.

## Commits et tests

- **Commiter souvent** : une unité de travail vérifiée = un commit. Jamais de
  code qui ne passe pas lint + typecheck + tests. Un historique régulier et
  significatif est noté à la remise.
- Messages en français : `feat:`, `fix:`, `test:`, `docs:`, `chore:`,
  `refactor:`. Terminer par les lignes d'attribution demandées par la session
  (`Co-Authored-By` / `Claude-Session`).
- Chaque fonctionnalité ou correctif de logique vient avec ses tests
  unitaires (Vitest) ; un test e2e quand c'est un parcours utilisateur
  (connexion par mot de passe uniquement, TEST-03).
- Ne jamais pousser sur `main` sans accord : travailler sur une branche si la
  session a accès au dépôt GitHub.
- Quand une erreur de l'IA est détectée puis corrigée, ajouter une entrée à
  `docs/IA.md` (situation, détection, correction) : le livrable en exige 3.

## Décisions déjà prises (ne pas rouvrir sans raison)

- Temps réel : WebSocket via un serveur `ws` séparé (ADR dans
  `docs/ARCHITECTURE.md`).
- Auth : sessions JWT signées en cookie `httpOnly` ; OAuth Discord/GitHub
  sans jamais lire le courriel ; connexion mot de passe en plus (bcrypt).
- MPM et précision suivent l'annexe A du cahier des charges (MPM net =
  caractères corrects ÷ 5 ÷ minutes ; les espaces comptent).
- Les ambiguïtés du cahier se tranchent en documentant le choix dans
  `docs/EXIGENCES.md` (colonne « Notes et choix »).
