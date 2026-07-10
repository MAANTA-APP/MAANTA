import { ButtonLink } from "@/components/ui/button";

/** 12j 404. */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <h1 className="text-6xl font-black text-ink">404</h1>
      <p className="mt-3 text-sm text-muted">This page wandered off the mall directory</p>
      <ButtonLink href="/" className="mt-8">
        Back to home
      </ButtonLink>
    </main>
  );
}
