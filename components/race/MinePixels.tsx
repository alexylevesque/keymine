"use client";

// Pixels de la course « LA MINE » (maquette du 4 nov.) : le mineur en 2 poses de course et le
// diamant de l'arrivée. Dessins originaux ; les couleurs du corps viennent de variables CSS
// (--m, --l, --d) pour prendre la couleur de chaque joueur.
import type { CSSProperties } from "react";
import { armorVars, type WornArmor } from "@/lib/armor-look";
import { photoSkin, usePhotoPixels } from "@/lib/photo-skin";

const RUN_A =
  '<path fill="var(--h1)" d="M4 0h1v1h-1zM5 0h1v1h-1zM6 0h1v1h-1zM7 0h1v1h-1zM8 0h1v1h-1zM3 1h1v1h-1zM9 1h1v1h-1zM6 5h1v1h-1z"/><path fill="var(--c1)" d="M5 6h1v1h-1zM6 6h1v1h-1zM7 6h1v1h-1zM8 6h1v1h-1zM4 7h1v1h-1zM9 7h1v1h-1zM10 7h1v1h-1zM3 8h1v1h-1z"/><path fill="var(--g1)" d="M5 12h1v1h-1zM6 12h1v1h-1zM7 12h1v1h-1zM8 12h1v1h-1zM4 13h1v1h-1zM9 13h1v1h-1zM3 14h1v1h-1zM10 14h1v1h-1zM2 15h1v1h-1zM11 15h1v1h-1z"/><path fill="var(--b1)" d="M2 16h1v1h-1zM3 16h1v1h-1zM10 16h1v1h-1zM11 16h1v1h-1zM1 17h1v1h-1z"/><path fill="var(--h2)" d="M4 1h1v1h-1zM5 1h1v1h-1zM6 1h1v1h-1zM7 1h1v1h-1zM8 1h1v1h-1zM3 2h1v1h-1zM4 2h1v1h-1zM5 2h1v1h-1zM3 3h1v1h-1zM4 3h1v1h-1zM5 3h1v1h-1zM3 4h1v1h-1zM4 4h1v1h-1zM5 4h1v1h-1zM4 5h1v1h-1zM5 5h1v1h-1z"/><path fill="var(--c2)" d="M5 7h1v1h-1zM6 7h1v1h-1zM7 7h1v1h-1zM8 7h1v1h-1zM5 8h1v1h-1zM6 8h1v1h-1zM7 8h1v1h-1zM8 8h1v1h-1zM9 8h1v1h-1zM5 9h1v1h-1zM6 9h1v1h-1zM7 9h1v1h-1zM5 10h1v1h-1zM6 10h1v1h-1zM7 10h1v1h-1zM5 11h1v1h-1zM6 11h1v1h-1zM7 11h1v1h-1z"/><path fill="var(--g2)" d="M8 13h1v1h-1zM9 14h1v1h-1zM10 15h1v1h-1z"/><path fill="var(--l)" d="M6 2h1v1h-1zM7 2h1v1h-1zM8 2h1v1h-1zM9 2h1v1h-1zM10 2h1v1h-1zM10 9h1v1h-1zM11 10h1v1h-1z"/><path fill="var(--m)" d="M6 3h1v1h-1zM7 3h1v1h-1zM9 3h1v1h-1zM10 3h1v1h-1zM6 4h1v1h-1zM7 4h1v1h-1zM8 4h1v1h-1zM9 4h1v1h-1zM10 4h1v1h-1zM7 5h1v1h-1zM8 5h1v1h-1zM9 5h1v1h-1zM11 9h1v1h-1z"/><path fill="#1B1209" d="M8 3h1v1h-1z"/><path fill="var(--c3)" d="M4 8h1v1h-1zM10 8h1v1h-1zM8 9h1v1h-1zM8 10h1v1h-1zM8 11h1v1h-1z"/><path fill="var(--g3)" d="M5 13h1v1h-1zM4 14h1v1h-1zM3 15h1v1h-1z"/><path fill="var(--b3)" d="M2 17h1v1h-1zM11 17h1v1h-1z"/><path fill="var(--d)" d="M2 9h1v1h-1zM3 9h1v1h-1zM2 10h1v1h-1z"/>';
