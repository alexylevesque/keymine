"use client";

import { useRouter } from "next/navigation";
import { useLanguage } from "@/lib/i18n";

export function LogoutButton() {
  const router = useRouter();
  const { t } = useLanguage();
  async function onClick() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      className="room-close font-pixel flex items-center gap-2.5"
    >
      {/* Petite porte pixel (dessin original). */}
      <svg width="14" height="16" viewBox="0 0 7 8" shapeRendering="crispEdges" aria-hidden="true">
        <path
          fill="currentColor"
          d="M0 0h5v1h-5zM0 1h1v7h-1zM4 1h1v2h-1zM4 5h1v3h-1zM1 7h3v1h-3zM5 3h1v2h-1zM6 4h1v1h-1zM3 4h2v1h-2z"
        />
      </svg>
      {t("profile.logout")}
    </button>
  );
}
