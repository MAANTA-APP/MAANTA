import { IconAlert } from "@/components/ui/icons";

export function AdminReadError({
  what,
  sub = "This is a read error, not an empty result. Reload the page; if it keeps failing, investigate before acting on the apparent zero.",
}: {
  what: string;
  sub?: string;
}) {
  return (
    <div role="alert" className="rounded-card bg-white px-4 py-6 shadow-card">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
        <IconAlert aria-hidden className="h-4 w-4 shrink-0 text-flame" />
        Could not load {what}.
      </p>
      <p className="mt-1 text-xs text-muted">{sub}</p>
    </div>
  );
}
