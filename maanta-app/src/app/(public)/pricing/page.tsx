/** 12e Pricing — Standard vs Elite (numbers match the live DB config). */
export default function PricingPage() {
  return (
    <main className="mx-auto max-w-4xl px-5 py-14">
      <h1 className="text-center text-3xl font-black text-ink">Simple pricing</h1>
      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        <div className="rounded-card border border-line bg-white p-6">
          <h2 className="text-lg font-bold text-ink">Standard</h2>
          <p className="mt-2 text-sm text-muted">
            1 standard deal · KES 30 success fee per verified redemption
          </p>
          <p className="mt-6 text-3xl font-black text-ink">Free</p>
          <p className="mt-1 text-xs text-faint">pay only when a redemption is verified</p>
        </div>
        <div className="rounded-card border-[3px] border-ink bg-ink p-6">
          <h2 className="text-lg font-bold text-brand">Elite</h2>
          <p className="mt-2 text-sm text-white/70">
            KES 3,500/mo + KES 30/redemption · 2 active deals · flash deals · boosts
          </p>
          <p className="mt-6 text-3xl font-black text-white">KES 3,500</p>
          <p className="mt-1 text-xs text-white/50">per month</p>
        </div>
      </div>
      <p className="mt-8 rounded-full bg-brand-tint px-5 py-3 text-center text-sm font-semibold text-ink">
        Launch offer: first month of Elite free
      </p>
    </main>
  );
}
