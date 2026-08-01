import { ClerkAuthShell } from "@/components/clerk-auth-shell";
import { SupabaseEmailLogin } from "@/components/auth/supabase-email-login";
import { Logomark } from "@/components/ui/icons";
import { isClerkAuth } from "@/lib/auth/strategy";

export const dynamic = "force-dynamic";

/**
 * Brand chrome above whichever auth form the strategy selects.
 *
 * Sign-in is reached from an email link, a push notification and a bare /login
 * URL, so it is frequently the first MAANTA surface someone sees — an
 * unlabelled input box on a grey field gives them nothing to recognise.
 *
 * Factored out rather than written into each branch: the two strategies must
 * look identical, and duplicated chrome is how a change to one path silently
 * fails to reach the other until MAANTA_AUTH_STRATEGY is flipped in production.
 *
 * No amber. The accent belongs on the submit action inside the form, and a
 * logomark competing with it would spend it twice.
 */
function LoginChrome({ children }: { children: React.ReactNode }) {
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

// After sign-in, Clerk (and Supabase email OTP) should land on /app-bootstrap
// so role routing picks feed / merchant / admin / agent. See docs/ops/pwa-install.md.
export default function LoginPage() {
  if (isClerkAuth()) {
    return (
      <LoginChrome>
        <ClerkAuthShell mode="sign-in" />
      </LoginChrome>
    );
  }

  return (
    <LoginChrome>
      <SupabaseEmailLogin mode="sign-in" />
    </LoginChrome>
  );
}
