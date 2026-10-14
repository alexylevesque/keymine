import { NextResponse } from "next/server";
import { getIdentity } from "@/lib/auth/identity";
import { checkAvatarUpload, processAvatar } from "@/lib/avatar";
import { avatarUploadForm } from "@/lib/api-input";
import { db } from "@/lib/db";
import { msg } from "@/lib/api-messages";

const REFUSALS = {
  too_large: ["too_large", 413],
  empty: ["empty_file", 400],
  bad_type: ["bad_type", 415],
} as const;

// AUTH-04 : téléversement de la photo de profil (comptes seulement, AUTH-03).
export async function POST(request: Request) {
  const identity = await getIdentity();
  if (!identity || identity.kind !== "user") {
    return NextResponse.json({ error: await msg("login_required"), code: "account_required" }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const parsedForm = avatarUploadForm.safeParse({ file: form?.get("file") });
  if (!parsedForm.success) return NextResponse.json({ error: await msg("empty_file"), code: "empty" }, { status: 400 });
  // Refus avant même de lire le corps si la taille annoncée est déjà trop grande.
  const { file } = parsedForm.data;
  if (file.size > 2 * 1024 * 1024) return NextResponse.json({ error: await msg("too_large"), code: "too_large" }, { status: 413 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const check = checkAvatarUpload(bytes);
  if (!check.ok) {
    const [key, status] = REFUSALS[check.reason];
    return NextResponse.json({ error: await msg(key), code: check.reason }, { status });
  }

  let image: Buffer;
  try {
    image = await processAvatar(bytes);
  } catch {
    return NextResponse.json({ error: await msg("bad_image"), code: "bad_image" }, { status: 422 });
  }

  const now = new Date();
  const url = `/api/avatars/${identity.userId}?v=${now.getTime()}`;
  await db
    .updateTable("users")
    .set({ avatar_data: image, avatar_updated_at: now, avatar_url: url, avatar_source: "upload" })
    .where("id", "=", identity.userId)
    .execute();
  return NextResponse.json({ ok: true, avatarUrl: url });
}

// Retire la photo téléversée (retour à l'avatar généré).
export async function DELETE() {
  const identity = await getIdentity();
  if (!identity || identity.kind !== "user") {
    return NextResponse.json({ error: await msg("login_required"), code: "account_required" }, { status: 401 });
  }
  await db
    .updateTable("users")
    .set({ avatar_data: null, avatar_updated_at: null, avatar_url: null })
    .where("id", "=", identity.userId)
    .execute();
  return NextResponse.json({ ok: true });
}
