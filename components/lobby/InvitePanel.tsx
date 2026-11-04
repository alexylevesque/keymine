"use client";

import { useCallback, useEffect, useState } from "react";
import { PixelButton } from "@/components/ui";
import { useLanguage } from "@/lib/i18n";
import type { InviteView } from "@/lib/invites";

type ApiInvite = Omit<InviteView, "createdAt"> & { createdAt: string };

// SALLE-04 : l'hôte génère un lien par invité, le copie et suit son statut
// (non utilisé, utilisé par qui) ; un lien révoqué disparaît de la liste. `refreshKey` change à chaque mise à jour
// en direct de la salle, ce qui recharge la liste.
export function InvitePanel({ code, refreshKey }: { code: string; refreshKey: unknown }) {
  const { t } = useLanguage();
  const [invites, setInvites] = useState<ApiInvite[]>([]);
  const [label, setLabel] = useState("");
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const res = await fetch(`/api/lobbies/${code}/invites`);
    if (res.ok) setInvites(((await res.json()) as { invites: ApiInvite[] }).invites);
  }, [code]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement initial puis rechargement à chaque évolution de la salle
    void reload();
  }, [reload, refreshKey]);

  async function generate() {
    setError(null);
    const res = await fetch(`/api/lobbies/${code}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? t("err.generic"));
      return;
    }
    setLabel("");
    await reload();
  }

  async function revoke(inviteId: string) {
    await fetch(`/api/lobbies/${code}/invites`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteId }),
    });
    await reload();
  }

  async function copy(token: string) {
    const url = `${window.location.origin}/rejoindre/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(token);
      setTimeout(() => setCopied((current) => (current === token ? null : current)), 2000);
    } catch {
      window.prompt(t("invite.copy_prompt"), url);
    }
  }

  const statusText = (i: ApiInvite) =>
    i.status === "used" ? t("invite.used_by", { name: i.usedBy ?? "?" }) : t("invite.unused");

  return (
    <details className="lobby-panel room-details">
      <summary className="flex items-center justify-between gap-3 px-5 py-4">
        <h2 className="font-pixel text-[11px] text-white">{t("invite.title")}</h2>
        <span className="room-tag font-pixel" style={{ background: "#3b2a1a", color: "#ffe08a" }}>
          {invites.length}
        </span>
      </summary>
      <div className="flex flex-col gap-3 px-5 pb-5">
        <p className="text-xl text-[#cdbf9c]">{t("invite.note")}</p>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void generate();
          }}
        >
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={40}
            aria-label={t("invite.label_aria")}
            placeholder={t("invite.label_placeholder")}
            className="home-code min-w-0 flex-grow px-2.5 text-xl"
          />
          <PixelButton type="submit" variant="gold" className="h-10 px-3 text-[10px]">
            {t("invite.generate")}
          </PixelButton>
        </form>
        {error && (
          <p role="alert" className="text-xl text-[#f39a8c]">
            {error}
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {invites.map((i) => (
            <li
              key={i.id}
              className="flex flex-wrap items-center gap-2 border-b-2 border-[#3b2a1a] pb-2"
            >
              <div className="min-w-0 flex-grow leading-tight">
                <div className="truncate text-xl">{i.label ?? t("invite.guest")}</div>
                <div className="text-lg text-[#a8966e]">{statusText(i)}</div>
              </div>
              <button
                type="button"
                onClick={() => void copy(i.token)}
                className="lobby-filter font-pixel"
              >
                {copied === i.token ? t("invite.copied") : t("invite.copy")}
              </button>
              <button
                type="button"
                onClick={() => void revoke(i.id)}
                aria-label={t("invite.revoke_aria", { name: i.label ?? "" })}
                className="lobby-filter font-pixel"
              >
                {t("invite.revoke")}
              </button>
            </li>
          ))}
          {invites.length === 0 && <li className="text-xl text-[#cdbf9c]">{t("invite.none")}</li>}
        </ul>
      </div>
    </details>
  );
}
