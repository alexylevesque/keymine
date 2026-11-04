import type { NextConfig } from "next";

// Cache du navigateur : les logos de l'en-tête sont des imports statiques (empreinte dans le nom,
// cache d'un an géré par Next) ; les polices next/font aussi. Restent les fichiers de public/ cités
// par leur chemin (curseur dans app/globals.css) : 30 jours, puis revalidation.
const MONTH = 60 * 60 * 24 * 30;

const nextConfig: NextConfig = {
  images: {
    // Images optimisées par next/image (avatars, logo rond) : gardées 31 jours au lieu de 4 h.
    minimumCacheTTL: 2678400,
  },
  async headers() {
    return [
      {
        source: "/cursors/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: `public, max-age=${MONTH}, stale-while-revalidate=86400`,
          },
        ],
      },
      {
        source: "/:file(logo-rond.png|logo-texte.png)",
        headers: [
          {
            key: "Cache-Control",
            value: `public, max-age=${MONTH}, stale-while-revalidate=86400`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
