"use client";

// Qui regarde la page : sert à l'en-tête (pseudo, photo, lien vers le profil ou la connexion).
// Calculé côté serveur dans app/layout.tsx ; ne contient rien de secret.
import { createContext, useContext, type ReactNode } from "react";

export type Viewer =
  | { kind: "user"; name: string; avatarUrl: string | null; xp: number }
  | { kind: "guest"; name: string }
  | null;

const ViewerContext = createContext<Viewer>(null);

export function ViewerProvider({ viewer, children }: { viewer: Viewer; children: ReactNode }) {
  return <ViewerContext.Provider value={viewer}>{children}</ViewerContext.Provider>;
}

export function useViewer(): Viewer {
  return useContext(ViewerContext);
}
