/**
 * 12h Privacy Policy — placeholder shell as wireframed.
 * The drafts in maanta-app/legal/ are explicitly NOT for publication;
 * final text lands here after legal review.
 */
export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-14">
      <h1 className="text-3xl font-black text-ink">Privacy Policy</h1>
      <div className="mt-8 space-y-3">
        <div className="h-3 w-3/4 rounded-full bg-cream" />
        <div className="h-3 w-full rounded-full bg-cream" />
        <div className="h-3 w-5/6 rounded-full bg-cream" />
        <div className="h-3 w-2/3 rounded-full bg-cream" />
      </div>
      <p className="mt-10 text-sm text-muted">
        Our full privacy policy is being finalised ahead of launch. Questions in the
        meantime? <a href="/contact" className="underline">Contact us</a>.
      </p>
    </main>
  );
}
