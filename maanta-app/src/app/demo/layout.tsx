import { AppProviders } from "@/components/auth/app-providers";

/**
 * Rehearsal surface that exercises authenticated flows.
 *
 * Exists to mount `AppProviders`. Clerk moved out of the root layout so marketing
 * pages do not ship the auth SDK; every route that authenticates therefore needs
 * a shell that puts it back.
 */
export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return <AppProviders>{children}</AppProviders>;
}
