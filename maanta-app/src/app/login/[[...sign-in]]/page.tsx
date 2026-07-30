import { ClerkAuthShell } from "@/components/clerk-auth-shell";
import { SupabaseEmailLogin } from "@/components/auth/supabase-email-login";
import { isClerkAuth } from "@/lib/auth/strategy";

export const dynamic = "force-dynamic";

// After sign-in, Clerk (and Supabase email OTP) should land on /app-bootstrap
// so role routing picks feed / merchant / admin / agent. See docs/ops/pwa-install.md.
export default function LoginPage() {
  if (isClerkAuth()) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-mobile flex-col items-center justify-center bg-stone px-5 py-14">
        <ClerkAuthShell mode="sign-in" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-mobile flex-col items-center justify-center bg-stone px-5 py-14">
      <SupabaseEmailLogin mode="sign-in" />
    </main>
  );
}
