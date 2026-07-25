import { ButtonLink } from "@/components/ui/button";
import { InstallPrompt } from "@/components/install-prompt";

/** 12a Public landing — "The mall, made live." */
export default function LandingPage() {
  return (
    <main>
      <section className="bg-ink px-5 py-20 text-center">
        <h1 className="mx-auto max-w-2xl animate-fade-in text-4xl font-black leading-tight text-white sm:text-5xl">
          The mall, made live.
        </h1>
        <p className="mt-3 animate-fade-in text-base text-white/70">Discover, Claim and Redeem.</p>
        <div className="mx-auto mt-10 inline-block animate-fade-in rounded-2xl border-[3px] border-brand bg-ink px-10 py-6">
          <span className="font-code text-4xl font-bold tracking-[0.18em] text-brand sm:text-5xl">
            482 913
          </span>
        </div>
        <div className="mt-10 animate-fade-in">
          <ButtonLink href="/feed" size="lg">
            Get started
          </ButtonLink>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-5 py-14">
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            ["1", "Discover", "Every live deal at your mall on one screen"],
            ["2", "Claim", "Tap a deal, get a 6-digit code instantly"],
            ["3", "Redeem", "Show the code at the counter and save"],
          ].map(([n, title, sub], i) => (
            <div
              key={n}
              className="animate-fade-in rounded-card border border-line bg-white p-5 text-center [animation-fill-mode:both]"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm font-bold text-ink">
                {n}
              </span>
              <h3 className="mt-3 text-base font-bold text-ink">{title}</h3>
              <p className="mt-1 text-sm text-muted">{sub}</p>
            </div>
          ))}
        </div>
        <p className="mt-10 text-center text-sm font-semibold text-ink">
          <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-verified" />
          Now live at BBS Mall, Eastleigh
        </p>
      </section>

      <InstallPrompt />
    </main>
  );
}
