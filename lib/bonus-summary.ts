import type { BonusKind, BonusRecord } from "@/lib/race/bonus";

/**
 * Bonus reçus par un participant, regroupés par type dans l'ordre de leur première apparition
 * (RES-02) : « Brouillard, +3 mots, Brouillard » devient Brouillard (2) puis +3 mots.
 */
export function groupBonuses(
  bonuses: readonly Pick<BonusRecord, "kind">[],
): { kind: BonusKind; count: number }[] {
  const groups: { kind: BonusKind; count: number }[] = [];
  for (const { kind } of bonuses) {
    const group = groups.find((g) => g.kind === kind);
    if (group) group.count += 1;
    else groups.push({ kind, count: 1 });
  }
  return groups;
}