const RUN_B =
  '<path fill="var(--h1)" d="M4 0h1v1h-1zM5 0h1v1h-1zM6 0h1v1h-1zM7 0h1v1h-1zM8 0h1v1h-1zM3 1h1v1h-1zM9 1h1v1h-1zM6 5h1v1h-1z"/><path fill="var(--c1)" d="M5 6h1v1h-1zM6 6h1v1h-1zM7 6h1v1h-1zM8 6h1v1h-1zM8 7h1v1h-1zM4 8h1v1h-1zM8 9h1v1h-1zM5 11h1v1h-1z"/><path fill="var(--g1)" d="M5 12h1v1h-1zM6 12h1v1h-1zM7 12h1v1h-1zM8 12h1v1h-1zM4 14h1v1h-1zM9 15h1v1h-1z"/><path fill="var(--b1)" d="M4 16h1v1h-1zM5 16h1v1h-1zM8 16h1v1h-1zM9 16h1v1h-1zM3 17h1v1h-1z"/><path fill="var(--h2)" d="M4 1h1v1h-1zM5 1h1v1h-1zM6 1h1v1h-1zM7 1h1v1h-1zM8 1h1v1h-1zM3 2h1v1h-1zM4 2h1v1h-1zM5 2h1v1h-1zM3 3h1v1h-1zM4 3h1v1h-1zM5 3h1v1h-1zM3 4h1v1h-1zM4 4h1v1h-1zM5 4h1v1h-1zM4 5h1v1h-1zM5 5h1v1h-1z"/><path fill="var(--c2)" d="M5 7h1v1h-1zM6 7h1v1h-1zM7 7h1v1h-1zM5 8h1v1h-1zM6 8h1v1h-1zM7 8h1v1h-1zM5 9h1v1h-1zM6 9h1v1h-1zM7 9h1v1h-1zM6 10h1v1h-1zM7 10h1v1h-1zM8 10h1v1h-1zM6 11h1v1h-1zM7 11h1v1h-1z"/><path fill="var(--g2)" d="M7 13h1v1h-1zM7 14h1v1h-1zM8 15h1v1h-1z"/><path fill="var(--b2)" d="M8 17h1v1h-1z"/><path fill="var(--l)" d="M6 2h1v1h-1zM7 2h1v1h-1zM8 2h1v1h-1zM9 2h1v1h-1zM10 2h1v1h-1z"/><path fill="var(--m)" d="M6 3h1v1h-1zM7 3h1v1h-1zM9 3h1v1h-1zM10 3h1v1h-1zM6 4h1v1h-1zM7 4h1v1h-1zM8 4h1v1h-1zM9 4h1v1h-1zM10 4h1v1h-1zM7 5h1v1h-1zM8 5h1v1h-1zM9 5h1v1h-1zM9 9h1v1h-1zM9 10h1v1h-1zM10 10h1v1h-1z"/><path fill="#1B1209" d="M8 3h1v1h-1z"/><path fill="var(--c3)" d="M8 8h1v1h-1zM8 11h1v1h-1z"/><path fill="var(--g3)" d="M5 13h1v1h-1zM6 13h1v1h-1zM8 13h1v1h-1zM5 14h1v1h-1zM8 14h1v1h-1zM4 15h1v1h-1zM5 15h1v1h-1z"/><path fill="var(--b3)" d="M4 17h1v1h-1zM9 17h1v1h-1z"/><path fill="var(--d)" d="M4 9h1v1h-1zM4 10h1v1h-1z"/>';
