import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { getRequestLang } from "@/lib/i18n-server";
import { translate } from "@/lib/i18n-dictionary";
import { db } from "@/lib/db";
import { peekIdentity } from "@/lib/auth/identity";
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

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getRequestLang();
  return {
    title: { default: "KeyMine", template: "%s · KeyMine" },
    description: translate(lang, "meta.description"),
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
  const row = await db
    .selectFrom("users")
    .select(["avatar_url", "xp_total"])
    .where("id", "=", identity.userId)
    .executeTakeFirst();
  return { kind: "user", name: identity.displayName, avatarUrl: row?.avatar_url ?? null, xp: row?.xp_total ?? 0 };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [lang, viewer] = await Promise.all([getRequestLang(), loadViewer()]);
  return (
    <html
      lang={lang}
      suppressHydrationWarning
      className={`${pressStart.variable} ${vt323.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      {/* Des extensions de navigateur (ex. ColorZilla : cz-shortcut-listen) ajoutent des attributs à <body>
          avant React : on ignore ces différences d'attributs sur cette seule balise. */}
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        <Providers initialLang={lang} viewer={viewer}>{children}</Providers>
      </body>
    </html>
  );
}
