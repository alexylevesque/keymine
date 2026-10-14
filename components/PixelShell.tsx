"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { PixelAvatar } from "./ui";
import { LanguageSelect } from "./LanguageSelect";
import { useLanguage } from "@/lib/i18n";
import { useViewer } from "@/lib/viewer";

type NavKey = "jouer" | "lobbys" | "stats" | null;

function currentTheme(): "dark" | "light" {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

// DES-05: le thème initial est posé par un script dans <head> (voir app/layout.tsx).
// Ici on ne fait que basculer et mémoriser le choix.
function useTheme() {
  function toggle() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("km_theme", next);
    } catch {
      // stockage indisponible: le choix vaut pour la page courante seulement
    }
  }
  return { toggle };
}

export function PixelShell({
  active = null,
  rightSlot,
  children,
}: {
  active?: NavKey;
  rightSlot?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useLanguage();
  const { toggle: toggleTheme } = useTheme();
  const viewer = useViewer();
  const viewerName = viewer?.name ?? t("common.guest");

  return (
    <div className="pixel-night min-h-screen">
      <a href="#contenu" className="skip-link font-pixel text-[11px]">
        {t("a11y.skip")}
      </a>
      <div className="pixel-grass h-5 border-b-4 border-[#2f5d1c]" />

      <header className="flex h-16 items-center gap-2 border-b-4 border-black bg-[#241a10] px-3 sm:gap-6 sm:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-1">
          <Image
            src="/logo-rond.png"
            alt=""
            width={44}
            height={44}
            className="mr-1 h-9 w-9 sm:mr-2 sm:h-11 sm:w-11"
          />
          <span className="pixel-key max-[439px]:hidden">K</span>
          <span className="pixel-key bg-[#7fc45a] max-[439px]:hidden">E</span>
          <span className="pixel-key max-[439px]:hidden">Y</span>
          <span className="font-pixel ml-1 text-xs text-white [text-shadow:3px_3px_0_#000] sm:ml-2 sm:text-lg">
            MINE
          </span>
        </Link>

        <nav aria-label={t("a11y.main_nav")} className="hidden flex-grow gap-1.5 sm:flex">
          <Link href="/jouer/creer" data-active={active === "jouer"} className="pixel-nav-link">
            {t("nav.jouer")}
          </Link>
          <Link href="/" data-active={active === "lobbys"} className="pixel-nav-link">
            {t("nav.lobbys")}
          </Link>
          <Link href="/profil" data-active={active === "stats"} className="pixel-nav-link">
            {t("nav.stats")}
          </Link>
        </nav>

        <div className="flex-grow sm:hidden" />

        <LanguageSelect />

        <button
          type="button"
          onClick={toggleTheme}
          aria-label={t("theme.toggle")}
          className="flex h-10 w-10 shrink-0 items-center justify-center border-3 border-white bg-[#c6c6c6]"
          style={{ borderColor: "#fff #555 #555 #fff" }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <circle cx="9" cy="9" r="7.5" fill="none" stroke="#2b2b2b" strokeWidth="2" />
            <path d="M9 1.5a7.5 7.5 0 0 0 0 15z" fill="#2b2b2b" />
          </svg>
        </button>

        {rightSlot ?? (
          <Link
            href={viewer?.kind === "user" ? "/profil" : "/connexion"}
            className="flex min-w-0 shrink-0 items-center gap-2 text-xl text-white"
          >
            <PixelAvatar
              label={viewerName.slice(0, 1).toUpperCase()}
              color="#3d6fc4"
              className="h-9 w-9 text-sm"
              src={viewer?.kind === "user" ? viewer.avatarUrl : null}
              seed={viewer ? viewerName : null}
            />
            <span className="hidden max-w-40 truncate sm:inline">{viewerName}</span>
            <span className="sr-only sm:hidden">
              {viewer?.kind === "user" ? t("a11y.profile_link") : t("a11y.login_link")}
            </span>
          </Link>
        )}
      </header>

      <nav
        aria-label={t("a11y.main_nav")}
        className="flex gap-1.5 border-b-4 border-black bg-[#241a10] px-4 pb-3 sm:hidden"
      >
        <Link href="/jouer/creer" data-active={active === "jouer"} className="pixel-nav-link">
          {t("nav.jouer")}
        </Link>
        <Link href="/" data-active={active === "lobbys"} className="pixel-nav-link">
          {t("nav.lobbys")}
        </Link>
        <Link href="/profil" data-active={active === "stats"} className="pixel-nav-link">
          {t("nav.stats")}
        </Link>
      </nav>

      <main id="contenu" tabIndex={-1} className="px-4 py-6 sm:px-8 sm:py-7">
        <div className="mx-auto w-full max-w-[1400px]">{children}</div>
      </main>

      <footer className="border-t-4 border-black bg-[#241a10] px-4 py-4 text-center text-xl text-[#f1e6c9] sm:px-8">
        {t("footer.text")}
      </footer>
    </div>
  );
}
