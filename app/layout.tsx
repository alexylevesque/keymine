import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Suspense } from "react";
import { Providers } from "@/components/Providers";
import { NavProgress } from "@/components/NavProgress";
import { getRequestLang } from "@/lib/i18n-server";
import { translate } from "@/lib/i18n-dictionary";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/db/schema";
import { peekIdentity } from "@/lib/auth/identity";
import { headers } from "next/headers";
import type { Viewer } from "@/lib/viewer";

const pressStart = localFont({
  src: "./fonts/press-start-2p.woff2",
  variable: "--font-press-start",
  weight: "400",
  display: "swap",
});

const vt323 = localFont({
  src: "./fonts/vt323.woff2",
  variable: "--font-vt323",
  weight: "400",
  display: "swap",
});

/** Adresse publique du site (NEXT_PUBLIC_SITE_URL, voir .env.example) : adresse officielle et aperçus de partage. */
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getRequestLang();
  const description = translate(lang, "meta.description");
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: "KeyMine", template: "%s · KeyMine" },
    description,
    applicationName: "KeyMine",
    // Aperçu quand le lien est partagé (Discord, Messenger, réseaux sociaux).
    openGraph: {
      type: "website",
      siteName: "KeyMine",
      title: "KeyMine",
      description,
      url: "/",
      locale: lang === "fr" ? "fr_CA" : "en_CA",
      alternateLocale: lang === "fr" ? ["en_CA"] : ["fr_CA"],
      images: [{ url: "/og-keymine.png", width: 1200, height: 630, alt: "KeyMine" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "KeyMine",
      description,
      images: ["/og-keymine.png"],
    },
  };
}

// DES-05: le thème est posé avant le premier rendu (pas de flash du mauvais
// thème). Priorité : choix enregistré, sinon préférence système.
const THEME_SCRIPT = `(function(){try{var s=localStorage.getItem("km_theme");var t=(s==="light"||s==="dark")?s:(window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");document.documentElement.dataset.theme=t;}catch(e){document.documentElement.dataset.theme="dark";}})();`;

// En-tête : pseudo et photo de la personne connectée (ou « Invité » si personne).
async function loadViewer(): Promise<Viewer> {
  const identity = await peekIdentity();
  if (!identity) return null;
  if (identity.kind === "guest") return { kind: "guest", name: identity.displayName };
  const row = await db.query.users.findFirst({
    columns: { avatar_url: true, xp_total: true },
    where: eq(users.id, identity.userId),
  });
  return {
    kind: "user",
    name: identity.displayName,
    avatarUrl: row?.avatar_url ?? null,
    xp: row?.xp_total ?? 0,
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [lang, viewer, h] = await Promise.all([getRequestLang(), loadViewer(), headers()]);
  // Nonce de la politique de sécurité (proxy.ts) : sans lui, le script du thème serait bloqué.
  const nonce = h.get("x-nonce") ?? undefined;
  return (
    <html
      lang={lang}
      suppressHydrationWarning
      className={`${pressStart.variable} ${vt323.variable}`}
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      {/* Des extensions de navigateur (ex. ColorZilla : cz-shortcut-listen) ajoutent des attributs à <body>
          avant React : on ignore ces différences d'attributs sur cette seule balise. */}
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        <Suspense fallback={null}>
          <NavProgress />
        </Suspense>
        <Providers initialLang={lang} viewer={viewer}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
