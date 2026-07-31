/** 12l About / mission. */
export default function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-14">
      <h1 className="text-3xl font-black text-ink">The mall, made live.</h1>
      <p className="mt-4 text-base text-muted">
        Maanta puts every live deal in a mall on one screen — discovered in seconds,
        claimed with a code, redeemed at the counter. Merchants pay only when a
        redemption is verified.
      </p>
      <ul className="mt-8 space-y-3 text-sm font-semibold text-ink">
        <li>— Built for Kenyan malls, starting in Eastleigh</li>
        <li>— Ranked by verified redemptions, never stars</li>
        <li>— No listing fees, just a KES 30 success fee</li>
      </ul>
    </main>
  );
}
