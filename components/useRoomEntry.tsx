"use client";

import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PixelButton, PixelLabel, PixelPanel } from "./ui";
import { useLanguage } from "@/lib/i18n";

type ApiBody = { code?: string; currentCode?: string; canCreate?: boolean; error?: string };
type Action = () => Promise<Response>;
type State =
  | { kind: "idle" }
  | { kind: "pseudo"; error?: string }
  | { kind: "conflict"; currentCode: string }
  | { kind: "none"; canCreate: boolean }
  | { kind: "error"; message?: string };

/**
 * Gère les cas d'entrée dans une salle : pseudo d'invité manquant (AUTH-02),
 * déjà dans une autre salle (SALLE-06) et aucune salle disponible (JOIN-03).
 * `run` exécute une requête d'entrée ; si elle réussit, `onEntered` est appelé
 * avec le code de la salle.
 */
export function useRoomEntry(
  onEntered: (roomCode: string) => void,
  /**
   * Page qui n'a rien d'autre à montrer sans la salle (lien d'invitation, lien direct) : en cas de
   * refus, le bouton ramène à l'accueil au lieu de fermer le message sur une page vide.
   */
  { leaveToHome = false }: { leaveToHome?: boolean } = {},
) {
  const router = useRouter();
  const { t } = useLanguage();
  const [state, setState] = useState<State>({ kind: "idle" });
  const [pending, setPending] = useState(false);
  const last = useRef<Action | null>(null);

  async function run(action: Action) {
    last.current = action;
    setPending(true);
    try {
      const res = await action();
      const data = (await res.json().catch(() => ({}))) as ApiBody;
      if (res.ok) {
        setState({ kind: "idle" });
        onEntered(data.code ?? "");
      } else if (res.status === 401 && data.code === "pseudo_required") {
        setState({ kind: "pseudo" });
      } else if (res.status === 409 && data.code === "already_in_room" && data.currentCode) {
        setState({ kind: "conflict", currentCode: data.currentCode });
      } else if (res.status === 404 && data.code === "none_available") {
        setState({ kind: "none", canCreate: data.canCreate === true });
      } else {
        setState({ kind: "error", message: data.error });
      }
    } catch {
      setState({ kind: "error" });
    } finally {
      setPending(false);
    }
  }

  async function submitPseudo(pseudo: string) {
    const res = await fetch("/api/auth/guest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pseudo }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as ApiBody;
      setState({ kind: "pseudo", error: data.error });
      return;
    }
    if (last.current) await run(last.current);
  }

  async function leaveAndRetry(currentCode: string) {
    await fetch(`/api/lobbies/${currentCode}/leave`, { method: "POST" });
    if (last.current) await run(last.current);
  }

  async function createDefaultRoom() {
    const res = await fetch("/api/lobbies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const data = (await res.json().catch(() => ({}))) as ApiBody;
    if (res.ok && data.code) router.push(`/jouer/${data.code}`);
    else setState({ kind: "error", message: data.error });
  }

  function dismiss() {
    if (leaveToHome) router.push("/");
    else setState({ kind: "idle" });
  }
  const dismissLabel = leaveToHome ? t("entry.back_home") : t("entry.cancel");

  let panel: ReactNode = null;
  if (state.kind === "pseudo") {
    panel = <PseudoForm error={state.error} onSubmit={submitPseudo} onCancel={dismiss} />;
  } else if (state.kind === "conflict") {
    const { currentCode } = state;
    panel = (
      <EntryBox title={t("entry.conflict", { code: currentCode })}>
        <PixelButton variant="green" href={`/jouer/${currentCode}`} className="h-12 px-5 text-xs">
          {t("entry.conflict_go")}
        </PixelButton>
        <PixelButton
          variant="red"
          onClick={() => void leaveAndRetry(currentCode)}
          className="h-12 px-5 text-xs"
        >
          {t("entry.conflict_leave")}
        </PixelButton>
        <PixelButton variant="slate" onClick={dismiss} className="h-12 px-5 text-xs">
          {dismissLabel}
        </PixelButton>
      </EntryBox>
    );
  } else if (state.kind === "none") {
    panel = (
      <EntryBox title={t("entry.none_title")}>
        <p className="w-full text-xl">
          {state.canCreate ? t("entry.none_user") : t("entry.none_guest")}
        </p>
        {state.canCreate && (
          <PixelButton
            variant="green"
            onClick={() => void createDefaultRoom()}
            className="h-12 px-5 text-xs"
          >
            {t("entry.none_create")}
          </PixelButton>
        )}
        <PixelButton variant="slate" onClick={dismiss} className="h-12 px-5 text-xs">
          {dismissLabel}
        </PixelButton>
      </EntryBox>
    );
  } else if (state.kind === "error") {
    panel = (
      <EntryBox title={state.message ?? t("entry.error")}>
        <PixelButton variant="slate" onClick={dismiss} className="h-12 px-5 text-xs">
          {dismissLabel}
        </PixelButton>
      </EntryBox>
    );
  }

  return { run, pending, panel };
}

function EntryBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <PixelPanel className="p-5" >
      <div role="alert" className="flex flex-wrap items-center gap-3">
        <p className="font-pixel w-full text-[11px]">{title}</p>
        {children}
      </div>
    </PixelPanel>
  );
}

function PseudoForm({
  error,
  onSubmit,
  onCancel,
}: {
  error?: string;
  onSubmit: (pseudo: string) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const [pseudo, setPseudo] = useState("");

  function handle(e: FormEvent) {
    e.preventDefault();
    void onSubmit(pseudo.trim());
  }

  return (
    <PixelPanel className="p-5">
      <form onSubmit={handle} className="flex flex-col gap-3">
        <p className="font-pixel text-[11px]">{t("entry.pseudo_title")}</p>
        <label className="flex flex-col gap-1.5">
          <PixelLabel>{t("entry.pseudo_label")}</PixelLabel>
          <input
            value={pseudo}
            onChange={(e) => setPseudo(e.target.value)}
            minLength={3}
            maxLength={20}
            required
            autoFocus
            className="pixel-slot px-3 py-2 text-2xl text-white"
          />
        </label>
        <p className="text-lg">{error ?? t("entry.pseudo_hint")}</p>
        <div className="flex gap-3">
          <PixelButton type="submit" variant="green" className="h-12 px-5 text-xs">
            {t("entry.pseudo_submit")}
          </PixelButton>
          <PixelButton variant="slate" onClick={onCancel} className="h-12 px-5 text-xs">
            {t("entry.cancel")}
          </PixelButton>
        </div>
      </form>
    </PixelPanel>
  );
}
