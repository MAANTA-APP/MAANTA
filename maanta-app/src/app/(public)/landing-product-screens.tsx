import Link from "next/link";
import { Logomark } from "@/components/ui/icons";

/** Stylized product mockups for the public landing page (not live screenshots). */
export function LandingProductScreens() {
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <ScreenMock
        title="Live deal feed"
        caption="Flash picks and standard deals at your mall"
        variant="feed"
      />
      <ScreenMock
        title="Browse & filter"
        caption="Search, sort, and filter by Flash or favourites"
        variant="browse"
      />
      <ScreenMock
        title="Claim & redeem"
        caption="Get a 6-digit code and show it at the counter"
        variant="claim"
      />
      <ScreenMock
        title="Save on every visit"
        caption="Verified redemptions — real savings in person"
        variant="benefit"
      />
    </div>
  );
}

function ScreenMock({
  title,
  caption,
  variant,
}: {
  title: string;
  caption: string;
  variant: "feed" | "browse" | "claim" | "benefit";
}) {
  return (
    <figure className="overflow-hidden rounded-card border border-line bg-white shadow-card">
      <div className="border-b border-line bg-stone px-4 py-3">
        <div className="flex items-center gap-2">
          <Logomark className="h-5 w-5" />
          <span className="text-xs font-semibold text-ink">Maanta</span>
        </div>
      </div>
      <div className="bg-paper p-4">
        {variant === "feed" ? <FeedMock /> : null}
        {variant === "browse" ? <BrowseMock /> : null}
        {variant === "claim" ? <ClaimMock /> : null}
        {variant === "benefit" ? <BenefitMock /> : null}
      </div>
      <figcaption className="border-t border-line px-4 py-3">
        <p className="text-sm font-semibold text-ink">{title}</p>
        <p className="mt-0.5 text-xs text-muted">{caption}</p>
      </figcaption>
    </figure>
  );
}

function FeedMock() {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <span className="rounded-full bg-brand px-2.5 py-1 text-[10px] font-bold text-black">FLASH</span>
        <span className="rounded-full bg-stone-soft px-2.5 py-1 text-[10px] font-semibold text-ink">Near you</span>
      </div>
      <div className="overflow-hidden rounded-xl border border-line bg-white">
        <div className="h-20 bg-gradient-to-br from-brand/40 to-verified/20" />
        <div className="space-y-1 p-3">
          <p className="text-[10px] text-muted">Habibi Grill · Floor 1</p>
          <p className="text-sm font-bold text-ink">Lunch tray — 30% off</p>
          <p className="text-xs font-bold text-ink">You pay KES 350</p>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-line bg-white opacity-80">
        <div className="h-16 bg-gradient-to-br from-stone-soft to-stone" />
        <div className="p-3">
          <p className="text-sm font-bold text-ink">Weekend fashion bundle</p>
        </div>
      </div>
    </div>
  );
}

function BrowseMock() {
  return (
    <div className="space-y-3">
      <div className="rounded-full border border-line bg-white px-3 py-2 text-xs text-muted">
        Search deals or shops…
      </div>
      <div className="flex flex-wrap gap-1.5">
        {["Expiring soon", "Flash", "Favourites"].map((chip) => (
          <span
            key={chip}
            className="rounded-full border border-line bg-white px-2.5 py-1 text-[10px] font-semibold text-ink"
          >
            {chip}
          </span>
        ))}
      </div>
      <div className="space-y-2">
        {["Metro Gadgets", "Bloom Beauty", "Corner Deli"].map((name) => (
          <div
            key={name}
            className="flex items-center gap-2 rounded-lg border border-line bg-white p-2"
          >
            <div className="h-8 w-8 rounded-lg bg-stone-soft" />
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-ink">{name}</p>
              <p className="text-[10px] text-muted">BBS Mall · live deal</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClaimMock() {
  return (
    <div className="rounded-2xl border-[2.5px] border-brand bg-white p-4 text-center">
      <p className="text-[10px] text-muted">Habibi Grill · Floor 1</p>
      <p className="font-code mt-2 text-3xl font-medium tracking-[0.14em] text-ink">
        4 8 2 9 1 6
      </p>
      <p className="mt-2 text-xs font-semibold text-rust">Expires in 2h 14m</p>
      <p className="mt-3 text-[10px] text-muted">Show this code at the counter</p>
    </div>
  );
}

function BenefitMock() {
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-line bg-white p-3">
        <p className="text-xs font-semibold text-verified">✓ Verified redemption</p>
        <p className="mt-1 text-sm font-bold text-ink">You saved KES 150</p>
        <p className="mt-0.5 text-[10px] text-muted">Paid in person at the till</p>
      </div>
      <div className="rounded-xl border border-line bg-white p-3">
        <p className="text-xs text-muted">My deals</p>
        <p className="text-sm font-bold text-ink">3 active codes</p>
      </div>
      <Link
        href="/feed"
        className="block rounded-full bg-brand py-2.5 text-center text-xs font-bold text-black"
      >
        Browse live deals
      </Link>
    </div>
  );
}
