// Outil de démonstration (développement local seulement) : ajoute de l'XP à un compte.
// Usage : bun run demo:xp [nom_utilisateur] [xp]   (alice et 1000 par défaut ; un nombre négatif en retire)
// Refuse de toucher une base qui n'est pas sur cet ordinateur.
import { Client } from "pg";

const username = process.argv[2] ?? "alice";
const amount = Math.trunc(Number(process.argv[3] ?? 1000));
const url = process.env.DATABASE_URL ?? "postgresql://keymine:keymine@127.0.0.1:54329/keymine";
const host = new URL(url).hostname;
if (host !== "127.0.0.1" && host !== "localhost") {
  console.error(`[demo] base « ${host} » : ce script ne sert qu'en local, rien n'a été changé.`);
  process.exit(1);
}
if (!Number.isFinite(amount)) {
  console.error("[demo] le nombre d'XP n'est pas valide.");
  process.exit(1);
}

const client = new Client({ connectionString: url });
await client.connect();
const { rows } = await client.query<{ xp_total: number }>(
  `update users set xp_total = greatest(0, xp_total + $2) where username = $1 returning xp_total`,
  [username, amount],
);
await client.end();
if (!rows[0]) {
  console.error(`[demo] compte « ${username} » introuvable.`);
  process.exit(1);
}
console.log(
  `[demo] ${username} : ${amount >= 0 ? "+" : ""}${amount} XP (total ${rows[0].xp_total}).`,
);
