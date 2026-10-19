# KeyMine

Jeu de courses de frappe multijoueur en temps réel : tout le monde tape le même
texte, la progression de chacun s'affiche en direct sur une piste, et le
classement est calculé par le serveur. Projet de session du cours Web V.

- Cahier des charges : [`docs/cahier-des-charges.pdf`](docs/cahier-des-charges.pdf)
- Avancement exigence par exigence : [`docs/EXIGENCES.md`](docs/EXIGENCES.md)
- Architecture et décisions : [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- Utilisation de l'IA : [`docs/IA.md`](docs/IA.md)
- Déploiement sur un VPS : [`docs/DEPLOIEMENT.md`](docs/DEPLOIEMENT.md)

## Stack

Next.js 16 (App Router) · React 19 · TypeScript strict · Tailwind CSS v4 ·
**PostgreSQL** (ORM Drizzle + `pg`, migrations SQL versionnées) · serveur WebSocket
séparé (`ws`) avec `LISTEN/NOTIFY` · Zod · Vitest · Playwright · Bun.

## Installation locale

Prérequis : [Bun](https://bun.sh) 1.4+ et une base PostgreSQL. Deux options :

**Option A — PostgreSQL via Docker Compose (recommandé)**

```bash
docker compose up -d          # Postgres 18 sur localhost:5432
cp .env.example .env          # puis DATABASE_URL="postgresql://keymine:keymine@localhost:5432/keymine"
```

**Option B — Postgres embarqué (aucune installation, dev seulement)**

```bash
bun run db:dev                # dans un terminal à part, le laisser ouvert
cp .env.example .env          # la valeur par défaut de DATABASE_URL convient
```

Ensuite :

```bash
bun install
bun run db:migrate            # applique les migrations
bun run db:seed               # corpus de textes, dictionnaires, comptes et historique de démo
bun run dev:all               # site (http://localhost:3000) + serveur temps réel (port 4001)
```

### Compte de démonstration

| Nom d'utilisateur | Mot de passe |
| --- | --- |
| `alice` (aussi `bruno`, `camille`, `dani`, `eloi`) | `demo1234` |

Chaque compte a un historique d'une quinzaine de courses (profil, statistiques,
carte de chaleur du clavier).

## Variables d'environnement

Voir `.env.example`.

| Variable | Rôle |
| --- | --- |
| `DATABASE_URL` | Connexion PostgreSQL |
| `SESSION_SECRET` | Signature des cookies de session et d'invité (`openssl rand -base64 32`) |
| `NEXT_PUBLIC_SITE_URL` | URL publique du site ; sert aussi à contrôler l'origine des WebSocket |
| `REALTIME_PORT` | Port du serveur temps réel (défaut `4001`) |
| `NEXT_PUBLIC_REALTIME_URL` | URL WebSocket utilisée par le navigateur (`ws://localhost:4001` en local) |
| `REALTIME_ALLOWED_ORIGINS` | Origines supplémentaires autorisées pour les WebSocket (optionnel) |
| `DISCORD_CLIENT_ID` / `_SECRET`, `GITHUB_CLIENT_ID` / `_SECRET` | Connexion OAuth (optionnel) |
| `SEED_DEMO_USERS` | `false` pour ne pas créer les comptes de démonstration (production) |

## Commandes

| Commande | Rôle |
| --- | --- |
| `bun run dev:all` | Site + serveur temps réel en développement |
| `bun run db:migrate` / `bun run db:seed` | Migrations / données de démonstration |
| `bun run db:import-corpus` | Ajoute des centaines de passages tirés de livres du domaine public (Project Gutenberg ; Internet requis, idempotent) |
| `bun run lint` / `bun run typecheck` | Qualité du code |
| `bun run test` | Tests unitaires (Vitest) |
| `bun run test:db` | Tests d'intégration contre PostgreSQL (`DATABASE_URL` migrée requis) |
| `bun run test:e2e` | Tests de bout en bout (Playwright, Chromium) : base migrée requise ; Playwright démarre `bun run start` et `bun run realtime` s'ils ne tournent pas (faire `bun run build` avant) |
| `bun run build` / `bun run start` | Production |

Pour les tests de bout en bout, installer le navigateur une fois (`bunx playwright install chromium`) ; si Chromium est ailleurs, indiquer son chemin dans `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.

`bun run scripts/build-with-db.ts <commande>` démarre un Postgres embarqué
jetable, migre, exécute la commande puis l'arrête (ex. `… bun run test:db`).

## Intégration continue

`.github/workflows/ci.yml` : lint, typecheck et tests unitaires ; puis, contre
un conteneur Postgres 18, migrations, tests d'intégration, build de production
et tests e2e.
