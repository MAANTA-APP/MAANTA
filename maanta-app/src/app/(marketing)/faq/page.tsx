/** 12f FAQ. */
const FAQS = [
  {
    q: "What is a success fee?",
    a: "Merchants pay KES 30 only when a customer's code is verified in-store. Expired or rejected codes cost nothing — there are no listing fees or commissions.",
  },
  {
    q: "What's the grace period?",
    a: "A claimed code stays valid until the deal expires, plus a 15-minute grace period so you have time to reach the counter.",
  },
  {
    q: "Which malls are live?",
    a: "BBS Mall, Eastleigh (Nairobi) is the launch node. More malls are coming soon.",
  },
  {
    q: "Do I need to download an app?",
    a: "No — Maanta runs in your browser. For a faster home-screen experience, open /download and follow Install (or Add to Home Screen) tips.",
  },
];

export default function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <h1 className="text-3xl font-black text-ink">FAQ</h1>
      <div className="mt-8 space-y-3">
        {FAQS.map((f) => (
          <details key={f.q} className="group rounded-card border border-line bg-white px-5 py-4">
            <summary className="flex cursor-pointer items-center justify-between text-sm font-semibold text-ink">
              {f.q}
              <span className="text-lg text-faint group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 text-sm text-muted">{f.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
