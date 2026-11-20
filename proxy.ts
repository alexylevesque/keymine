import { NextResponse, type NextRequest } from "next/server";
import { langParam } from "@/lib/lang-param";

// Politique de sécurité du contenu (CSP) : un nonce aléatoire par page, que Next.js pose sur ses
// propres scripts et que app/layout.tsx pose sur le script du thème. Seuls ces scripts s'exécutent.
// frame-ancestors 'none' empêche d'afficher le site dans le cadre d'un autre site (clickjacking).

/** Origine du serveur temps réel (wss://domaine en production, ws://localhost:4001 en local). */
function realtimeOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_REALTIME_URL ?? "ws://localhost:4001";
  try {
    return new URL(raw).origin.replace(/^http/, "ws");
  } catch {
    return "";
  }
}

export function buildCsp(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Les attributs style (couleurs des avatars, largeurs des barres) ne peuvent pas porter de nonce.
    "style-src 'self' 'unsafe-inline'",
    // Photos de profil OAuth (Discord, GitHub) ; les photos téléversées sont servies par le site.
    "img-src 'self' blob: data: https://cdn.discordapp.com https://avatars.githubusercontent.com",
    "font-src 'self'",
    `connect-src 'self' ${realtimeOrigin()}${isDev ? " ws:" : ""}`.trim(),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  // « ?lang=fr|en » force la langue de la page (liens hreflang) ; l'en-tête venu du navigateur est ignoré.
  requestHeaders.delete("x-km-lang");
  const forced = langParam.safeParse(request.nextUrl.searchParams.get("lang"));
  if (forced.success) requestHeaders.set("x-km-lang", forced.data);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages seulement : pas les routes API, ni les fichiers statiques et images.
      source:
        "/((?!api|_next/static|_next/image|favicon.ico|icon.png|cursors|logo-rond.png|logo-texte.png|og-keymine.png|apercu-course.png|llms.txt|robots.txt|sitemap.xml).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
