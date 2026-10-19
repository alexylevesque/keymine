// Base des outils de démonstration : uniquement une base sur cet ordinateur (jamais la production).
const LOCAL_DEFAULT = "postgresql://keymine:keymine@127.0.0.1:54329/keymine";

export async function localDemoDb() {
  const url = process.env.DATABASE_URL ?? LOCAL_DEFAULT;
  const host = new URL(url).hostname;
  if (host !== "127.0.0.1" && host !== "localhost") {
    console.error(`[demo] base « ${host} » : ce script ne sert qu'en local, rien n'a été changé.`);
    process.exit(1);
  }
  process.env.DATABASE_URL = url;
  // Import après la vérification : lib/db lit DATABASE_URL à son chargement.
  return import("@/lib/db");
}
