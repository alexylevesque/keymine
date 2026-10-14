import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PixelAvatar, PixelChip } from "@/components/ui";

describe("PixelChip", () => {
  it("affiche son contenu", () => {
    render(<PixelChip>FR</PixelChip>);
    expect(screen.getByText("FR")).toBeInTheDocument();
  });

  it("marque l'état actif avec data-on", () => {
    render(<PixelChip on>é</PixelChip>);
    expect(screen.getByText("é")).toHaveAttribute("data-on", "true");
  });
});

describe("PixelAvatar", () => {
  it("affiche l'initiale avec la couleur fournie", () => {
    render(<PixelAvatar label="A" color="#3d6fc4" />);
    const avatar = screen.getByText("A");
    expect(avatar).toHaveStyle({ backgroundColor: "#3d6fc4" });
  });

  it("dessine un avatar généré (AUTH-03) quand il n'y a pas de photo mais une graine", () => {
    const { container } = render(<PixelAvatar label="I" color="#000000" seed="invité-42" />);
    const avatar = container.querySelector("[data-avatar]")!;
    expect(avatar).toHaveAttribute("data-avatar", "generated");
    expect(avatar.querySelectorAll("rect").length).toBeGreaterThan(0);
    expect(avatar.textContent).toBe("");
  });

  it("préfère la photo à l'avatar généré", () => {
    const { container } = render(<PixelAvatar label="A" color="#000000" seed="alice" src="/a.png" />);
    expect(container.querySelector("[data-avatar]")).toHaveAttribute("data-avatar", "photo");
    expect(container.querySelector("img")).toHaveAttribute("src", "/a.png");
  });

  it("garde l'initiale sans graine (bots)", () => {
    const { container } = render(<PixelAvatar label="B" color="#555555" seed={null} />);
    expect(container.querySelector("[data-avatar]")).toHaveAttribute("data-avatar", "initial");
  });
});
