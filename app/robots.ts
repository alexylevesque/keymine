import type { MetadataRoute } from "next";

// Robots d'indexation : pages publiques seulement ; les routes API et les pages de compte n'ont
// rien à indexer.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/profil",
        "/historique",
        "/inventaire",
        "/boutique",
        "/course/",
        "/resultats/",
        "/rejoindre/",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
