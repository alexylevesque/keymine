"use client";

import Image from "next/image";
import Link from "next/link";
// Imports statiques : Next leur donne un nom avec empreinte et les sert en cache pour un an (immutable).
import logoRond from "@/public/logo-rond.png";
import logoTexte from "@/public/logo-texte.png";
import { useEffect, useState, type ReactNode } from "react";
import { PixelAvatar } from "./ui";
import { LanguageSelect } from "./LanguageSelect";
import { XpBar } from "./XpBar";
import { useLanguage } from "@/lib/i18n";
import { levelFromXp } from "@/lib/xp";
import { formatNumber } from "@/lib/format";
import { useViewer } from "@/lib/viewer";

type NavKey = "jouer" | "lobbys" | "stats" | "classement" | "inventaire" | "boutique" | null;

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
  const { t, lang } = useLanguage();
  const { toggle: toggleTheme } = useTheme();
  const viewer = useViewer();
  const viewerName = viewer?.name ?? t("common.guest");
  const [menuOpen, setMenuOpen] = useState(false);

  // Échap ferme le menu et rend le focus au bouton.
  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        document.getElementById("menu-toggle")?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const navLinks = (onNavigate?: () => void, mobile = false) => (
    <>
      <Link
        href="/jouer/creer"
        data-active={active === "jouer"}
        className="pixel-nav-link"
        onClick={onNavigate}
      >
        {t("nav.jouer")}
      </Link>
      <Link
        href="/"
        data-active={active === "lobbys"}
        className="pixel-nav-link"
        onClick={onNavigate}
      >
        {t("nav.lobbys")}
      </Link>
      {/* Les comptes ont leur profil dans la puce du compte ; les invités gardent STATS. */}
      {viewer?.kind !== "user" && (
        <Link
          href="/profil"
          data-active={active === "stats"}
          className="pixel-nav-link"
          onClick={onNavigate}
        >
          {t("nav.stats")}
        </Link>
      )}
      <Link
        href="/classement"
        data-active={active === "classement"}
        className="pixel-nav-link"
        onClick={onNavigate}
      >
        {t("nav.classement")}
      </Link>
      {viewer?.kind === "user" && (
        <>
          <Link
            href="/inventaire"
            data-active={active === "inventaire"}
            className="pixel-nav-link"
            onClick={onNavigate}
          >
            {t("nav.inventaire")}
          </Link>
          <Link
            href="/boutique"
            data-active={active === "boutique"}
            className="pixel-nav-link"
            onClick={onNavigate}
          >
            {t("nav.boutique")}
          </Link>
          {mobile && (
            <Link href="/historique" className="pixel-nav-link" onClick={onNavigate}>
              {t("nav.historique")}
            </Link>
          )}
        </>
      )}
    </>
  );

  const themeButton = (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={t("theme.toggle")}
      className="shell-btn flex h-9 w-9 shrink-0 items-center justify-center"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M8 1a7 7 0 1 0 0 14V1z" fill="currentColor" />
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    </button>
  );

  const level = viewer?.kind === "user" ? levelFromXp(viewer.xp).level : null;
  const avatar = (size: string) => (
    <PixelAvatar
      label={viewerName.slice(0, 1).toUpperCase()}
      color="#b0281c"
      className={`${size} shrink-0 text-xs`}
      src={viewer?.kind === "user" ? viewer.avatarUrl : null}
      seed={viewer ? viewerName : null}
    />
  );
  const accountHref = viewer?.kind === "user" ? "/profil" : "/connexion";
  const accountLabel = viewer?.kind === "user" ? t("a11y.profile_link") : t("a11y.login_link");
  const accountChip = (
    <Link
      href={accountHref}
      className="shell-me flex min-w-0 shrink-0 items-center gap-2.5 border-2 border-black lg:py-1 lg:pr-2.5 lg:pl-1"
    >
      {avatar("h-9 w-9 lg:h-8 lg:w-8")}
      <span className="hidden min-w-0 flex-col leading-none lg:flex">
        <span className="max-w-40 truncate text-xl">{viewerName}</span>
        {level != null && (
          <span className="font-pixel text-[8px] whitespace-nowrap text-[#7fc45a]">
            {t("xp.short", { level: formatNumber(lang, level) })}
          </span>
        )}
      </span>
      <span className="sr-only">{accountLabel}</span>
    </Link>
  );
  const account = rightSlot ?? accountChip;

  return (
    <div className="pixel-night min-h-screen overflow-x-clip">
      <a href="#contenu" className="skip-link font-pixel text-[11px]">
        {t("a11y.skip")}
      </a>

      <header className="shell-header relative z-20">
        <div className="shell-grass" aria-hidden="true" />
        <div className="mx-auto flex max-w-[1216px] items-center gap-3 px-3.5 py-2.5 sm:px-8 lg:gap-7 lg:py-3.5">
          <Link
            href="/"
            className="shell-logo flex shrink-0 items-center gap-2 lg:gap-3"
            aria-label="KeyMine"
          >
            <Image src={logoRond} alt="" className="h-8 w-8 lg:h-10 lg:w-10" />
            <Image
              src={logoTexte}
              alt=""
              unoptimized
              className="h-4 w-auto [image-rendering:pixelated] lg:h-[22px]"
            />
          </Link>

          {/* Grand écran (≥ 1024 px) : navigation complète. */}
          <nav
            aria-label={t("a11y.main_nav")}
            className="hidden flex-auto flex-wrap gap-1.5 lg:flex"
          >
            {navLinks()}
          </nav>
          <span className="flex-auto lg:hidden" />

          <div className="hidden items-center gap-2.5 lg:flex">
            <LanguageSelect />
            {themeButton}
          </div>

          {/* Puce du compte ; sous 1024 px, seulement l'avatar, à côté du « hamburger ». */}
          {account}
          <button
            id="menu-toggle"
            type="button"
            className="pixel-menu-toggle lg:hidden"
            aria-expanded={menuOpen}
            aria-controls="menu-mobile"
            aria-label={menuOpen ? t("nav.menu_close") : t("nav.menu_open")}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span aria-hidden="true" data-open={menuOpen} className="pixel-burger" />
          </button>
        </div>

        {/* Barre d'expérience : bande fine pleine largeur sous l'en-tête. */}
        {viewer?.kind === "user" ? (
          <XpBar totalXp={viewer.xp} size="strip" />
        ) : (
          <div className="shell-xp-empty" aria-hidden="true" />
        )}

        <div id="menu-mobile" hidden={!menuOpen} className="shell-menu lg:hidden">
          <nav aria-label={t("a11y.main_nav")} className="flex flex-col">
            {navLinks(() => setMenuOpen(false), true)}
          </nav>
          <div className="shell-menu-foot flex items-center gap-2">
            <LanguageSelect />
            {themeButton}
          </div>
        </div>
      </header>

      <main id="contenu" tabIndex={-1} className="px-4 py-6 sm:px-8 sm:py-10 lg:py-12">
        <div className="mx-auto w-full max-w-[1216px]">{children}</div>
      </main>

      <footer className="border-t-4 border-black bg-[#1b1209] px-4 py-4 text-center text-xl text-[#f1e6c9] sm:px-8">
        {t("footer.text")}
      </footer>
    </div>
  );
}
