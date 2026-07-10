import { ButtonLink } from "@/components/ui/button";

/** 12b How it works — For shoppers / For merchants. */
export default function HowItWorksPage() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-14">
      <h1 className="text-3xl font-black text-ink">How it works</h1>
      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        <div className="rounded-card border border-line bg-white p-6">
          <h2 className="text-lg font-bold text-ink">For shoppers</h2>
          <ol className="mt-4 space-y-3 text-sm text-muted">
            <li>1. Browse live deals at your mall</li>
            <li>2. Claim a deal — you get a 6-digit code instantly</li>
            <li>3. Show the code at the counter before it expires (+15 min grace)</li>
          </ol>
          <ButtonLink href="/for-shoppers" variant="ghost" size="sm" className="mt-5">
            Learn more
          </ButtonLink>
        </div>
        <div className="rounded-card border border-line bg-white p-6">
          <h2 className="text-lg font-bold text-ink">For merchants</h2>
          <ol className="mt-4 space-y-3 text-sm text-muted">
            <li>1. List your shop with its exact what3words location</li>
            <li>2. Publish a deal — live in the feed immediately</li>
            <li>3. Verify codes at the counter · pay KES 30 only per verified redemption</li>
          </ol>
          <ButtonLink href="/for-merchants" variant="ghost" size="sm" className="mt-5">
            Learn more
          </ButtonLink>
        </div>
      </div>
    </main>
  );
}
