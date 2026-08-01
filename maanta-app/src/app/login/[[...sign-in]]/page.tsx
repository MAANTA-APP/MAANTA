import { ClerkAuthShell } from "@/components/clerk-auth-shell";
import { SupabaseEmailLogin } from "@/components/auth/supabase-email-login";
import { AuthChrome } from "@/components/auth/auth-chrome";
import { isClerkAuth } from "@/lib/auth/strategy";

export const dynamic = "force-dynamic";

// After sign-in, Clerk (and Supabase email OTP) should land on /app-bootstrap
// so role routing picks feed / merchant / admin / agent. See docs/ops/pwa-install.md.
export default function LoginPage() {
  if (isClerkAuth()) {
    return (
      <AuthChrome>
        <ClerkAuthShell mode="sign-in" />
      </AuthChrome>
    );
  }

  return (
    <AuthChrome>
      <SupabaseEmailLogin mode="sign-in" />
    </AuthChrome>
  );
}
