/**
 * The one permission notice a staff member sees when they deep-link into a
 * merchant surface their owner hasn't enabled. Nav entry points for these
 * surfaces are hidden (see `src/lib/merchant-nav.ts`) — this is the backstop
 * for a bookmarked/shared URL, and it names the fix rather than dead-ending.
 */
export function MerchantPermissionDenied({ action }: { action: string }) {
  return (
    <main className="flex flex-col items-center justify-center px-6 py-24 text-center">
      <p className="text-sm font-semibold text-ink">
        You don&apos;t have permission to {action}.
      </p>
      <p className="mt-1 text-xs text-muted">
        Ask the shop owner to enable it in Staff.
      </p>
    </main>
  );
}
