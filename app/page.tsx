import Link from "next/link";
import Image from "next/image";
import { headers } from "next/headers";
import type { Metadata } from "next";
import { langParam } from "@/lib/lang-param";
import apercuCourse from "@/public/apercu-course.png";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { PixelShell } from "@/components/PixelShell";
import { PublicLobbies } from "@/components/PublicLobbies";
import { listPublicLobbies } from "@/lib/public-lobbies";
import { JoinByCodeForm, QuickPlayButton } from "@/components/HomeActions";
import { db } from "@/lib/db";
import { keyStats, raceParticipants, users } from "@/db/schema";
import { peekIdentity } from "@/lib/auth/identity";
import { formatDate, formatNumber, formatPercent } from "@/lib/format";
import { getRequestLang } from "@/lib/i18n-server";
import { translate, type DictKey } from "@/lib/i18n-dictionary";
import { loadWeek } from "@/lib/leaderboard";
import { leagueMoves, MIN_WINS, weekStart } from "@/lib/league";
import { weakestKeys } from "@/lib/weak-keys";
import { loadWornArmor } from "@/lib/armor-worn";

export const dynamic = "force-dynamic";

/**
 * Titre et adresses de l'accueil. « /?lang=fr » et « /?lang=en » affichent la page dans une langue
 * précise (proxy.ts) : les balises hreflang les relient pour les moteurs, « / » reste l'adresse par
 * défaut (langue du navigateur). Les autres paramètres ne créent pas de doublon (adresse officielle).
 */
export async function generateMetadata({ searchParams }: PageProps<"/">): Promise<Metadata> {
  const forced = langParam.safeParse((await searchParams).lang);
  const lang = await getRequestLang();
  return {
    title: { absolute: translate(lang, "meta.home_title") },
    alternates: {
      canonical: forced.success ? `/?lang=${forced.data}` : "/",
      languages: { "fr-CA": "/?lang=fr", "en-CA": "/?lang=en", "x-default": "/" },
    },
  };
}

/** Les trois tuiles de l'accueil (comptes seulement) : meilleur MPM, classe de la semaine, touches à travailler. */
async function getTiles() {
  const identity = await peekIdentity();
  if (!identity || identity.kind !== "user") return null;
  const userId = identity.userId;

  const user = await db.query.users.findFirst({
    columns: { best_wpm: true, total_races: true, league: true },
    where: eq(users.id, userId),
  });
  if (!user) return null;

  const [recent, keys, week] = await Promise.all([
    db.query.raceParticipants.findMany({
      columns: { wpm: true },
      where: and(
        eq(raceParticipants.user_id, userId),
        eq(raceParticipants.role, "participant"),
        inArray(raceParticipants.status, ["finished", "timeout"]),
        isNotNull(raceParticipants.wpm),
      ),
      orderBy: desc(raceParticipants.created_at),
      limit: 8,
    }),
    db.query.keyStats.findMany({
      columns: { char: true, correct_count: true, error_count: true },
      where: eq(keyStats.user_id, userId),
    }),
    loadWeek(weekStart(new Date()), user.league),
  ]);

  const me = week.find((r) => r.userId === userId) ?? null;
  const moves = leagueMoves(week.length);
  const zone = !me
    ? null
    : me.position <= moves.up
      ? "up"
      : moves.down > 0 && me.position > week.length - moves.down
        ? "down"
        : "mid";

  return {
    bestWpm: Math.round(user.best_wpm),
    totalRaces: user.total_races,
    bars: recent.map((r) => r.wpm ?? 0).reverse(),
    league: user.league,
    wins: me?.wins ?? 0,
    position: me?.position ?? null,
    zone,
    weak: weakestKeys(keys),
  };
}

