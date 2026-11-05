import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguageProvider } from "@/lib/i18n";
import { CreateRoomForm } from "@/components/lobby/CreateRoomForm";

// Refonte du 4 nov. : la création se fait en deux étapes (réglages, puis aperçu du texte à accepter),
// les réglages avancés du texte sont repliés et rangés en onglets, la pénalité n'est plus une case.

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

function renderForm(name = "Salle de Alice") {
  return render(
    <LanguageProvider initialLang="fr">
      <CreateRoomForm defaultName={name} />
    </LanguageProvider>,
  );
}

describe("CreateRoomForm", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    push.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("CONTINUER montre l'aperçu ; on peut revenir aux réglages", async () => {
    const user = userEvent.setup();
    renderForm();
    expect(screen.queryByRole("button", { name: /ACCEPTER ET CREER/ })).toBeNull();

    await user.click(screen.getByRole("button", { name: "CONTINUER" }));
    expect(screen.getByRole("heading", { name: "APERCU DU TEXTE" })).toBeInTheDocument();
    expect(screen.getByText("Salle de Alice")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ACCEPTER ET CREER LA SALLE" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled(); // rien n'est créé avant d'accepter

    await user.click(screen.getByRole("button", { name: "MODIFIER LES REGLAGES" }));
    expect(screen.queryByRole("heading", { name: "APERCU DU TEXTE" })).toBeNull();
    expect(screen.getByRole("button", { name: "CONTINUER" })).toBeInTheDocument();
  });

  it("un nom refusé bloque CONTINUER et l'explique", async () => {
    const user = userEvent.setup();
    renderForm("ab");
    await user.click(screen.getByRole("button", { name: "CONTINUER" }));
    expect(screen.queryByRole("heading", { name: "APERCU DU TEXTE" })).toBeNull();
    expect(screen.getAllByText(/au moins 3 caractères/).length).toBeGreaterThan(0);
  });

  it("ACCEPTER crée la salle avec la pénalité de 1 s toujours active, puis ouvre la salle", async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ code: "ABC234" }) });
    renderForm();
    await user.click(screen.getByRole("button", { name: "CONTINUER" }));
    await user.click(screen.getByRole("button", { name: "ACCEPTER ET CREER LA SALLE" }));

    const [url, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(url).toBe("/api/lobbies");
    expect(JSON.parse(init.body)).toMatchObject({ name: "Salle de Alice", penaltySeconds: 1 });
    expect(push).toHaveBeenCalledWith("/jouer/ABC234");
  });

  it("pas de case « pénalité » : le +1 s est écrit dans le choix « on continue »", () => {
    renderForm();
    expect(screen.queryByRole("checkbox", { name: /Pénalité/ })).toBeNull();
    expect(screen.getByText(/\+1 s par faute/)).toBeInTheDocument();
  });

  it("les réglages avancés du texte sont repliés et rangés en trois onglets", async () => {
    const user = userEvent.setup();
    renderForm();
    const advanced = screen.getByTestId("advanced-text");
    expect(advanced).not.toHaveAttribute("open");

    await user.click(within(advanced).getByText("PERSONNALISER"));
    expect(advanced).toHaveAttribute("open");
    const tabs = within(advanced).getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual(["LETTRES ET CHIFFRES", "ACCENTS", "SYMBOLES"]);
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    expect(within(advanced).getByRole("group", { name: "LETTRES" })).toBeInTheDocument();

    await user.click(tabs[2]);
    expect(tabs[2]).toHaveAttribute("aria-selected", "true");
    expect(within(advanced).queryByRole("group", { name: "LETTRES" })).toBeNull();
    // Texte cohérent par défaut : pas de ponctuation, donc pas de carte de symboles.
    expect(within(advanced).getByText(/Active « Ponctuation »/)).toBeInTheDocument();
  });

  it("la durée se choisit avec des boutons", async () => {
    const user = userEvent.setup();
    renderForm();
    const durations = screen.getByRole("group", { name: "TEMPS MAXIMAL" });
    const buttons = within(durations).getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(3);
    await user.click(buttons[0]);
    expect(buttons[0]).toHaveAttribute("aria-pressed", "true");
  });
});
