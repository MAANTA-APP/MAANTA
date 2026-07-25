import Link from "next/link";
import { ClerkFailed, ClerkLoading, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { ButtonLink } from "@/components/ui/button";
import { Logomark } from "@/components/ui/icons";

/** Guest auth controls — plain links so navigation works before Clerk JS loads. */
function AuthNavLinks() {
  return (
    <>
      <Link
        href="/login"
        className="text-sm font-semibold text-ink underline-offset-2 hover:underline"
      >
        Sign in
      </Link>
      <ButtonLink href="/sign-up" size="sm">
        Sign up
      </ButtonLink>
    </>
  );
}

/** 5f Public top nav — MAANTA · How it works · Pricing · FAQ · [auth controls]. */
export function PublicNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
        <Link href="/" className="flex items-center gap-2">
          <Logomark className="h-7 w-7" />
          <span className="text-lg font-black tracking-tight text-ink">MAANTA</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm font-medium text-muted sm:flex">
          <Link href="/how-it-works" className="hover:text-ink">
            How it works
          </Link>
          <Link href="/pricing" className="hover:text-ink">
            Pricing
          </Link>
          <Link href="/faq" className="hover:text-ink">
            FAQ
          </Link>
        </nav>
        <div className="flex items-center gap-3">
          {/* Plain links while Clerk initializes or if its script fails — SignInButton
              required Clerk JS and silently no-oped when blocked. */}
          <ClerkLoading>
            <AuthNavLinks />
          </ClerkLoading>
          <ClerkFailed>
            <AuthNavLinks />
          </ClerkFailed>
          <SignedOut>
            <AuthNavLinks />
          </SignedOut>
          <SignedIn>
            <ButtonLink href="/feed" size="sm">
              My feed
            </ButtonLink>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
        </div>
      </div>
    </header>
  );
}

/** 5g Public footer — black strip. */
export function PublicFooter() {
  return (
    <footer className="mt-auto bg-ink">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-6 text-sm text-white/80">
        <span>© Maanta</span>
        <nav className="flex gap-6">
          <Link href="/privacy" className="hover:text-white">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-white">
            Terms
          </Link>
          <Link href="/contact" className="hover:text-white">
            Contact
          </Link>
        </nav>
      </div>
    </footer>
  );
}
