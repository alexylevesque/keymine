"use client";

import Link from "next/link";
import { ItemIcon } from "@/components/items/ItemIcon";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { PixelShell } from "@/components/PixelShell";
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
    const key =
      oauth.data.error === "oauth_failed" ? "auth.oauth_failed" : "auth.oauth_not_configured";
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
        <Link
          href="/"
          className="shell-btn font-pixel flex h-9 shrink-0 items-center px-3 text-[9px]"
        >
          {t("auth.guest")}
        </Link>
      }
    >
      <div className="flex flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="font-pixel text-xl text-white [text-shadow:4px_4px_0_#000] sm:text-[26px]">
            {t("auth.title")}
            <span className="home-caret" aria-hidden="true" />
          </h1>
          <span className="text-xl text-[#cdbf9c]">{t("auth.subtitle")}</span>
        </div>

        <section className="lobby-panel w-full max-w-xl">
          <div className="lobby-head !py-3.5">
            <div role="tablist" aria-label={t("auth.title")} className="flex gap-1.5">
              {(
                [
                  ["login", t("auth.tab_login")],
                  ["register", t("auth.tab_register")],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={mode === key}
                  data-on={mode === key}
                  onClick={() => setMode(key)}
                  className="lb-tab font-pixel flex-1"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <form className="flex flex-col gap-4.5 p-6" onSubmit={onSubmit}>
            <label className="block">
              <span className="create-lbl font-pixel">{t("auth.username")}</span>
              <input
                className="home-code h-[52px] w-full px-3.5 text-[26px]"
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
              <span className="create-lbl font-pixel">{t("auth.password")}</span>
              <input
                type="password"
                className="home-code h-[52px] w-full px-3.5 text-[26px]"
                name="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                maxLength={72}
                required
              />
            </label>

            <label className="auth-remember text-xl">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span className="create-sw font-pixel" data-on={rememberMe} aria-hidden="true" />
              {t("auth.remember")}
            </label>

            {error && (
              <div role="alert" className="inv-toast inv-toast-err">
                {error}
              </div>
            )}

            <button type="submit" className="room-start font-pixel !h-16 !text-lg">
              {pending
                ? "..."
                : mode === "login"
                  ? t("auth.submit_login")
                  : t("auth.submit_register")}
            </button>

            <div className="flex items-center gap-3.5 text-[#a8966e]">
              <div className="h-0.5 flex-grow bg-[#3b2a1a]" />
              <span className="font-pixel text-[9px]">{t("auth.or")}</span>
              <div className="h-0.5 flex-grow bg-[#3b2a1a]" />
            </div>

            <div className="flex gap-3">
              <a href="/api/auth/discord/start" className="auth-oauth font-pixel bg-[#4752c4]">
                DISCORD
              </a>
              <a href="/api/auth/github/start" className="auth-oauth font-pixel bg-[#24292e]">
                GITHUB
              </a>
            </div>

            <p className="text-lg leading-tight text-[#a8966e]">{t("auth.photo_note")}</p>
          </form>
        </section>

        <div className="flex w-full max-w-xl flex-col gap-3.5 sm:flex-row">
          <div className="auth-tip flex-1" style={{ borderLeftColor: "#f0b429" }}>
            <ItemIcon item="totem" className="h-8 w-8 shrink-0" />
            <span>{t("auth.no_email")}</span>
          </div>
          <div className="auth-tip flex-1" style={{ borderLeftColor: "#7fc45a" }}>
            <ItemIcon item="xp_bottle" className="h-8 w-8 shrink-0" />
            <span>{t("auth.guest_merge")}</span>
          </div>
        </div>
      </div>
    </PixelShell>
  );
}
