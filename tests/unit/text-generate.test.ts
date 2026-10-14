import { describe, expect, it } from "vitest";
import { BUNDLED_CORPUS } from "@/lib/text/corpus";
import { classifyText, measureText, wordMatchesComplexity } from "@/lib/text/difficulty";
import {
  generateRaceText,
  NoTextAvailableError,
  type GenerateOptions,
} from "@/lib/text/generate";
import { createRng } from "@/lib/text/rng";
import { accentTypeOf, accentTypesIn, stripAccentTypes } from "@/lib/text/accents";

const base: GenerateOptions = {
  type: "aleatoire",
  language: "fr",
  length: 30,
  complexity: "medium",
  uppercase: false,
  punctuation: false,
  digits: false,
  accents: true,
  includeChars: [],
  excludeChars: [],
};

const gen = (o: Partial<GenerateOptions>, seed = 1) =>
  generateRaceText({ ...base, ...o }, BUNDLED_CORPUS, createRng(seed));

describe("génération du texte (CONF-02 à CONF-07)", () => {
  it("est reproductible avec la même graine", () => {
    expect(gen({}, 7)).toBe(gen({}, 7));
    expect(gen({}, 7)).not.toBe(gen({}, 8));
  });

  it("respecte la longueur en mots (CONF-04) dans les deux types", () => {
    expect(gen({ type: "aleatoire", length: 25 }).split(" ")).toHaveLength(25);
    expect(gen({ type: "coherent", length: 25 }).split(" ")).toHaveLength(25);
    expect(gen({ type: "coherent", length: 150 }).split(" ")).toHaveLength(150);
  });

  it("n'utilise que les passages de la langue choisie, indépendante de l'interface (CONF-02)", () => {
    const en = gen({ type: "coherent", language: "en", length: 12, accents: true });
    expect(en).not.toMatch(/[éèêàç]/);
    const frTitles = BUNDLED_CORPUS.texts.filter((t) => t.language === "fr");
    expect(frTitles.length).toBeGreaterThan(5);
  });

  it("texte cohérent : le passage est tapé tel qu'écrit, quelles que soient les options (CONF-06)", () => {
    const off = { uppercase: false, punctuation: false, digits: false, accents: false };
    const on = { uppercase: true, punctuation: true, digits: true, accents: true };
    const a = gen({ type: "coherent", language: "fr", length: 60, ...off }, 7);
    const b = gen({ type: "coherent", language: "fr", length: 60, ...on, accentForbidden: ["aigu"] }, 7);
    expect(a).toBe(b);
    expect(a).toMatch(/[A-ZÀ-Ý]/); // majuscules d'origine
    expect(a).toMatch(/[,.!?;:]/); // ponctuation d'origine
    expect(a).toMatch(/[éèêàçùâîôû]/); // accents d'origine
  });

  it("exclut les caractères demandés du texte aléatoire (CONF-07)", () => {
    for (const seed of [1, 2, 3]) {
      const text = gen({ excludeChars: ["e", "a"], complexity: "easy", length: 60, digits: true, punctuation: true }, seed);
      expect(text.toLowerCase()).not.toMatch(/[ea]/);
    }
  });

  it("inclut les caractères demandés dans le texte aléatoire (CONF-07)", () => {
    const text = gen({ includeChars: ["z"], length: 40 });
    expect((text.match(/z/gi) ?? []).length).toBeGreaterThan(3);
  });

  it("l'exclusion l'emporte sur l'inclusion d'un même caractère", () => {
    const text = gen({ includeChars: ["q"], excludeChars: ["q"], length: 40 });
    expect(text.toLowerCase()).not.toContain("q");
  });

  it("ne génère aucun mot accentué si les accents sont désactivés", () => {
    expect(gen({ accents: false, complexity: "hard", length: 80 })).not.toMatch(/[éèêàçùîôâ]/);
  });

  it("choisit des mots de la complexité demandée (CONF-05)", () => {
    for (const level of ["easy", "medium", "hard"] as const) {
      const words = gen({ complexity: level, length: 60, accents: true }).split(" ");
      const ok = words.filter((w) => wordMatchesComplexity(w, level)).length;
      expect(ok / words.length).toBeGreaterThan(0.9);
    }
  });

  it("lève une erreur explicite quand rien ne correspond", () => {
    expect(() =>
      generateRaceText(
        { ...base, excludeChars: "abcdefghijklmnopqrstuvwxyzéèêàç".split("").slice(0, 10) },
        { texts: [], words: { fr: ["abcde"], en: [] } },
      ),
    ).toThrow(NoTextAvailableError);
  });
});

