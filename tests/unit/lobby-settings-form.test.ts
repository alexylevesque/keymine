import { describe, expect, it } from "vitest";
import {
  choiceState,
  cycleChoice,
  DEFAULT_SETTINGS,
  setBonusEnabled,
  settingsToPayload,
  toggleBonusKind,
  type SettingsState,
} from "@/components/lobby/settings";
import { LETTERS, LETTER_ROWS, SYMBOLS } from "@/components/lobby/key-maps";
import { lobbySettingsSchema } from "@/lib/lobby-schema";

const state = (patch: Partial<SettingsState> = {}): SettingsState => ({
  ...DEFAULT_SETTINGS,
  ...patch,
});

describe("touches à trois états (CONF-06, CONF-07)", () => {
  it("un clic passe de neutre à souvent, puis à jamais, puis revient à neutre", () => {
    let lists = { wanted: [] as string[], forbidden: [] as string[] };
    expect(choiceState("q", lists.wanted, lists.forbidden)).toBe("neutral");
    lists = cycleChoice("q", lists.wanted, lists.forbidden);
    expect(lists).toEqual({ wanted: ["q"], forbidden: [] });
    expect(choiceState("q", lists.wanted, lists.forbidden)).toBe("wanted");
    lists = cycleChoice("q", lists.wanted, lists.forbidden);
    expect(lists).toEqual({ wanted: [], forbidden: ["q"] });
    expect(choiceState("q", lists.wanted, lists.forbidden)).toBe("forbidden");
    lists = cycleChoice("q", lists.wanted, lists.forbidden);
    expect(lists).toEqual({ wanted: [], forbidden: [] });
  });

  it("ne touche pas aux autres touches", () => {
    const next = cycleChoice("b", ["a", "z"], ["c"]);
    expect(next).toEqual({ wanted: ["a", "z", "b"], forbidden: ["c"] });
  });

  it("les cartes couvrent les 26 lettres et tous les symboles du clavier, sans doublon", () => {
    expect([...LETTERS].sort().join("")).toBe("abcdefghijklmnopqrstuvwxyz");
    for (const symbol of [..."`~!@#$%^&*()_+-=[]{}\\|;:'\",<.>/?"])
      expect(SYMBOLS).toContain(symbol);
    expect(new Set(SYMBOLS).size).toBe(SYMBOLS.length);
    expect(LETTER_ROWS).toHaveLength(3);
  });
});

describe("types de bonus (CONF-09)", () => {
  it("décocher le dernier type coupe l'interrupteur, le réactiver les remet tous", () => {
    let s = state();
    expect(s.bonusKinds).toEqual(["minus_words", "plus_words", "fog"]);
    s = { ...s, ...toggleBonusKind(s, "fog") };
    s = { ...s, ...toggleBonusKind(s, "minus_words") };
    expect(s.bonusKinds).toEqual(["plus_words"]);
    expect(s.comebackBonus).toBe(true);
    s = { ...s, ...toggleBonusKind(s, "plus_words") };
    expect(s).toMatchObject({ bonusKinds: [], comebackBonus: false });
    s = { ...s, ...setBonusEnabled(s, true) };
    expect(s).toMatchObject({
      bonusKinds: ["minus_words", "plus_words", "fog"],
      comebackBonus: true,
    });
  });

  it("couper l'interrupteur garde le choix des types", () => {
    const s = state({ bonusKinds: ["fog"] });
    expect({ ...s, ...setBonusEnabled(s, false) }).toMatchObject({
      comebackBonus: false,
      bonusKinds: ["fog"],
    });
  });
});

describe("corps envoyé au serveur", () => {
  const chosen = {
    includeChars: ["z", "@"],
    excludeChars: ["e", "'"],
    accentWanted: ["cedille" as const],
    accentForbidden: ["trema" as const],
  };

  it("texte aléatoire : lettres et symboles visibles sont envoyés", () => {
    const payload = settingsToPayload(
      state({ ...chosen, textType: "aleatoire", options: ["Accents", "Ponctuation"] }),
    );
    expect(payload).toMatchObject({
      includeChars: ["z", "@"],
      excludeChars: ["e", "'"],
      accentWanted: ["cedille"],
      accentForbidden: ["trema"],
    });
    expect(lobbySettingsSchema.safeParse(payload).success).toBe(true);
  });

  it("les symboles d'une carte masquée (ponctuation décochée) ne sont pas envoyés", () => {
    const payload = settingsToPayload(
      state({ ...chosen, textType: "aleatoire", options: ["Accents"] }),
    );
    expect(payload.includeChars).toEqual(["z"]);
    expect(payload.excludeChars).toEqual(["e"]);
  });

  it("texte cohérent : aucune carte de touches ni type d'accent envoyé (passage tel qu'écrit)", () => {
    const payload = settingsToPayload(
      state({ ...chosen, textType: "coherent", options: ["Accents", "Ponctuation"] }),
    );
    expect(payload).toMatchObject({
      includeChars: [],
      excludeChars: [],
      accentWanted: [],
      accentForbidden: [],
    });
  });

  it("anglais : jamais d'accents, même cochés (CONF-06)", () => {
    const payload = settingsToPayload(
      state({ ...chosen, textType: "aleatoire", language: "en", options: ["Accents", "Ponctuation"] }),
    );
    expect(payload).toMatchObject({ accents: false, accentWanted: [], accentForbidden: [], punctuation: true });
  });

  it("par défaut, aucune option de texte n'est cochée", () => {
    expect(DEFAULT_SETTINGS.options).toEqual([]);
  });

  it("accents désactivés : aucun type d'accent envoyé", () => {
    const payload = settingsToPayload(state({ ...chosen, textType: "aleatoire", options: [] }));
    expect(payload).toMatchObject({ accentWanted: [], accentForbidden: [] });
  });

  it("bonus : sans type choisi, l'interrupteur est envoyé coupé", () => {
    expect(settingsToPayload(state({ comebackBonus: true, bonusKinds: [] }))).toMatchObject({
      comebackBonus: false,
      bonusKinds: [],
    });
    expect(settingsToPayload(state({ bonusKinds: ["fog"] }))).toMatchObject({
      comebackBonus: true,
      bonusKinds: ["fog"],
    });
  });
});
