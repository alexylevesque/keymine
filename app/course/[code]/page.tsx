"use client";

import { useParams, useRouter } from "next/navigation";
import { participantName } from "@/lib/bot-name";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Track } from "@/components/race/Track";
import { LanguageSelect } from "@/components/LanguageSelect";
import type { RaceState } from "@/components/race/types";
import { useRaceConnection } from "@/components/race/useRaceConnection";
import { PixelButton, PixelPanel } from "@/components/ui";
import { useLanguage } from "@/lib/i18n";
import { formatClock, formatNumber, formatPercent } from "@/lib/format";
import { createThrottle, type Throttle } from "@/lib/race/throttle";

// Page de course : zone de frappe (COURSE-04), piste en direct (COURSE-05),
// décompte 3-2-1 (COURSE-03), abandon avec confirmation (COURSE-07),
// reconnexion (COURSE-08), annonces de bonus (BONUS-03). La progression
// affichée vient du serveur (COURSE-06) ; ici on ne fait que taper et envoyer
// l'avancement, au plus 10 fois par seconde (PERF-02).

type RaceInfo = {
  raceId: string;
  baseText: string;
  errorMode: "accumuler" | "bloquer";
  meId: string | null;
  role: "participant" | "spectator" | null;
};

type Typed = {
  index: number;
  errors: number;
  incorrect: Set<number>;
  keyCorrect: Record<string, number>;
  keyErrors: Record<string, number>;
};

const SEND_INTERVAL_MS = 100;
const FOG_LENGTH = 70;

function useIsNarrow(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const query = window.matchMedia("(max-width: 767px)");
      query.addEventListener("change", notify);
      return () => query.removeEventListener("change", notify);
    },
    () => window.matchMedia("(max-width: 767px)").matches,
    () => false,
  );
}

function useNow(stepMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), stepMs);
    return () => clearInterval(id);
  }, [stepMs]);
  return now;
}

