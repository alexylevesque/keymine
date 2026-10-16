import type { BonusRecord } from "@/lib/race/bonus";
import type { RacerView } from "@/lib/race/engine";

// Messages envoyés par le serveur temps réel pendant une course.
export type RacePhase = "countdown" | "racing" | "finished";

export type RaceParticipantView = RacerView & {
  avatarUrl: string | null;
  /** Classe du champion de la semaine passée (couronne), sinon null. */
  champion?: number | null;
};

export type RaceState = {
  phase: RacePhase;
  startsAt: number;
  /** null : course sans temps maximal (CONF-01). */
  endsAt: number | null;
  participants: RaceParticipantView[];
};

export type BonusAnnouncement = { id: number; bonus: BonusRecord; label: string; at: number };
