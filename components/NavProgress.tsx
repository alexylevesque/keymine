"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Barre dorée en haut de l'écran dès qu'on clique un lien interne : le clic répond tout de
 * suite, même si la page suivante prend un moment à arriver. Elle disparaît à l'arrivée.
 * Les autres composants peuvent aussi l'allumer avec `startNavProgress()`.
 */
export function startNavProgress() {
  window.dispatchEvent(new Event("km-nav-start"));
}

export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<{ on: boolean; at: string }>({ on: false, at: "" });
  const here = `${pathname}?${search.toString()}`;

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement) || a.target === "_blank" || a.hasAttribute("download"))
        return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search)
        return;
      setState({ on: true, at: here });
    }
    function onStart() {
      setState({ on: true, at: here });
    }
    document.addEventListener("click", onClick);
    window.addEventListener("km-nav-start", onStart);
    return () => {
      document.removeEventListener("click", onClick);
      window.removeEventListener("km-nav-start", onStart);
    };
  }, [here]);

  // Sécurité : si la page ne change pas (erreur, même page), la barre s'éteint quand même.
  useEffect(() => {
    if (!state.on) return;
    const id = window.setTimeout(() => setState({ on: false, at: "" }), 12000);
    return () => window.clearTimeout(id);
  }, [state]);

  // Arrivée sur une autre page : la barre s'éteint (comparaison faite au rendu, sans effet).
  const visible = state.on && state.at === here;
  return visible ? <div className="km-navbar" aria-hidden="true" /> : null;
}