export default async function Home() {
  const identity = await peekIdentity();
  const [lobbies, tiles, lang, wornMap] = await Promise.all([
    listPublicLobbies(),
    getTiles(),
    getRequestLang(),
    identity?.kind === "user" ? loadWornArmor([identity.userId]) : Promise.resolve(null),
  ]);
  const worn = identity?.kind === "user" ? (wornMap?.get(identity.userId) ?? {}) : {};
  const t = (key: DictKey, params?: Record<string, string | number>) =>
    translate(lang, key, params);
  const maxBar = tiles ? Math.max(1, ...tiles.bars) : 1;
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  // Date du dernier déploiement (fixée au build dans next.config.ts).
  const updated = process.env.KM_BUILD_DATE ?? new Date().toISOString();
  const facts: DictKey[] = [
    "home.fact_free",
    "home.fact_browser",
    "home.fact_langs",
    "home.fact_guest",
  ];
  const faq = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({
    q: t(`home.faq_q${n}` as DictKey),
    a: t(`home.faq_a${n}` as DictKey),
  }));
  // Données structurées (schema.org) : les moteurs et les assistants IA savent que c'est un jeu web
  // gratuit, bilingue, et retrouvent la FAQ affichée plus bas.
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": ["VideoGame", "WebApplication"],
      name: "KeyMine",
      description: t("meta.description"),
      url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
      applicationCategory: "GameApplication",
      genre: "Typing game",
      gamePlatform: "Web browser",
      operatingSystem: "Any (web browser)",
      playMode: "MultiPlayer",
      inLanguage: ["fr", "en"],
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "CAD" },
      author: { "@type": "Person", name: "Alexy Lévesque" },
      dateModified: updated,
      featureList: facts.map((f) => t(f)),
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ];

  return (
    <PixelShell active="lobbys">
      <div className="flex flex-wrap items-start gap-10">
        <section
          aria-labelledby="hero-title"
          className="flex min-w-0 flex-[1_1_440px] flex-col gap-6"
        >
          <h1
            id="hero-title"
            className="font-pixel text-[26px] leading-[1.4] text-white [text-shadow:4px_4px_0_#000] sm:text-[34px]"
          >
            {t("home.title")}
            <span className="home-caret" aria-hidden="true" />
          </h1>
          <p className="max-w-[460px] text-[22px] leading-tight text-[#f1e6c9]">
            {t("home.subtitle")}
          </p>

          <ul aria-label={t("home.facts_label")} className="flex flex-wrap gap-2">
            {facts.map((f) => (
              <li
                key={f}
                className="font-pixel border-2 border-black bg-[#2b1e13] px-2.5 py-1.5 text-[9px] text-[#ffe08a]"
              >
                {t(f)}
              </li>
            ))}
          </ul>

          <QuickPlayButton worn={worn} />

          <JoinByCodeForm />

          <div className="flex flex-wrap items-center gap-4">
            <Link href="/jouer/creer" className="home-link font-pixel text-[11px]">
              {t("home.create_link")}
            </Link>
            {!tiles && (
              <>
                <span className="text-[#a8966e]" aria-hidden="true">
                  ·
                </span>
                <span className="text-xl text-[#cdbf9c]">{t("home.guest_short")}</span>
              </>
            )}
          </div>

          {tiles && (
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Link href="/profil" className="home-tile">
                <span className="font-pixel block text-[8px] text-[#ffe08a]">
                  {t("home.stat_best")}
                </span>
                <span className="block text-[34px] leading-[1.1]">
                  {formatNumber(lang, tiles.bestWpm)}{" "}
                  <span className="text-xl">{t("race.wpm")}</span>
                </span>
                <span className="home-bars" aria-hidden="true">
                  {tiles.bars.map((w, i) => (
                    <span
                      key={i}
                      style={{
                        height: `${Math.max(12, Math.round((w / maxBar) * 100))}%`,
                        ...(i === tiles.bars.length - 1 ? { background: "#f0b429" } : {}),
                      }}
                    />
                  ))}
                </span>
                <span className="more font-pixel mt-2 block text-[8px]">
                  {t("home.tile_races", { n: formatNumber(lang, tiles.totalRaces) })}
                </span>
              </Link>

              <Link href="/classement" className="home-tile">
                <span className="font-pixel block text-[8px] text-[#ffe08a]">
                  {t("home.tile_class")}
                </span>
                <span className="block text-[34px] leading-[1.1]">
                  {t(`league.${tiles.league}` as DictKey)}
                </span>
                <span
                  className="mt-2.5 flex gap-[3px]"
                  role="img"
                  aria-label={t("home.tile_wins", { wins: tiles.wins, min: MIN_WINS })}
                >
                  {Array.from({ length: MIN_WINS }, (_, i) => (
                    <span
                      key={i}
                      className="h-[18px] w-[18px] border-2 border-black"
                      style={{ background: i < tiles.wins ? "#f0b429" : "#2b1e13" }}
                    />
                  ))}
                </span>
                <span className="more font-pixel mt-2 block text-[8px]">
                  {tiles.position === null
                    ? t("home.tile_no_race")
                    : tiles.zone === "up"
                      ? t("home.tile_pos_up", { pos: tiles.position })
                      : tiles.zone === "down"
                        ? t("home.tile_pos_down", { pos: tiles.position })
                        : t("home.tile_pos", { pos: tiles.position })}
                </span>
              </Link>

              <Link href="/profil" className="home-tile">
                <span className="font-pixel block text-[8px] text-[#ffe08a]">
                  {t("home.tile_work")}
                </span>
                <span className="mt-1.5 flex min-h-[38px] gap-1.5">
                  {tiles.weak.length === 0 && (
                    <span className="text-xl text-[#cdbf9c]">{t("home.tile_no_keys")}</span>
                  )}
                  {tiles.weak.map((k, i) => (
                    <span
                      key={k.key}
                      className="font-pixel flex h-[38px] w-[38px] items-center justify-center border-3 border-black text-xs"
                      style={{ background: i === 0 ? "#b0281c" : "#c97a2a" }}
                      title={t("home.tile_key", {
                        key: k.key,
                        rate: formatPercent(lang, Math.round(k.rate * 100)),
                      })}
                    >
                      <span aria-hidden="true">{k.key.toUpperCase()}</span>
                      <span className="sr-only">
                        {t("home.tile_key", {
                          key: k.key,
                          rate: formatPercent(lang, Math.round(k.rate * 100)),
                        })}
                      </span>
                    </span>
                  ))}
                </span>
                <span className="more font-pixel mt-2.5 block text-[8px]">
                  {t("home.tile_keyboard")}
                </span>
              </Link>
            </div>
          )}
        </section>

        <div className="flex min-w-0 flex-[1_1_560px]">
          <PublicLobbies initial={lobbies} />
        </div>
      </div>

      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section id="comment" aria-labelledby="how-title" className="lobby-panel home-anchor">
          <div className="lobby-head">
            <h2 id="how-title" className="font-pixel text-[13px] text-white">
              {t("home.how_title")}
            </h2>
          </div>
          <ol className="flex flex-col gap-4 p-5">
            {[1, 2, 3, 4].map((n) => (
              <li key={n}>
                <h3 className="font-pixel text-[10px] text-[#ffe08a]">
                  {t(`home.how_${n}_t` as DictKey)}
                </h3>
                <p className="mt-1.5 text-xl leading-tight text-[#f1e6c9]">
                  {t(`home.how_${n}` as DictKey)}
                </p>
              </li>
            ))}
          </ol>
          <div id="niveaux" className="home-anchor border-t-2 border-[#3b2a1a] p-5">
            <h3 className="font-pixel text-[10px] text-[#ffe08a]">{t("home.levels_title")}</h3>
            <table role="table" className="km-table mt-2 w-full text-xl text-[#f1e6c9]">
              <caption className="sr-only">{t("home.levels_caption")}</caption>
              <thead role="rowgroup">
                <tr role="row" className="flex gap-4 text-[#a8966e]">
                  <th
                    role="columnheader"
                    scope="col"
                    className="font-pixel w-28 shrink-0 text-left text-[8px]"
                  >
                    {t("home.levels_col_level")}
                  </th>
                  <th role="columnheader" scope="col" className="font-pixel text-left text-[8px]">
                    {t("home.levels_col_text")}
                  </th>
                </tr>
              </thead>
              <tbody role="rowgroup">
                {(["easy", "medium", "hard"] as const).map((lv) => (
                  <tr key={lv} role="row" className="flex gap-4 border-t-2 border-[#3b2a1a] py-1.5">
                    <th
                      role="rowheader"
                      scope="row"
                      className="font-pixel w-28 shrink-0 text-left text-[9px] leading-[1.8] text-white"
                    >
                      {t(`set.${lv}` as DictKey)}
                    </th>
                    <td role="cell">{t(`home.level_${lv}` as DictKey)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="flex flex-col gap-8">
          <section aria-labelledby="preview-title" className="lobby-panel">
            <div className="lobby-head">
              <h2 id="preview-title" className="font-pixel text-[13px] text-white">
                {t("home.preview_title")}
              </h2>
            </div>
            <div className="p-5">
              <Image
                src={apercuCourse}
                alt={t("home.preview_alt")}
                sizes="(min-width: 1024px) 560px, 100vw"
                className="h-auto w-full border-4 border-black"
              />
            </div>
          </section>

          <section id="a-propos" aria-labelledby="about-title" className="lobby-panel home-anchor">
            <div className="lobby-head">
              <h2 id="about-title" className="font-pixel text-[13px] text-white">
                {t("home.about_title")}
              </h2>
            </div>
            <div className="p-5 text-xl leading-tight text-[#f1e6c9]">
              <p>{t("home.about_text")}</p>
              <p className="mt-3 text-[#cdbf9c]">
                {t("home.updated", { date: formatDate(lang, updated) })}
              </p>
            </div>
          </section>
        </div>

        <section
          id="faq"
          aria-labelledby="faq-title"
          className="lobby-panel home-anchor lg:col-span-2"
        >
          <div className="lobby-head">
            <h2 id="faq-title" className="font-pixel text-[13px] text-white">
              {t("home.faq_title")}
            </h2>
          </div>
          <div className="flex flex-col">
            {faq.map((f) => (
              <details key={f.q} className="home-faq border-t-2 border-[#3b2a1a]">
                <summary className="font-pixel cursor-pointer px-5 py-4 text-[10px] text-white">
                  {f.q}
                </summary>
                <p className="px-5 pb-4 text-xl leading-tight text-[#f1e6c9]">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </PixelShell>
  );
}
