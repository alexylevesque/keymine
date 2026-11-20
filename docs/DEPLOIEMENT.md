# Déploiement sur un VPS (TECH-05)

Ce guide met KeyMine en ligne en HTTPS sur un petit serveur Linux (Debian/Ubuntu) avec Docker. Tout est décrit dans le dépôt : `Dockerfile`, `deploy/docker-compose.prod.yml`, `deploy/Caddyfile`.

Architecture déployée : **Caddy** (HTTPS automatique, seul service exposé) → **web** (Next.js) et **realtime** (WebSocket, sous `/rt`) → **PostgreSQL**. Une étape **migrate** applique les migrations et le seed avant le démarrage.

## 1. Préparer le serveur

1. Louer un VPS avec **2 Go de RAM** au minimum (le build de Next.js dans Docker est trop gourmand pour 512 Mo, et risqué à 1 Go) ; noter son adresse IP. Ajouter 2 Go de swap : `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`.
2. Chez le registraire du nom de domaine, créer un enregistrement **A** `keymine.exemple.com → IP du serveur` (et **AAAA** si IPv6).
3. Se connecter en SSH et installer Docker :

   ```bash
   curl -fsSL https://get.docker.com | sh
   ```

4. Ouvrir les ports 80 et 443 (pare-feu du fournisseur et `ufw allow 80,443/tcp`). Ne pas exposer 5432.

## 2. Récupérer le code et configurer

```bash
git clone <url-du-depot> keymine && cd keymine
cp deploy/.env.prod.example deploy/.env.prod
nano deploy/.env.prod     # DOMAIN, POSTGRES_PASSWORD, SESSION_SECRET (openssl rand -base64 32)
```

`SEED_DEMO_USERS=true` crée les comptes de démonstration (voir le README) : utile pour la correction ; mettre `false` pour un vrai site public.

## 3. Lancer

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d --build
docker compose -f deploy/docker-compose.prod.yml logs -f web realtime
```

Au premier démarrage, Caddy obtient le certificat Let's Encrypt (quelques secondes). Vérifier : `https://<domaine>` charge le site, et la création d'une salle affiche la liste des joueurs en direct.

## 4. Mettre à jour

```bash
git pull
docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod up -d --build
```

Les migrations déjà appliquées sont ignorées ; le seed est idempotent.

### Mise à jour automatique

`deploy/mise-a-jour-auto.sh` fait la même chose tout seul : s'il y a de nouveaux commits sur `main`, il récupère le code, reconstruit les conteneurs et nettoie les vieilles images (verrou pour ne jamais lancer deux mises à jour en même temps ; journal dans `deploy/mise-a-jour.log`). À installer une seule fois sur le serveur :

```bash
chmod +x ~/keymine/deploy/mise-a-jour-auto.sh
(crontab -l 2>/dev/null; echo "*/5 * * * * $HOME/keymine/deploy/mise-a-jour-auto.sh") | crontab -
```

Ensuite, un `git push` est en ligne en moins d'une dizaine de minutes (5 min d'attente au plus, puis le build). Pour suivre : `tail -f ~/keymine/deploy/mise-a-jour.log`.

## 5. Sauvegarde et dépannage

- Sauvegarde : `docker compose -f deploy/docker-compose.prod.yml exec postgres pg_dump -U keymine keymine > sauvegarde.sql`
- Le WebSocket ne se connecte pas : vérifier que l'URL du site (`DOMAIN`) est exactement celle du navigateur (l'origine est contrôlée) et que `docker compose logs realtime` ne montre pas d'erreur.
- Changer de domaine : modifier `DOMAIN` puis reconstruire (`--build`), car l'adresse du WebSocket est figée dans le code client au build.
- OAuth (optionnel) : enregistrer les callbacks `https://<domaine>/api/auth/discord/callback` et `/api/auth/github/callback`.

## 6. Sécurité du serveur

Le déploiement n'expose que les ports 80 et 443 (Caddy) ; Postgres, le site et le serveur temps réel restent dans le réseau interne de Docker. Mesures prises sur le VPS :

- pare-feu `ufw` actif (SSH, 80 et 443 seulement) ;
- `fail2ban` (prison `sshd`) pour bannir les adresses qui multiplient les échecs de connexion SSH ;
- mises à jour de sécurité automatiques (`unattended-upgrades`), plus une mise à jour manuelle (`apt update && apt upgrade -y`) suivie d'un redémarrage quand le noyau change ;
- connexion SSH par mot de passe désactivée (`PasswordAuthentication no` dans `/etc/ssh/sshd_config.d/00-no-password.conf`) : l'accès se fait par la console web du fournisseur.

Vérification rapide : `ufw status`, `fail2ban-client status sshd`, `last -n 6`, `ss -tlnp` et `docker ps`.
