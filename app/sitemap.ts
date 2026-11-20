import type { MetadataRoute } from "next";

// Plan du site : les pages publiques qu'un moteur de recherche peut afficher.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: `${SITE_URL}/`,
      changeFrequency: "daily",
      priority: 1,
      // Versions française et anglaise de l'accueil (hreflang).
      alternates: {
        languages: { "fr-CA": `${SITE_URL}/?lang=fr`, "en-CA": `${SITE_URL}/?lang=en` },
      },
    },
    { url: `${SITE_URL}/classement`, changeFrequency: "daily", priority: 0.6 },
    { url: `${SITE_URL}/connexion`, changeFrequency: "monthly", priority: 0.4 },
  ];
}
