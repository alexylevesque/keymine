"use client";

import { levelFromXp } from "@/lib/xp";
import { useLanguage } from "@/lib/i18n";
import { formatNumber } from "@/lib/format";

/**
 * Barre d'expérience façon Minecraft : niveau en chiffres verts au-dessus, barre verte en segments.
 * `size="sm"` dans l'en-tête, `size="lg"` sur le profil.
 */
export function XpBar({
  totalXp,
  size = "sm",
  className = "",
}: {
  totalXp: number;
  /** sm : petite barre (en-tête, petit écran) ; strip : bande pleine largeur sous l'en-tête ; lg : profil. */
  size?: "sm" | "strip" | "lg";
  className?: string;
}) {
  const { t, lang } = useLanguage();
  const { level, intoLevel, needed, fraction } = levelFromXp(totalXp);
  const label = t("xp.aria", { level, into: intoLevel, needed });
  return (
    <div className={`pixel-xp ${className}`} data-size={size} data-testid="xp-bar">
      <span className="pixel-xp-level" aria-hidden="true">
        {formatNumber(lang, level)}
      </span>
      <div
        className="pixel-xp-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={needed}
        aria-valuenow={intoLevel}
        aria-valuetext={label}
      >
        <div className="pixel-xp-fill" style={{ width: `${Math.round(fraction * 1000) / 10}%` }} />
      </div>
      {size === "lg" && (
        <p className="pixel-xp-caption">
          {t("xp.caption", { level: formatNumber(lang, level), into: formatNumber(lang, intoLevel), needed: formatNumber(lang, needed) })}
        </p>
      )}
    </div>
  );
}
