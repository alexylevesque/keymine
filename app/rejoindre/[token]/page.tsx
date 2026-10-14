"use client";

import { useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { PixelShell } from "@/components/PixelShell";
import { PixelPanel } from "@/components/ui";
import { useRoomEntry } from "@/components/useRoomEntry";
import { useLanguage } from "@/lib/i18n";

// SALLE-04 : ouverture d'un lien d'invitation. On l'échange contre l'entrée
// dans la salle (pseudo d'invité demandé si besoin), puis on y redirige.
export default function RejoindrePage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { token } = useParams<{ token: string }>();
  const { run, pending, panel } = useRoomEntry((code) => router.push(`/jouer/${code}`), {
    leaveToHome: true,
  });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void run(() => fetch(`/api/invites/${encodeURIComponent(token)}`, { method: "POST" }));
  }, [token, run]);

  return (
    <PixelShell active="jouer">
      <div className="mx-auto flex max-w-xl flex-col gap-5">
        <h1 className="font-pixel text-xl text-white [text-shadow:4px_4px_0_#000]">{t("invite.page_title")}</h1>
        {panel ?? (
          <PixelPanel className="p-5">
            <p role="status" className="text-2xl">
              {pending ? t("invite.connecting") : t("invite.wait")}
            </p>
          </PixelPanel>
        )}
      </div>
    </PixelShell>
  );
}