export default function CoursePage() {
  const router = useRouter();
  const { t, lang } = useLanguage();
  const params = useParams<{ code: string }>();
  const code = params.code.toUpperCase();
  const narrow = useIsNarrow();
  const now = useNow(200);

  const [info, setInfo] = useState<RaceInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [view, setView] = useState({ index: 0, errors: 0, incorrect: new Set<number>() });

  const typed = useRef<Typed>({
    index: 0,
    errors: 0,
    incorrect: new Set(),
    keyCorrect: {},
    keyErrors: {},
  });
  /** Recopie l'état de frappe (source de vérité : la référence) vers l'affichage. */
  const commit = useCallback(() => {
    const s = typed.current;
    setView({ index: s.index, errors: s.errors, incorrect: new Set(s.incorrect) });
  }, []);

  // Charge la course : même texte pour tous au départ (TXT-8).
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/lobbies/${code}/race`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) {
          setLoadError(data.error);
          return;
        }
        setInfo({
          raceId: data.race.id,
          baseText: data.race.textContent,
          errorMode: data.lobby.errorMode,
          meId: data.me?.participantId ?? null,
          role: data.me?.role ?? null,
        });
      })
      .catch(() => !cancelled && setLoadError(t("race.error")));
    return () => {
      cancelled = true;
    };
  }, [code, t]);

  const onText = useCallback(
    (_value: string, progress: number) => {
      // Après un rechargement ou une reconnexion, on reprend là où le serveur en est.
      if (progress > typed.current.index) typed.current.index = progress;
      commit();
    },
    [commit],
  );

  const onFinished = useCallback(
    (final: RaceState) => {
      try {
        const mine = final.participants.find((p) => p.id === info?.meId);
        if (mine) {
          // STAT-8 : l'historique d'un invité ne vit que dans cet onglet.
          const key = "km_guest_history";
          const history = JSON.parse(sessionStorage.getItem(key) ?? "[]");
          history.unshift({
            code,
            wpm: mine.wpm,
            accuracy: mine.accuracy,
            errors: mine.errors,
            at: new Date().toISOString(),
          });
          sessionStorage.setItem(key, JSON.stringify(history.slice(0, 20)));
        }
      } catch {
        // stockage indisponible : on continue
      }
      setTimeout(() => router.push(`/resultats/${code}`), 1500);
    },
    [code, info?.meId, router],
  );

  const { state, text, announcements, status, clockOffset, overtakeAt, send } = useRaceConnection(
    narrow ? null : (info?.raceId ?? null),
    { meId: info?.meId ?? null, onText, onFinished },
  );

  const raceText = text ?? info?.baseText ?? "";
  const serverNow = now + clockOffset;
  const me = state?.participants.find((p) => p.id === info?.meId) ?? null;

  // Un joueur qui a abandonné (même après un rechargement) ne revient pas dans cette course.
  const abandoned = me?.status === "abandoned";
  useEffect(() => {
    if (abandoned) router.replace("/");
  }, [abandoned, router]);
  const isParticipant = info?.role === "participant";
  const secondsToStart = state ? Math.ceil((state.startsAt - serverNow) / 1000) : 3;
  const racing = !!state && state.phase === "racing" && serverNow >= state.startsAt;
  const canType = isParticipant && racing && me?.status === "racing";
  const secondsLeft = state ? (state.endsAt - serverNow) / 1000 : 0;
  const fogged = !!me && me.fogUntilMs > serverNow;

  // Envoi de l'avancement, au plus une fois toutes les 100 ms (PERF-02, TECH-06).
  const sendProgress = useCallback(() => {
    const s = typed.current;
    send({
      type: "progress",
      progressChars: s.index,
      errorCount: s.errors,
      keyCorrect: s.keyCorrect,
      keyErrors: s.keyErrors,
    });
  }, [send]);
  // Le regroupeur est créé une seule fois : s'il était recréé à chaque nouvelle fonction `send`, l'envoi
  // en attente serait annulé à chaque rendu et l'avancement n'arriverait au serveur qu'en fin de texte.
  const sendProgressRef = useRef(sendProgress);
  useEffect(() => {
    sendProgressRef.current = sendProgress;
  }, [sendProgress]);
  const throttle = useRef<Throttle | null>(null);
  useEffect(() => {
    const t = createThrottle(SEND_INTERVAL_MS, () => sendProgressRef.current());
    throttle.current = t;
    return () => t.cancel();
  }, []);
  const scheduleSend = useCallback((immediate: boolean) => throttle.current?.schedule(immediate), []);

  // Frappe au clavier : pas de retour arrière, pas de collage (COURSE-04).
  useEffect(() => {
    if (!canType) return;
    const errorMode = info?.errorMode ?? "accumuler";

    function onKeyDown(e: KeyboardEvent) {
      if (confirming || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "Backspace") {
        e.preventDefault();
        return;
      }
      if (e.key.length !== 1) return;
      e.preventDefault();

      const s = typed.current;
      if (s.index >= raceText.length) return;
      const expected = raceText[s.index]!;
      if (e.key === expected) {
        s.keyCorrect[expected] = (s.keyCorrect[expected] ?? 0) + 1;
        s.index += 1;
      } else {
        s.keyErrors[expected] = (s.keyErrors[expected] ?? 0) + 1;
        s.errors += 1;
        if (errorMode === "accumuler") {
          s.incorrect.add(s.index);
          s.index += 1;
        }
      }
      commit();
      scheduleSend(s.index >= raceText.length);
    }
    const onPaste = (e: ClipboardEvent) => e.preventDefault();

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("paste", onPaste);
    };
  }, [canType, raceText, info?.errorMode, confirming, scheduleSend, commit]);

  function abandon() {
    send({ type: "abandon" });
    // Un joueur qui abandonne quitte la course : retour à la liste des lobbys (COURSE-07).
    router.push("/");
  }

  if (loadError) {
    return (
      <div className="pixel-night flex min-h-screen items-center justify-center p-8 text-center">
        <p role="alert" className="font-pixel text-white">
          {loadError}
        </p>
      </div>
    );
  }

  const header = (
    <header className="flex h-16 items-center gap-6 border-b-4 border-black bg-[#241a10] px-4 sm:px-8">
      <div className="flex items-center gap-1.5" aria-hidden="true">
        <span className="pixel-key">K</span>
        <span className="pixel-key bg-[#7fc45a]">E</span>
        <span className="pixel-key">Y</span>
        <span className="font-pixel ml-2 text-lg text-white [text-shadow:3px_3px_0_#000]">
          MINE
        </span>
      </div>
      <div className="font-pixel flex-grow truncate text-xs text-[#f1e6c9]">
        {t("race.room", { code })}
      </div>
      <LanguageSelect />
    </header>
  );

  // DES-06 : sur mobile, la course est remplacée par un message.
  if (narrow) {
    return (
      <div className="pixel-night min-h-screen">
        {header}
        <main className="flex flex-col items-center gap-4 px-4 py-12 text-center">
          <h1 className="font-pixel text-base text-white">{t("race.mobile_title")}</h1>
          <p className="max-w-sm text-2xl text-[#f1e6c9]">{t("race.mobile_text")}</p>
          <PixelButton href={`/resultats/${code}`} variant="gold" className="h-12 px-6 text-[12px]">
            {t("race.mobile_results")}
          </PixelButton>
          <PixelButton href="/" variant="slate" className="h-12 px-6 text-[12px]">
            KEYMINE
          </PixelButton>
        </main>
      </div>
    );
  }

  if (!info || !state) {
    return (
      <div className="pixel-night min-h-screen">
        {header}
        <main className="px-4 py-12 text-center">
          <p role="status" className="font-pixel text-sm text-white">
            {status === "refused" ? t("race.refused") : t("race.loading")}
          </p>
        </main>
      </div>
    );
  }

  const nameOf = (id: string) => {
    const found = state.participants.find((p) => p.id === id);
    return found ? participantName(t, found) : "?";
  };
  const visibleAnnouncements = announcements.filter((a) => now - a.at < 4_500);
  const personalBanner = visibleAnnouncements.find(
    (a) =>
      (a.bonus.beneficiaryId === info.meId && a.bonus.kind === "minus_words") ||
      (a.bonus.targetId === info.meId && a.bonus.kind !== "minus_words"),
  );
  const personalText = personalBanner
    ? personalBanner.bonus.kind === "minus_words"
      ? t("race.bonus_you_minus")
      : personalBanner.bonus.kind === "plus_words"
        ? t("race.bonus_you_plus")
        : t("race.bonus_you_fog")
    : null;
  const pct = raceText.length ? Math.round((view.index / raceText.length) * 100) : 0;

  return (
    <div className="pixel-night min-h-screen">
      <div className="pixel-grass h-5 border-b-4 border-[#2f5d1c]" />
      {header}

      <main className="px-4 py-6 sm:px-8 sm:py-7">
        <div className="mx-auto w-full max-w-[1400px]">
          <h1 className="sr-only">{t("race.room", { code })}</h1>
          {status === "reconnecting" && (
            <div
              role="alert"
              className="mb-4 border-4 border-black bg-[#f39a8c] px-4 py-2 text-xl text-black"
            >
              {t("race.reconnecting")}
            </div>
          )}

          {state.phase === "countdown" && (
            <div className="mb-6 text-center" role="status" aria-live="assertive">
              <div className="font-pixel text-6xl text-white [text-shadow:4px_4px_0_#000]">
                {secondsToStart > 0 ? secondsToStart : t("race.go")}
              </div>
              <p className="mt-2 text-2xl text-[#f1e6c9]">{t("race.get_ready")}</p>
            </div>
          )}

          <div className="mb-6 flex flex-wrap items-center gap-3.5">
            <div className="pixel-slot flex w-48 flex-col gap-1 px-4 py-2">
              <b className="font-pixel text-[9px] text-[#ffefb3]">{t("race.time_left")}</b>
              <span className="font-pixel py-1 text-2xl text-white">
                {formatClock(secondsLeft)}
              </span>
            </div>
            <div className="pixel-slot flex w-40 flex-col gap-1 px-4 py-2">
              <b className="font-pixel text-[9px] text-[#ffefb3]">{t("race.speed")}</b>
              <span className="text-3xl text-white">
                {Math.round(me?.wpm ?? 0)} {t("race.wpm")}
              </span>
            </div>
            <div className="pixel-slot flex w-36 flex-col gap-1 px-4 py-2">
              <b className="font-pixel text-[9px] text-[#ffefb3]">{t("race.accuracy")}</b>
              <span className="text-3xl text-white">{formatPercent(lang, me?.accuracy ?? 100)}</span>
            </div>
            <div className="pixel-slot flex w-32 flex-col gap-1 px-4 py-2">
              <b className="font-pixel text-[9px] text-[#ffefb3]">{t("race.errors")}</b>
              <span className="text-3xl text-white">{Math.max(view.errors, me?.errors ?? 0)}</span>
            </div>
            {(me?.penaltyMs ?? 0) > 0 && (
              <div className="pixel-slot flex w-40 flex-col gap-1 px-4 py-2">
                <b className="font-pixel text-[9px] text-[#ffefb3]">{t("race.penalty")}</b>
                <span className="text-3xl text-white">
                  +{formatNumber(lang, (me?.penaltyMs ?? 0) / 1000)} s
                </span>
              </div>
            )}
            <div className="flex-grow" />
            {isParticipant && me?.status === "racing" && (
              <PixelButton
                type="button"
                onClick={() => setConfirming(true)}
                variant="red"
                className="h-16 w-full text-base sm:w-64"
              >
                {t("race.abandon")}
              </PixelButton>
            )}
          </div>

          {personalText && (
            <div
              role="alert"
              className="font-pixel mb-4 border-4 border-black bg-[#ffd84a] px-4 py-2.5 text-[12px] text-[#1b1b1b]"
            >
              {personalText}
            </div>
          )}
          {now - overtakeAt < 2_200 && (
            <div
              role="status"
              className="font-pixel mb-4 border-4 border-black bg-[#7fd36a] px-4 py-2.5 text-[12px] text-[#1b1b1b]"
            >
              {t("race.overtake")}
            </div>
          )}

          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <div className="flex-grow">
              {isParticipant ? (
                <PixelPanel className="p-4">
                  <div
                    className="border-4 border-black bg-[#1b1b1b] p-6 text-3xl leading-relaxed break-words sm:text-4xl"
                    role="group"
                    aria-label={t("race.text_aria")}
                  >
                    {raceText.split("").map((c, i) => {
                      const cls =
                        i === view.index
                          ? "bg-[#f0b429] text-[#1b1b1b]"
                          : i < view.index
                            ? view.incorrect.has(i)
                              ? "bg-[#b0281c] text-white"
                              : "text-[#7fd36a]"
                            : "text-[#d8d8d8]";
                      const blurred = fogged && i > view.index && i <= view.index + FOG_LENGTH;
                      return (
                        <span
                          key={i}
                          className={cls}
                          style={blurred ? { filter: "blur(5px)" } : undefined}
                        >
                          {c}
                        </span>
                      );
                    })}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-4">
                    <span className="font-pixel text-[11px] text-[#2b2b2b]">
                      {t("race.progress", { pct })}
                    </span>
                    <span className="text-xl text-[#3a3a3a]">
                      {info.errorMode === "bloquer" ? t("race.hint_block") : t("race.hint_free")}
                    </span>
                  </div>
                </PixelPanel>
              ) : (
                <p
                  role="status"
                  className="border-4 border-black bg-[#fff8dc] px-4 py-3 text-2xl text-black"
                >
                  {t("race.spectating")}
                </p>
              )}
            </div>

            <PixelPanel className="w-full flex-none p-4 lg:w-[28rem]">
              <h2 className="font-pixel mb-2.5 text-xs text-[#2b2b2b]">{t("race.track")}</h2>
              {visibleAnnouncements.length > 0 && (
                <ul className="mb-2 flex flex-col gap-1" aria-live="polite">
                  {visibleAnnouncements.map((a) => (
                    <li
                      key={a.id}
                      className="border-2 border-black bg-[#ffd84a] px-2 py-1 text-lg text-black"
                    >
                      {a.bonus.kind === "minus_words"
                        ? t("race.bonus_minus", { name: nameOf(a.bonus.beneficiaryId) })
                        : a.bonus.kind === "plus_words"
                          ? t("race.bonus_plus", { name: nameOf(a.bonus.beneficiaryId) })
                          : t("race.bonus_fog", { name: nameOf(a.bonus.beneficiaryId) })}
                    </li>
                  ))}
                </ul>
              )}
              <Track
                participants={state.participants}
                meId={info.meId}
                showBotLabel={t("race.bot")}
              />
            </PixelPanel>
          </div>
        </div>
      </main>
      <footer className="border-t-4 border-black bg-[#241a10] px-4 py-4 text-center text-xl text-[#f1e6c9] sm:px-8">
        {t("footer.text")}
      </footer>

      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="abandon-title"
        >
          <PixelPanel className="flex w-full max-w-md flex-col gap-4 p-6">
            <h2 id="abandon-title" className="font-pixel text-sm text-[#2b2b2b]">
              {t("race.abandon_title")}
            </h2>
            <p className="text-2xl text-[#2b2b2b]">{t("race.abandon_text")}</p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <PixelButton
                type="button"
                onClick={abandon}
                variant="red"
                className="h-14 flex-1 text-[12px]"
              >
                {t("race.abandon_confirm")}
              </PixelButton>
              <PixelButton
                type="button"
                onClick={() => setConfirming(false)}
                variant="green"
                className="h-14 flex-1 text-[12px]"
              >
                {t("race.abandon_cancel")}
              </PixelButton>
            </div>
          </PixelPanel>
        </div>
      )}
    </div>
  );
}
