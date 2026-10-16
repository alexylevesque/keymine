import { LeaderboardScreen } from "@/components/leaderboard/LeaderboardScreen";
import { PixelShell } from "@/components/PixelShell";
import { peekIdentity } from "@/lib/auth/identity";
import { loadLeaderboardView } from "@/lib/leaderboard-view";
import { getRequestLang, pageMetadata } from "@/lib/i18n-server";
import { translate } from "@/lib/i18n-dictionary";

export const dynamic = "force-dynamic";
export const generateMetadata = pageMetadata("title.leaderboard");

// Classement (fonctionnalité ajoutée) : ouvert à tous ; les invités voient le classement sans classe.
export default async function ClassementPage() {
  const lang = await getRequestLang();
  const identity = await peekIdentity();
  const view = await loadLeaderboardView(identity?.kind === "user" ? identity.userId : null, null);
  return (
    <PixelShell active="classement">
      <h1 className="font-pixel mb-6 text-xl text-white [text-shadow:4px_4px_0_#000]">
        {translate(lang, "lb.title")}
      </h1>
      <LeaderboardScreen initial={view} />
    </PixelShell>
  );
}
