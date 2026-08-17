import { NextResponse } from "next/server";
import { ensureAppUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import {
  contentTypeForImage,
  detectImageType,
  fileExtensionForImage,
} from "@/lib/image-bytes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 1_048_576;

/** POST /api/profile/avatar — shopper photo → avatars/users/<id>/profile.<ext> */
export async function POST(request: Request) {
  const appUser = await ensureAppUser<{ id: string; avatar_url: string | null }>(
    "id, avatar_url"
  );
  if (!appUser) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a photo to upload." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Keep photos under 1 MB." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = detectImageType(bytes);
  if (!detected) {
    return NextResponse.json(
      { error: "Photo must be a JPEG, PNG or WebP image." },
      { status: 400 }
    );
  }

  const service = createServiceClient();
  const ext = fileExtensionForImage(detected);
  const path = `users/${appUser.id}/profile.${ext}`;
  const { error: uploadError } = await service.storage.from("avatars").upload(path, bytes, {
    contentType: contentTypeForImage(detected),
    upsert: true,
  });
  if (uploadError) {
    console.error("avatar upload failed:", uploadError);
    return NextResponse.json(
      { error: "Could not upload the photo. Please try again." },
      { status: 502 }
    );
  }

  const {
    data: { publicUrl },
  } = service.storage.from("avatars").getPublicUrl(path);
  // Cache-bust so clients replace the previous object at the same path.
  const avatarUrl = `${publicUrl}?v=${Date.now()}`;

  const { error } = await service
    .from("users")
    .update({ avatar_url: avatarUrl })
    .eq("id", appUser.id);
  if (error) {
    // Column may be missing pre-migration — still return the URL for this session.
    if (!/avatar_url|schema cache|does not exist/i.test(error.message ?? "")) {
      return NextResponse.json({ error: "Could not save photo." }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, avatarUrl });
}
