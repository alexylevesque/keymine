import { z } from "zod";
import { kysely as db } from "@/lib/db";

// Sert la photo de profil téléversée (WebP 256 px). L'URL porte la date de mise
// à jour (?v=) : le navigateur peut donc la garder en cache sans risque.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) return new Response(null, { status: 404 });
  const user = await db.selectFrom("users").select("avatar_data").where("id", "=", id.data).executeTakeFirst();
  if (!user?.avatar_data) return new Response(null, { status: 404 });
  return new Response(new Uint8Array(user.avatar_data), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
