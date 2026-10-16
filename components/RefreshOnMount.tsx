"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Recharge les composants serveur une fois à l'arrivée sur la page (sans recharger la page) :
 * l'en-tête affiche alors la nouvelle expérience gagnée pendant la course.
 */
export function RefreshOnMount() {
  const router = useRouter();
  useEffect(() => {
    router.refresh();
  }, [router]);
  return null;
}
