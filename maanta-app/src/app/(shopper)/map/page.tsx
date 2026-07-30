import { redirect } from "next/navigation";

/**
 * `/map` is an alias for Browse map+list (plan: map lives on `/browse`).
 * Preserve deep-link query params from deal detail.
 */
export default function MapRedirectPage({
  searchParams,
}: {
  searchParams?: { lat?: string; lng?: string; dealId?: string };
}) {
  const q = new URLSearchParams();
  if (searchParams?.lat) q.set("lat", searchParams.lat);
  if (searchParams?.lng) q.set("lng", searchParams.lng);
  if (searchParams?.dealId) q.set("dealId", searchParams.dealId);
  const suffix = q.toString();
  redirect(suffix ? `/browse?${suffix}` : "/browse");
}
