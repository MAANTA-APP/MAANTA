import { ClerkAuthShell } from "@/components/clerk-auth-shell";
import { SupabaseEmailLogin } from "@/components/auth/supabase-email-login";
import { isClerkAuth } from "@/lib/auth/strategy";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-mobile flex-col items-center justify-center bg-stone px-5 py-14">
      {isClerkAuth() ? (
        <ClerkAuthShell mode="sign-in" />
      ) : (
        <SupabaseEmailLogin mode="sign-in" />
      )}
    </main>
  );
}
