"use client";

import { useEffect, useState } from "react";

// « Peau photo » des bonshommes pixel : la photo de profil est réduite à la taille du personnage
// (centrée, rognée), puis chaque case de peau ou de vêtement prend la couleur du point de la photo
// au même endroit. Les cases claires (--l) et foncées (--d) gardent leur relief.

export type PhotoPixels = { w: number; h: number; data: Uint8ClampedArray; avg: string };

const cache = new Map<string, Promise<PhotoPixels | null>>();

const hex = (r: number, g: number, b: number) =>
  `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;

/** Lit la photo dans un petit canevas de w × h points (null si la photo ne se charge pas). */
export function loadPhotoPixels(url: string, w: number, h: number): Promise<PhotoPixels | null> {
  const key = `${url}|${w}x${h}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const job = new Promise<PhotoPixels | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        // Recadrage « cover » : la photo remplit tout le personnage.
        const scale = Math.max(w / img.width, h / img.height);
        const sw = w / scale;
        const sh = h / scale;
        ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        let r = 0;
        let g = 0;
        let b = 0;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i]!;
          g += data[i + 1]!;
          b += data[i + 2]!;
        }
        const n = data.length / 4;
        resolve({ w, h, data, avg: hex(Math.round(r / n), Math.round(g / n), Math.round(b / n)) });
      } catch {
        resolve(null); // image d'une autre origine sans autorisation : on garde la couleur unie
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
  cache.set(key, job);
  return job;
}

/** Hook : les points de la photo, ou null tant qu'ils ne sont pas prêts (ou pas de photo). */
export function usePhotoPixels(url: string | null | undefined, w: number, h: number) {
  const [pixels, setPixels] = useState<PhotoPixels | null>(null);
  useEffect(() => {
    let alive = true;
    if (!url) return;
    void loadPhotoPixels(url, w, h).then((p) => alive && setPixels(p));
    return () => {
      alive = false;
    };
  }, [url, w, h]);
  return url ? pixels : null;
}

const TONE: Record<string, number> = { m: 0, l: 0.18, d: -0.3 };

function tone(r: number, g: number, b: number, amount: number): string {
  const f = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v + amount * (amount > 0 ? 255 - v : v))));
  return hex(f(r), f(g), f(b));
}

/**
 * Remplace, dans un dessin SVG (chemins de rectangles), les cases de couleur --m/--l/--d par la
 * couleur de la photo au même endroit. Les dessins d'une autre taille (ordinateur…) ne changent pas.
 */
export function photoSkin(markup: string, p: PhotoPixels): string {
  return markup.replace(
    /<svg[^>]*viewBox="0 0 (\d+) (\d+)"[^>]*>[\s\S]*?<\/svg>/g,
    (svg, vw, vh) => {
      if (Number(vw) !== p.w || Number(vh) !== p.h) return svg;
      return svg.replace(
        /<path fill="var\(--([mld])\)" d="([^"]+)"\/>/g,
        (_all, key: string, d: string) => {
          let out = "";
          for (const [, xs, ys, ws, hs] of d.matchAll(/M(\d+) (\d+)h(\d+)v(\d+)/g)) {
            const x0 = Number(xs);
            const y0 = Number(ys);
            for (let y = y0; y < y0 + Number(hs); y++) {
              for (let x = x0; x < x0 + Number(ws); x++) {
                const i = (Math.min(p.h - 1, y) * p.w + Math.min(p.w - 1, x)) * 4;
                const fill = tone(p.data[i]!, p.data[i + 1]!, p.data[i + 2]!, TONE[key] ?? 0);
                out += `<path fill="${fill}" d="M${x} ${y}h1v1h-1z"/>`;
              }
            }
          }
          return out;
        },
      );
    },
  );
}
