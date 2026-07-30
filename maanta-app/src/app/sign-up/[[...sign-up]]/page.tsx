import { ClerkAuthShell } from "@/components/clerk-auth-shell";
import { SupabaseEmailLogin } from "@/components/auth/supabase-email-login";
import { isClerkAuth } from "@/lib/auth/strategy";

export const dynamic = "force-dynamic";

export default function SignUpPage() {
  if (isClerkAuth()) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-mobile flex-col items-center justify-center bg-stone px-5 py-14">
        <ClerkAuthShell mode="sign-up" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-mobile flex-col items-center justify-center bg-stone px-5 py-14">
      <SupabaseEmailLogin mode="sign-up" />
    </main>
  );
}
