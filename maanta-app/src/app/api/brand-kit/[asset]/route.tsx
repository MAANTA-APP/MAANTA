import { findKitAsset, kitDealIndex } from "@/lib/marketing/social-kit";

export const runtime = "edge";

/**
 * `GET /api/brand-kit/<asset>[?deal=n]` — one image from the social kit.
 *
 * Public on purpose: these are brand assets, the same class of thing as the
 * per-route OG images, and the founder needs to hand a link to whoever uploads
 * them. `/api/` is already outside the crawl policy. The only variable is a
 * closed index; unknown assets are a 404, and there is no text parameter.
 */
export async function GET(request: Request, { params }: { params: { asset: string } }) {
  const asset = findKitAsset(params.asset);
  if (!asset) return new Response("No such asset.", { status: 404 });

  const url = new URL(request.url);
  const deal = asset.variants ? kitDealIndex(url.searchParams.get("deal"), asset.variants.count) : 0;
  const response = asset.render({ origin: url.origin, host: url.host, deal });
  response.headers.set("Cache-Control", "public, max-age=3600, s-maxage=86400");
  response.headers.set(
    "Content-Disposition",
    `inline; filename="maanta-${asset.id}${asset.variants ? `-${deal}` : ""}.png"`
  );
  return response;
}
