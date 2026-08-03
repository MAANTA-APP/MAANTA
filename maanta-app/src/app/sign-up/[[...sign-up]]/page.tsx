import { ClerkAuthShell } from "@/components/clerk-auth-shell";
import { SupabaseEmailLogin } from "@/components/auth/supabase-email-login";
import { AuthChrome } from "@/components/auth/auth-chrome";
import { authModeLoginHint, isClerkAuth } from "@/lib/auth/strategy";

export const dynamic = "force-dynamic";

export default function SignUpPage() {
  if (isClerkAuth()) {
    return (
      <AuthChrome>
        <ClerkAuthShell mode="sign-up" />
      </AuthChrome>
    );
  }

  return (
    <AuthChrome>
      <SupabaseEmailLogin mode="sign-up" loginHint={authModeLoginHint()} />
    </AuthChrome>
  );
}