describe("critères de complexité mesurables (CONF-05)", () => {
  it("classe les mots par longueur et accents", () => {
    expect(wordMatchesComplexity("chat", "easy")).toBe(true);
    expect(wordMatchesComplexity("éléphant", "easy")).toBe(false);
    expect(wordMatchesComplexity("maison", "medium")).toBe(true);
    expect(wordMatchesComplexity("extraordinaire", "hard")).toBe(true);
    expect(wordMatchesComplexity("chat", "hard")).toBe(false);
  });

  it("mesure et classe les passages", () => {
    const m = measureText("le chat dort sur le lit");
    expect(m.wordCount).toBe(6);
    expect(m.averageWordLength).toBeCloseTo(3, 1);
    expect(classifyText("le chat dort sur le lit")).toBe("easy");
    expect(classifyText("l'extraordinaire développement caractéristique particulièrement")).toBe("hard");
  });

  it("le corpus embarqué couvre au moins deux niveaux par langue", () => {
    for (const language of ["fr", "en"] as const) {
      const levels = new Set(BUNDLED_CORPUS.texts.filter((t) => t.language === language).map((t) => t.difficulty));
      expect(levels.size).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("types d'accents (CONF-06)", () => {
  it("classe les lettres accentuées par type", () => {
    expect(accentTypeOf("é")).toBe("aigu");
    expect(accentTypeOf("À")).toBe("grave");
    expect(accentTypeOf("ô")).toBe("circonflexe");
    expect(accentTypeOf("ï")).toBe("trema");
    expect(accentTypeOf("ç")).toBe("cedille");
    expect(accentTypeOf("œ")).toBeNull(); // les ligatures ne sont pas un type à part
    expect(accentTypeOf("e")).toBeNull();
    expect([...accentTypesIn("où êtes-vous ? déjà")].sort()).toEqual(["aigu", "circonflexe", "grave"]);
  });

  it("retire seulement les types demandés", () => {
    expect(stripAccentTypes("garçon où naïf cœur été", ["cedille", "aigu"])).toBe("garcon où naïf cœur ete");
    expect(stripAccentTypes("Élève", ["aigu"])).toBe("Elève");
    expect(stripAccentTypes("été", [])).toBe("été");
  });

  it("n'écrit aucun mot avec un type d'accent interdit, texte aléatoire", () => {
    for (const seed of [1, 2, 3]) {
      const text = gen({ accentForbidden: ["aigu", "circonflexe"], length: 120, complexity: "hard" }, seed);
      expect(text).not.toMatch(/[éâêîôû]/);
    }
  });

  it("privilégie un type d'accent demandé, texte aléatoire", () => {
    const share = (text: string) => text.split(" ").filter((w) => /[àèù]/.test(w)).length / text.split(" ").length;
    const plain = share(gen({ length: 300, complexity: "hard" }, 4));
    const favored = share(gen({ accentWanted: ["grave"], length: 300, complexity: "hard" }, 4));
    expect(favored).toBeGreaterThan(plain);
    expect(favored).toBeGreaterThan(0.3);
  });

  it("ignore les accents souhaités quand les accents sont désactivés", () => {
    expect(gen({ accents: false, accentWanted: ["aigu"], length: 100 })).not.toMatch(/[éèêàçù]/);
  });


});

describe("lettres et symboles à privilégier ou interdits (CONF-07)", () => {
  it("un symbole interdit n'apparaît jamais, même dans les mots du dictionnaire", () => {
    for (const seed of [1, 2, 3]) {
      const text = gen({ punctuation: true, excludeChars: ["'", "-", ".", ","], length: 200 }, seed);
      expect(text).not.toMatch(/['\-.,]/);
    }
  });

  it("les symboles souhaités apparaissent dans le texte, avec ponctuation activée", () => {
    const text = gen({ punctuation: true, includeChars: ["@", "(", "+"], length: 200 }, 5);
    expect(text).toContain("@");
    expect(text).toMatch(/\([^ ]+\)/); // un mot entre parenthèses
    expect(text).toMatch(/[a-zéèêàç]\+[a-zéèêàç]/); // opérateur entre deux mots
  });

  it("les symboles souhaités sont ignorés quand la ponctuation est désactivée", () => {
    expect(gen({ punctuation: false, includeChars: ["@", "("], length: 100 })).not.toMatch(/[@(]/);
  });

  it("une parenthèse ouvrante seule n'amène pas la fermante si celle-ci est interdite", () => {
    const text = gen({ punctuation: true, includeChars: ["("], excludeChars: [")"], length: 200 }, 6);
    expect(text).toContain("(");
    expect(text).not.toContain(")");
  });

  it("un symbole souhaité ne perturbe pas le choix des lettres (le filtre de mots reste sur les lettres)", () => {
    const text = gen({ punctuation: true, includeChars: ["z", "#"], length: 150 }, 8);
    const withZ = text.split(" ").filter((w) => w.toLowerCase().includes("z")).length;
    expect(withZ).toBeGreaterThan(30);
    expect(text).toContain("#");
  });
});
