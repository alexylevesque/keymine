"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { PixelShell } from "@/components/PixelShell";
import { PixelButton, PixelPanel } from "@/components/ui";
import { useLanguage } from "@/lib/i18n";
import { OAUTH_PROVIDER_NAMES, oauthErrorQuery } from "@/lib/api-input";

type Mode = "login" | "register";

export default function ConnexionPage() {
  // useSearchParams() oblige une frontière Suspense (sinon le build échoue
  // avec "missing-suspense-with-csr-bailout") — on isole juste ce hook.
  return (
    <Suspense fallback={null}>
      <ConnexionForm />
    </Suspense>
  );
}

function ConnexionForm() {
  const router = useRouter();
  const { t } = useLanguage();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    // Retour OAuth : seuls des codes connus sont acceptés et traduits (I18N-01) ; un texte arbitraire
    // passé dans l'URL n'est jamais affiché tel quel.
    const oauth = oauthErrorQuery.safeParse({
      error: searchParams.get("error"),
      provider: searchParams.get("provider"),
    });
    if (!oauth.success) return;
    const key = oauth.data.error === "oauth_failed" ? "auth.oauth_failed" : "auth.oauth_not_configured";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lu depuis l'URL de retour OAuth, pas dispo au premier rendu serveur
    setError(t(key, { provider: OAUTH_PROVIDER_NAMES[oauth.data.provider] }));
  }, [searchParams, t]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/auth/${mode === "login" ? "login" : "register"}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, rememberMe }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? t("err.generic"));
        return;
      }
      router.push("/");
      router.refresh();
    } catch {
      setError(t("err.network"));
    } finally {
      setPending(false);
    }
  }

  return (
    <PixelShell
      rightSlot={
        <PixelButton href="/" variant="slate" className="h-10 shrink-0 px-2 text-[10px] sm:px-4 sm:text-[11px]">
          {t("auth.guest")}
        </PixelButton>
      }
    >
      <div className="flex flex-col items-center gap-7 pt-6">
        <h1 className="font-pixel text-2xl text-white [text-shadow:4px_4px_0_#000]">
          {t("auth.title")}
        </h1>

        <PixelPanel className="w-full max-w-xl p-7">
          <form className="flex flex-col gap-4" onSubmit={onSubmit}>
            <div className="flex gap-2.5">
              <PixelButton
                type="button"
                variant={mode === "login" ? "green" : "slate"}
                className="flex-grow text-[13px]"
                onClick={() => setMode("login")}
              >
                {t("auth.tab_login")}
              </PixelButton>
              <PixelButton
                type="button"
                variant={mode === "register" ? "green" : "slate"}
                className="flex-grow text-[13px]"
                onClick={() => setMode("register")}
              >
                {t("auth.tab_register")}
              </PixelButton>
            </div>

            <label className="block">
              <span className="font-pixel mb-2 block text-[11px] text-[#3a3a3a]">
                {t("auth.username")}
              </span>
              <input
                className="pixel-slot h-13 w-full px-3.5 text-3xl text-white"
                placeholder={t("auth.username_placeholder")}
                name="username"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                minLength={3}
                maxLength={20}
                required
              />
            </label>

            <label className="block">
              <span className="font-pixel mb-2 block text-[11px] text-[#3a3a3a]">{t("auth.password")}</span>
              <input
                type="password"
                className="pixel-slot h-13 w-full px-3.5 text-3xl text-white"
                name="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                maxLength={72}
                required
              />
            </label>

            <label className="flex items-center gap-3 text-2xl">
              <input
                type="checkbox"
                className="h-5 w-5 accent-[#3f7d24]"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              {t("auth.remember")}
            </label>

            {error && (
              <div className="border-4 border-black bg-[#f39a8c] p-3 text-xl leading-tight text-black">
                {error}
              </div>
            )}

            <PixelButton type="submit" variant="green" className="h-16 text-lg">
              {pending ? "..." : mode === "login" ? t("auth.submit_login") : t("auth.submit_register")}
            </PixelButton>

            <div className="flex items-center gap-3.5 text-[#3a3a3a]">
              <div className="h-1 flex-grow bg-[#8b8b8b]" />
              <span className="font-pixel text-[11px]">{t("auth.or")}</span>
              <div className="h-1 flex-grow bg-[#8b8b8b]" />
            </div>

            <div className="flex gap-3">
              <a
                href="/api/auth/discord/start"
                className="pixel-btn flex-grow border-[#a5adf5] border-b-[#2a3180] border-r-[#2a3180] bg-[#4752c4] text-[13px] text-white"
                style={{ height: "3.4rem" }}
              >
                DISCORD
              </a>
              <a
                href="/api/auth/github/start"
                className="pixel-btn flex-grow border-[#8a9199] border-b-[#0d1013] border-r-[#0d1013] bg-[#24292e] text-[13px] text-white"
                style={{ height: "3.4rem" }}
              >
                GITHUB
              </a>
            </div>

            <p className="text-2xl leading-tight text-[#3a3a3a]">
              {t("auth.photo_note")}
            </p>
          </form>
        </PixelPanel>

        <div className="flex w-full max-w-xl flex-col gap-3.5 sm:flex-row">
          <div className="flex-1 border-4 border-black bg-[#fff8dc] p-3.5 text-2xl leading-tight text-black">
            {t("auth.no_email")}
          </div>
          <div className="flex-1 border-4 border-black bg-[#e6f3d8] p-3.5 text-2xl leading-tight text-black">
            {t("auth.guest_merge")}
          </div>
        </div>
      </div>
    </PixelShell>
  );
}
