"use client";

import { useParams, useRouter } from "next/navigation";
import { participantName } from "@/lib/bot-name";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Track } from "@/components/race/Track";
import type { WornArmor } from "@/lib/armor-look";
import { LanguageSelect } from "@/components/LanguageSelect";
import Image from "next/image";
import logoRond from "@/public/logo-rond.png";
import { useViewer } from "@/lib/viewer";
import { levelFromXp } from "@/lib/xp";
import type { RaceState } from "@/components/race/types";
import { useRaceConnection } from "@/components/race/useRaceConnection";
import { PixelButton } from "@/components/ui";
import { useLanguage, type DictKey } from "@/lib/i18n";
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
  /** Armure portée par chaque participant (identifiant de participant → matériaux). */
  armor: Record<string, WornArmor>;
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
  const viewer = useViewer();
  // Abandon volontaire : on perd un niveau d'expérience complet (comptes seulement).
  const viewerLevel = viewer?.kind === "user" ? levelFromXp(viewer.xp).level : 0;
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
          armor: data.armor ?? {},
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
  // On peut taper dès que le serveur annonce le départ (« racing »), ou dès l'heure de départ si ce message
  // n'est pas encore arrivé. Avant, il fallait les deux, et `serverNow` n'avance que toutes les 200 ms :
  // la première frappe juste après le décompte pouvait être perdue (trouvé par les tests e2e).
  const racing =
    !!state &&
    (state.phase === "racing" || (state.phase === "countdown" && serverNow >= state.startsAt));
  const canType = isParticipant && racing && me?.status === "racing";
  const unlimited = !!state && state.endsAt === null;
  const secondsLeft = state && state.endsAt !== null ? (state.endsAt - serverNow) / 1000 : 0;
  const secondsElapsed = state ? Math.max(0, (serverNow - state.startsAt) / 1000) : 0;
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
  const scheduleSend = useCallback(
    (immediate: boolean) => throttle.current?.schedule(immediate),
    [],
  );

  // Frappe au clavier : pas de retour arrière, pas de collage (COURSE-04). useLayoutEffect : l'écoute est
  // en place avant que la fin du décompte s'affiche, sinon une frappe immédiate pouvait être perdue.
  useLayoutEffect(() => {
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

  const timerText = state
    ? formatClock(unlimited ? secondsElapsed : Math.max(0, secondsLeft))
    : "--:--";
  const [mm, ss] = timerText.split(":");
  const header = (
    <header className="border-b-4 border-black bg-[#1b1209]">
      <div className="mx-auto grid max-w-[1216px] grid-cols-[1fr_auto_1fr] items-center gap-5 px-4 py-3 sm:px-8">
        <div className="flex min-w-0 items-center gap-3.5">
          <Image src={logoRond} alt="KeyMine" className="h-9 w-9" />
          <span className="font-pixel truncate text-[9px] text-[#a8966e]">
            {t("race.room_label")} <span className="text-[#ffe08a]">{code}</span>
          </span>
          <span className="hidden items-center gap-1.5 text-[19px] text-[#cdbf9c] lg:flex">
            <span className="race-live" aria-hidden="true" />
            {t("race.live")}
          </span>
        </div>
        <div
          role="timer"
          aria-label={`${unlimited ? t("race.time_elapsed") : t("race.time_left")} ${timerText}`}
          className="font-pixel border-4 border-black bg-[#2b1e13] px-4 py-2 text-[28px] text-white [text-shadow:3px_3px_0_#000]"
        >
          {mm}
          <span className="race-colon">:</span>
          {ss}
        </div>
        <div className="flex items-center justify-end gap-2.5">
          {isParticipant && me?.status === "racing" && (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="race-quit font-pixel"
            >
              {t("race.abandon")}
            </button>
          )}
          <LanguageSelect />
        </div>
      </div>
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
    ? personalBanner.bonus.blocked
      ? t("race.bonus_you_blocked")
      : personalBanner.bonus.kind === "minus_words"
        ? t("race.bonus_you_minus")
        : personalBanner.bonus.kind === "plus_words"
          ? t("race.bonus_you_plus")
          : t("race.bonus_you_fog")
    : null;
  const pct = raceText.length ? Math.round((view.index / raceText.length) * 100) : 0;

  // Série sans faute : caractères bien tapés depuis la dernière faute.
  let lastError = -1;
  for (const i of view.incorrect) if (i < view.index && i > lastError) lastError = i;
  const streak = Math.max(0, view.index - lastError - 1);
  const wpmNow = Math.round(me?.wpm ?? 0);
  const penalty = me?.penaltyMs ?? 0;
  // Mot en cours : souligné en or.
  let wordStart = view.index;
  while (wordStart > 0 && raceText[wordStart - 1] !== " ") wordStart--;
  let wordEnd = view.index;
  while (wordEnd < raceText.length && raceText[wordEnd] !== " ") wordEnd++;
  const toast =
    personalText ??
    (visibleAnnouncements.length > 0
      ? (() => {
          const a = visibleAnnouncements[visibleAnnouncements.length - 1]!;
          return a.bonus.kind === "minus_words"
            ? t("race.bonus_minus", { name: nameOf(a.bonus.beneficiaryId) })
            : a.bonus.kind === "plus_words"
              ? t("race.bonus_plus", { name: nameOf(a.bonus.beneficiaryId) })
              : t("race.bonus_fog", { name: nameOf(a.bonus.beneficiaryId) });
        })()
      : null);

  return (
    <div className="pixel-night min-h-screen">
      {header}

      <main className="mx-auto flex w-full max-w-[1216px] flex-col gap-6 px-4 pt-7 pb-14 sm:px-8">
        <h1 className="sr-only">{t("race.room", { code })}</h1>
        {status === "reconnecting" && (
          <div
            role="alert"
            className="border-4 border-black bg-[#f39a8c] px-4 py-2 text-xl text-black"
          >
            {t("race.reconnecting")}
          </div>
        )}

        {state.phase === "countdown" && (
          <div className="text-center" role="status" aria-live="assertive">
            <div className="font-pixel text-6xl text-white [text-shadow:4px_4px_0_#000]">
              {secondsToStart > 0 ? secondsToStart : t("race.go")}
            </div>
            <p className="mt-2 text-2xl text-[#f1e6c9]">{t("race.get_ready")}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className="race-stat flex items-end justify-between">
            <div>
              <div className="font-pixel text-[8px] text-[#ffe08a]">{t("race.speed")}</div>
              <div className="text-[38px] leading-none">
                {wpmNow} <span className="text-xl">{t("race.wpm")}</span>
              </div>
            </div>
            <div className="race-spark" aria-hidden="true">
              {[0.4, 0.55, 0.5, 0.7, 0.65, 0.9].map((h, i) => (
                <i
                  key={i}
                  style={{ height: `${Math.round(h * Math.min(1, 0.4 + wpmNow / 120) * 100)}%` }}
                />
              ))}
            </div>
          </div>
          <div className="race-stat">
            <div className="font-pixel text-[8px] text-[#ffe08a]">{t("race.accuracy")}</div>
            <div className="text-[38px] leading-none">
              {formatPercent(lang, me?.accuracy ?? 100)}
            </div>
          </div>
          <div className="race-stat">
            <div className="font-pixel text-[8px] text-[#ffe08a]">{t("race.errors")}</div>
            <div className="text-[38px] leading-none">
              {Math.max(view.errors, me?.errors ?? 0)}
              {penalty > 0 && (
                <span className="ml-2 text-xl text-[#f39a8c]">
                  +{formatNumber(lang, penalty / 1000)} s
                </span>
              )}
            </div>
          </div>
          <div className="race-stat">
            <div className="font-pixel text-[8px] text-[#ffe08a]">{t("race.streak")}</div>
            <div className="text-[38px] leading-none text-[#f0b429]">
              <span className="race-flame" aria-hidden="true" />
              <span className={streak > 0 ? "race-combo" : ""}>{streak}</span>
            </div>
          </div>
        </div>

        {now - overtakeAt < 2_200 && (
          <div
            role="status"
            className="font-pixel border-4 border-black bg-[#7fd36a] px-4 py-2.5 text-[12px] text-[#1b1b1b]"
          >
            {t("race.overtake")}
          </div>
        )}

        {isParticipant ? (
          <section className="lobby-panel relative" aria-label={t("race.text_aria")}>
            <div
              className="race-prog"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-label={t("race.progress", { pct })}
            >
              <span style={{ width: `${pct}%` }} />
            </div>
            {toast && (
              <div role="status" aria-live="polite" className="race-toast">
                <span className="font-pixel text-[8px]">{t("race.bonus_tag")}</span>
                <span>{toast}</span>
              </div>
            )}
            <div className="race-txt break-words" role="group" aria-label={t("race.text_aria")}>
              {raceText.split("").map((c, i) => {
                const cls =
                  i === view.index
                    ? "race-cur"
                    : i < view.index
                      ? view.incorrect.has(i)
                        ? "race-err"
                        : "race-done"
                      : "race-next";
                const blurred = fogged && i > view.index && i <= view.index + FOG_LENGTH;
                const inWord = i >= wordStart && i < wordEnd;
                return (
                  <span
                    key={i}
                    className={`${cls} ${inWord ? "race-word" : ""}`}
                    style={blurred ? { filter: "blur(5px)" } : undefined}
                  >
                    {c}
                  </span>
                );
              })}
            </div>
            <p className="px-8 pb-4 text-lg text-[#a8966e]">
              {info.errorMode === "bloquer" ? t("race.hint_block") : t("race.hint_free")}
            </p>
          </section>
        ) : (
          <p role="status" className="lobby-panel px-4 py-3 text-2xl">
            {t("race.spectating")}
          </p>
        )}

        <section aria-labelledby="piste" className="lobby-panel">
          <div className="lobby-head flex items-center justify-between gap-3 !py-3.5">
            <h2 id="piste" className="font-pixel text-xs text-white [text-shadow:3px_3px_0_#000]">
              {t("race.mine")}
            </h2>
            <span className="text-xl text-white">{t("race.mine_sub")}</span>
          </div>
          {visibleAnnouncements.length > 0 && (
            <ul className="sr-only" aria-live="polite">
              {visibleAnnouncements.map((a) => (
                <li key={a.id}>
                  {a.bonus.kind === "minus_words"
                    ? t("race.bonus_minus", { name: nameOf(a.bonus.beneficiaryId) })
                    : a.bonus.kind === "plus_words"
                      ? t("race.bonus_plus", { name: nameOf(a.bonus.beneficiaryId) })
                      : t("race.bonus_fog", { name: nameOf(a.bonus.beneficiaryId) })}
                  {a.bonus.blocked &&
                    ` ${t(`race.blocked_${a.bonus.blocked}` as DictKey, { name: nameOf(a.bonus.targetId) })}`}
                  {a.bonus.thorns &&
                    ` ${t("race.thorns", { name: nameOf(a.bonus.targetId), sender: nameOf(a.bonus.beneficiaryId) })}`}
                </li>
              ))}
            </ul>
          )}
          <div className="px-5 pt-4.5 pb-5">
            <Track
              participants={state.participants}
              meId={info.meId}
              showBotLabel={t("race.bot")}
            />
          </div>
        </section>
      </main>

      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="abandon-title"
        >
          <div className="lobby-panel km-pop w-full max-w-md">
            <div className="abandon-head flex items-center gap-3 px-5 py-4">
              <span className="abandon-flag" aria-hidden="true" />
              <h2 id="abandon-title" className="font-pixel text-[13px] text-white">
                {t("race.abandon_title")}
              </h2>
            </div>
            <div className="flex flex-col gap-4 p-5">
              <p className="text-2xl leading-tight text-[#f1e6c9]">{t("race.abandon_text")}</p>
              {viewerLevel > 0 && (
                <p className="abandon-xp text-2xl leading-tight" data-testid="abandon-xp">
                  {t("race.abandon_xp", { from: viewerLevel, to: viewerLevel - 1 })}
                </p>
              )}
              <div className="flex flex-col gap-3 sm:flex-row">
                <button type="button" onClick={abandon} className="abandon-yes font-pixel flex-1">
                  {t("race.abandon_confirm")}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="res-replay font-pixel abandon-stay flex-1"
                  autoFocus
                >
                  {t("race.abandon_cancel")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
