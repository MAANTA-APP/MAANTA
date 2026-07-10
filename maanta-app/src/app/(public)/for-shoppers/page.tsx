import { ButtonLink } from "@/components/ui/button";

/** 12c For shoppers. */
export default function ForShoppersPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-14">
      <h1 className="text-3xl font-black text-ink">Live deals, verified in-store</h1>
      <p className="mt-3 text-sm text-muted">
        Every deal on Maanta is redeemed at the counter with a one-time code — rankings
        come from verified redemptions, never stars.
      </p>
      <div className="mt-8 flex h-72 items-center justify-center rounded-2xl border-2 border-dashed border-ink/20 bg-cream text-xs text-faint">
        app screenshot
      </div>
      <div className="mt-8">
        <ButtonLink href="/feed">Browse deals</ButtonLink>
      </div>
    </main>
  );
}
