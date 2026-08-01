import { Logomark } from "@/components/ui/icons";

/**
 * Brand chrome wrapping whichever auth form the strategy selects, on both
 * `/login` and `/sign-up`.
 *
 * These pages are reached from an email link, a push notification and bare
 * URLs, so they are frequently the first MAANTA surface someone sees — an
 * unlabelled input box on a grey field gives them nothing to recognise.
 *
 * Shared rather than written into each route because there are four places this
 * markup would otherwise live: two routes times two strategy branches. That is
 * how the surfaces drift — a change made on the Supabase path never reaches the
 * Clerk one, and the gap is invisible until MAANTA_AUTH_STRATEGY is flipped in
 * production, on the one screen where a stranger decides whether to trust us.
 *
 * The `<main>` landmark lives here, so the routes must not declare their own.
 *
 * No amber. The accent belongs on the submit action inside the form, and a
 * logomark competing with it would spend it twice.
 */
export function AuthChrome({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-mobile flex-col items-center justify-center bg-stone px-5 py-14">
      <div className="mb-8 flex flex-col items-center text-center">
        <Logomark className="h-10 w-10" />
        <span className="mt-3 text-xl font-black tracking-tight text-ink">MAANTA</span>
        <p className="mt-1.5 text-sm text-muted">The mall, made live.</p>
      </div>
      {children}
    </main>
  );
}
