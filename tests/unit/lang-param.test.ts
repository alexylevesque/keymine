import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { langParam } from "@/lib/lang-param";
import { proxy } from "@/proxy";

// « ?lang=fr|en » force la langue de l'accueil (liens hreflang) ; toute autre valeur est ignorée.
describe("paramètre ?lang= (hreflang)", () => {
  it("n'accepte que fr et en", () => {
    expect(langParam.safeParse("fr").success).toBe(true);
    expect(langParam.safeParse("en").success).toBe(true);
    expect(langParam.safeParse("es").success).toBe(false);
    expect(langParam.safeParse(null).success).toBe(false);
  });

  it("le proxy transmet la langue demandée et ignore l'en-tête envoyé par le navigateur", () => {
    const forced = proxy(new NextRequest("https://keymine.quest/?lang=en"));
    expect(forced.headers.get("x-middleware-request-x-km-lang")).toBe("en");

    const spoofed = proxy(
      new NextRequest("https://keymine.quest/?lang=xx", { headers: { "x-km-lang": "fr" } }),
    );
    expect(spoofed.headers.get("x-middleware-request-x-km-lang")).toBeNull();
  });
});