const DIAMOND =
  '<path fill="#0B2E2C" d="M0 0h16v1h-16zM0 1h1v1h-1zM15 1h1v1h-1zM0 2h1v1h-1zM15 2h1v1h-1zM0 3h1v1h-1zM15 3h1v1h-1zM0 4h1v1h-1zM15 4h1v1h-1zM0 5h1v1h-1zM15 5h1v1h-1zM0 6h1v1h-1zM15 6h1v1h-1zM0 7h1v1h-1zM15 7h1v1h-1zM0 8h1v1h-1zM15 8h1v1h-1zM0 9h1v1h-1zM15 9h1v1h-1zM0 10h1v1h-1zM15 10h1v1h-1zM0 11h1v1h-1zM15 11h1v1h-1zM0 12h1v1h-1zM15 12h1v1h-1zM0 13h1v1h-1zM15 13h1v1h-1zM0 14h1v1h-1zM15 14h1v1h-1zM0 15h16v1h-16z"/><path fill="#E6FFFC" d="M1 1h14v1h-14zM1 2h1v1h-1zM1 3h1v1h-1zM1 4h1v1h-1zM1 5h1v1h-1zM1 6h1v1h-1zM7 6h1v1h-1zM1 7h1v1h-1zM6 7h2v1h-2zM1 8h1v1h-1zM1 9h1v1h-1zM1 10h1v1h-1zM1 11h1v1h-1zM1 12h1v1h-1zM1 13h1v1h-1zM1 14h1v1h-1z"/><path fill="#8FEDE6" d="M2 2h12v1h-12zM2 3h1v1h-1zM2 4h1v1h-1zM12 4h1v1h-1zM2 5h1v1h-1zM8 5h1v1h-1zM12 5h1v1h-1zM2 6h1v1h-1zM8 6h2v1h-2zM12 6h1v1h-1zM2 7h1v1h-1zM8 7h3v1h-3zM12 7h1v1h-1zM2 8h1v1h-1zM12 8h1v1h-1zM2 9h1v1h-1zM12 9h1v1h-1zM2 10h1v1h-1zM12 10h1v1h-1zM2 11h1v1h-1zM12 11h1v1h-1zM2 12h1v1h-1zM4 12h9v1h-9zM2 13h1v1h-1z"/><path fill="#137A75" d="M14 2h1v1h-1zM14 3h1v1h-1zM7 4h2v1h-2zM14 4h1v1h-1zM9 5h1v1h-1zM14 5h1v1h-1zM5 6h1v1h-1zM10 6h1v1h-1zM14 6h1v1h-1zM4 7h1v1h-1zM11 7h1v1h-1zM14 7h1v1h-1zM4 8h1v1h-1zM11 8h1v1h-1zM14 8h1v1h-1zM5 9h1v1h-1zM10 9h1v1h-1zM14 9h1v1h-1zM6 10h1v1h-1zM9 10h1v1h-1zM14 10h1v1h-1zM7 11h2v1h-2zM14 11h1v1h-1zM14 12h1v1h-1zM14 13h1v1h-1zM2 14h13v1h-13z"/><path fill="#1F9C95" d="M3 3h11v1h-11zM3 4h1v1h-1zM13 4h1v1h-1zM3 5h1v1h-1zM13 5h1v1h-1zM3 6h1v1h-1zM13 6h1v1h-1zM3 7h1v1h-1zM13 7h1v1h-1zM3 8h1v1h-1zM8 8h3v1h-3zM13 8h1v1h-1zM3 9h1v1h-1zM8 9h2v1h-2zM13 9h1v1h-1zM3 10h1v1h-1zM8 10h1v1h-1zM13 10h1v1h-1zM3 11h1v1h-1zM13 11h1v1h-1zM3 12h1v1h-1zM13 12h1v1h-1zM3 13h11v1h-11z"/><path fill="#45CFC8" d="M4 4h3v1h-3zM9 4h3v1h-3zM4 5h2v1h-2zM10 5h2v1h-2zM4 6h1v1h-1zM11 6h1v1h-1zM5 8h3v1h-3zM4 9h1v1h-1zM6 9h2v1h-2zM11 9h1v1h-1zM4 10h2v1h-2zM7 10h1v1h-1zM10 10h2v1h-2zM4 11h3v1h-3zM9 11h3v1h-3z"/><path fill="#FFFFFF" d="M6 5h2v1h-2zM6 6h1v1h-1zM5 7h1v1h-1z"/>';

/** Mineur qui court : deux poses qui alternent (plus vite quand il tape plus vite). */
export function Miner({
  color,
  speed,
  worn = {},
  photoUrl = null,
}: {
  color: string;
  speed: number;
  /** Photo de profil : le mineur est « peint » avec elle. */
  photoUrl?: string | null;
  /** Armure portée par ce joueur (rien pour un invité ou un bot sans équipement). */
  worn?: WornArmor;
}) {
  const photo = usePhotoPixels(photoUrl, 12, 18);
  const style = {
    ...(armorVars(photo?.avg ?? color, worn) as CSSProperties),
    animationDuration: `${speed}s`,
  };
  const skin = (paths: string) =>
    photo
      ? photoSkin(`<svg viewBox="0 0 12 18">${paths}</svg>`, photo).replace(
          /^<svg[^>]*>|<\/svg>$/g,
          "",
        )
      : paths;
  return (
    <>
      <svg
        className="f0"
        viewBox="0 0 12 18"
        shapeRendering="crispEdges"
        style={style}
        dangerouslySetInnerHTML={{ __html: skin(RUN_A) }}
      />
      <svg
        className="f1"
        viewBox="0 0 12 18"
        shapeRendering="crispEdges"
        style={style}
        dangerouslySetInnerHTML={{ __html: skin(RUN_B) }}
      />
    </>
  );
}

export function Diamond() {
  return (
    <svg
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      dangerouslySetInnerHTML={{ __html: DIAMOND }}
    />
  );
}
