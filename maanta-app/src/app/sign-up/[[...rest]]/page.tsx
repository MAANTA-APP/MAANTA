import { SignUp } from "@clerk/nextjs";

// Sign-up counterpart to /login. Clerk links between the two automatically;
// NEXT_PUBLIC_CLERK_SIGN_UP_URL points here so those links resolve.
export default function SignUpPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-mobile flex-col items-center justify-center bg-paper px-5 py-14">
      <SignUp
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
