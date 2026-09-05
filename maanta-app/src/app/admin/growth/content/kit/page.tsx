import Link from "next/link";
import { requireAdminPage } from "@/lib/admin";
import { ROUTES_WITH_OG_IMAGE } from "@/lib/growth/content-health";
import { SOCIAL_KIT, type KitAsset } from "@/lib/marketing/social-kit";
import { CardHeading, GrowthCard, GrowthPageHeader } from "@/components/admin/growth/growth-ui";

export const dynamic = "force-dynamic";

/**
 * The social & OG kit — the spec sheet with rendered examples the founder
 * asked for (board 4, built from the brief; the board itself was never
 * exported). Every card is rendered live from `lib/marketing/social-kit.tsx`,
 * so what is shown here is what a download produces. No file lives in the repo.
 */
export default async function AdminGrowthKitPage() {
  await requireAdminPage();

  return (
    <main className="max-w-6xl">
      <GrowthPageHeader
        title="Social & OG kit"
        subtitle={`${SOCIAL_KIT.length} assets, rendered on request from the same facts and copy as the site · ${ROUTES_WITH_OG_IMAGE.length} per-route OG cards`}
      >
        <Link
          href="/admin/growth/content"
          className="inline-flex h-9 items-center rounded-pill border border-ink bg-white px-4 text-[13px] font-semibold text-ink hover:bg-stone"
        >
          Back to Content &amp; SEO
        </Link>
      </GrowthPageHeader>

      <div className="mt-4 rounded-xl border border-rust bg-white px-4 py-3 text-[13px] leading-relaxed text-ink">
        <strong className="font-bold text-rust">Check the platform&apos;s current dimensions before a mass upload.</strong>{" "}
        These are the published sizes as of 2026-09-05. Platforms change them; the numbers live in
        one file (<code className="font-mono">lib/marketing/social-kit.tsx</code>) when they do. The
        deal templates print “Example — not a real offer” until real deals exist.
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {SOCIAL_KIT.map((asset) => (
          <AssetCard key={asset.id} asset={asset} />
        ))}
      </div>

      <GrowthCard className="mt-5">
        <CardHeading>Per-route OG cards</CardHeading>
        <p className="mb-3 mt-1 text-xs leading-relaxed text-muted">
          Each indexable route renders its own headline through the same template. Open one to
          see exactly what a share of that page shows.
        </p>
        <ul className="flex flex-wrap gap-1.5">
          {ROUTES_WITH_OG_IMAGE.map((route) => (
            <li key={route}>
              <a
                href={`${route === "/" ? "" : route}/opengraph-image`}
                target="_blank"
                rel="noreferrer"
                className="inline-block rounded-md border border-line bg-white px-2 py-1 font-mono text-[11px] text-ink hover:bg-stone"
              >
                {route}
              </a>
            </li>
          ))}
        </ul>
      </GrowthCard>
    </main>
  );
}

function AssetCard({ asset }: { asset: KitAsset }) {
  const src = `/api/brand-kit/${asset.id}`;
  const variants = asset.variants ? Array.from({ length: asset.variants.count }, (_, i) => i) : [0];
  return (
    <GrowthCard>
      <div className="flex items-start justify-between gap-3">
        <div>
          <CardHeading>{asset.name}</CardHeading>
          <p className="mt-0.5 text-xs text-muted">{asset.platform}</p>
        </div>
        <span className="shrink-0 rounded-md bg-stone px-2 py-1 font-mono text-[11px] font-semibold text-secondary">
          {asset.width}×{asset.height}
        </span>
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-line bg-stone">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={`${asset.name}, ${asset.width} by ${asset.height} pixels`}
          width={asset.width}
          height={asset.height}
          loading="lazy"
          className="block h-auto w-full"
          style={{ aspectRatio: `${asset.width} / ${asset.height}` }}
        />
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-ink">{asset.use}</p>

      <dl className="mt-3 flex flex-col gap-1.5 text-xs">
        {asset.safe ? (
          <div className="flex gap-2">
            <dt className="shrink-0 font-semibold text-secondary">Safe area</dt>
            <dd className="text-muted">
              <span className="font-mono text-ink">
                {asset.safe.width}×{asset.safe.height}
              </span>{" "}
              at ({asset.safe.x}, {asset.safe.y}). {asset.safe.why}
            </dd>
          </div>
        ) : (
          <div className="flex gap-2">
            <dt className="shrink-0 font-semibold text-secondary">Safe area</dt>
            <dd className="text-muted">Not cropped; the whole frame shows.</dd>
          </div>
        )}
        {asset.notes.map((n) => (
          <div key={n} className="flex gap-2">
            <dt className="shrink-0 font-semibold text-secondary">Note</dt>
            <dd className="text-muted">{n}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-3.5 flex flex-wrap gap-2">
        {variants.map((i) => {
          const href = asset.variants ? `${src}?${asset.variants.param}=${i}` : src;
          return (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center rounded-pill border border-ink bg-white px-3 text-[12px] font-semibold text-ink hover:bg-stone"
            >
              {asset.variants ? `Open PNG · sample ${i + 1}` : "Open PNG"}
            </a>
          );
        })}
      </div>
    </GrowthCard>
  );
}
