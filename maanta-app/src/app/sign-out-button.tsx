"use client";

import { useId, useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isClerkAuthClient } from "@/lib/auth/strategy-client";
import { cn } from "@/lib/ui";
import {
  signOutWithClerk,
  signOutWithSupabase,
  type SignOutResult,
} from "@/lib/auth/sign-out";

/**
 * The one sign-out control, on every shell.
 *
 * Strategy-aware: `useClerk().signOut` under Clerk (production), the Supabase
 * client otherwise (CI, and any checkout with no auth env). The provider
 * calls and their result contract live in `@/lib/auth/sign-out`; this file
 * is the wiring — a button, a pending state, and an error line that appears
 * only when the provider refused, so the control never claims a session ended
 * when it did not.
 *
 * `className` replaces the default look for shells whose ground is not
 * white: the admin sidebar is ink, and the default `text-ink` label would be
 * invisible there. It replaces rather than appends so a caller cannot end up
 * with two colour tokens fighting. `messageClassName` does the same for the
 * failure line, which otherwise inherits the page's body colour — on the
 * sidebar that is ink on ink. Shopper and merchant callers pass nothing and
 * render exactly what they did before.
 */
export const SIGN_OUT_LABEL = "Sign out";

const DEFAULT_CLASS = "text-sm font-semibold text-ink underline-offset-2 hover:underline";

type Props = { className?: string; messageClassName?: string };

function ClerkSignOutButton(props: Props) {
  const { signOut } = useClerk();
  return <SignOutControl {...props} run={() => signOutWithClerk((opts) => signOut(opts))} />;
}

function SupabaseSignOutButton(props: Props) {
  const router = useRouter();
  return (
    <SignOutControl {...props} run={() => signOutWithSupabase(createClient().auth, router)} />
  );
}

function SignOutControl({
  className,
  messageClassName,
  run,
}: Props & { run: () => Promise<SignOutResult> }) {
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // The admin `nav` renders twice while the drawer is open, so the alert id
  // is per instance rather than a fixed string.
  const failureId = useId();

  const onClick = async () => {
    if (pending) return;
    setPending(true);
    setFailure(null);
    const result = await run();
    // On success the page is leaving; only a refusal needs the button back.
    if (!result.ok) {
      setFailure(result.message);
      setPending(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-busy={pending || undefined}
        aria-describedby={failure ? failureId : undefined}
        className={cn(className ?? DEFAULT_CLASS, pending && "opacity-60")}
      >
        {pending ? "Signing out…" : SIGN_OUT_LABEL}
      </button>
      {/* Failure is a sentence in body ink, never red (frozen UI rule 4):
          the words carry the state, and `role="alert"` reads them out. */}
      {failure ? (
        <p
          id={failureId}
          role="alert"
          className={cn("mt-1 text-xs font-medium", messageClassName ?? "text-ink")}
        >
          {failure}
        </p>
      ) : null}
    </div>
  );
}

export default function SignOutButton(props: Props) {
  return isClerkAuthClient() ? <ClerkSignOutButton {...props} /> : <SupabaseSignOutButton {...props} />;
}
