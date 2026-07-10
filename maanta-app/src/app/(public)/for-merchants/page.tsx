import { ButtonLink } from "@/components/ui/button";

/** 12d For merchants. */
export default function ForMerchantsPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-14">
      <h1 className="text-3xl font-black text-ink">Pay only for verified redemptions</h1>
      <p className="mt-3 text-sm text-muted">
        No listing fees, no percentage cut. A KES 30 success fee is charged only when a
        customer&apos;s code is verified at your counter.
      </p>
      <div className="mt-8 flex h-72 items-center justify-center rounded-2xl border-2 border-dashed border-ink/20 bg-cream text-xs text-faint">
        dashboard screenshot
      </div>
      <div className="mt-8">
        <ButtonLink href="/merchants" variant="secondary">
          List your shop
        </ButtonLink>
      </div>
    </main>
  );
}
