import { SignIn } from "@clerk/nextjs";

// Clerk-hosted sign-in mounted on a catch-all so it can own its sub-routes
// (verification, SSO callback, factor-two). Enabled methods — phone OTP and
// email — are configured in the Clerk dashboard, matching the prior flow.
// After sign-in Clerk redirects to the fallback URL
// (NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL, set to /select-mall).
export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-mobile flex-col items-center justify-center bg-paper px-5 py-14">
      <SignIn
        appearance={{
          elements: {
            rootBox: "w-full",
            card: "shadow-none border border-line rounded-2xl",
          },
        }}
      />
    </main>
  );
}
