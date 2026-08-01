import { AppProviders } from "@/components/auth/app-providers";

/**
 * Clerk-hosted sign-up. Renders `ClerkAuthShell`, which uses Clerk client components.
 *
 * Exists to mount `AppProviders`. Clerk moved out of the root layout so marketing
 * pages do not ship the auth SDK; every route that authenticates therefore needs
 * a shell that puts it back.
 */
export default function SignUpLayout({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}
