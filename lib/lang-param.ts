import { z } from "zod";

/** Paramètre « ?lang= » d'une adresse (liens hreflang de l'accueil) : seulement fr ou en (TECH-07). */
export const langParam = z.enum(["fr", "en"]);
