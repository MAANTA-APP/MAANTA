import Image from "next/image";

/**
 * The horizontal brand lockup — mark plus wordmark, as supplied.
 *
 * Replaces the header and footer's `<Logomark/> + <span>MAANTA</span>` pair. The
 * wordmark in the artwork has letterspacing and weight that the text span only
 * approximated, and two elements pretending to be one lockup drift apart the
 * moment either is restyled.
 *
 * ## Accessibility
 *
 * `alt=""`, deliberately. Both call sites wrap this in a `<Link>` that already
 * carries `aria-label="MAANTA home"`, so giving the image its own alt text would
 * make a screen reader announce the brand twice for one link. The link is the
 * thing being navigated to; the image is how it looks.
 *
 * ## Which variant
 *
 * `dark` selects the white-wordmark file, for placing the lockup on a dark
 * surface. Neither marketing shell is dark today — header and footer are both
 * light — so it exists because shipping only half a two-variant asset is how the
 * dark one gets forgotten and someone later renders black text on ink.
 *
 * ## What this does NOT change
 *
 * The favicon, the web-manifest icons and the iOS touch icon still render the
 * *previous* mark from `@/lib/brand/mark`, and so does `Logomark` everywhere else
 * — including the `/download` hero, which sits on the page that asks people to
 * install and therefore ought to match the icon they will actually get. Swapping
 * those needs a full-bleed square export; see `public/brand/README.md` and drift
 * row **D114**. This component deliberately does not paper over that gap.
 */
export function BrandLockup({
  className = "h-8 w-auto",
  dark = false,
  priority = false,
}: {
  className?: string;
  dark?: boolean;
  priority?: boolean;
}) {
  return (
    <Image
      src={
        dark
          ? "/brand/maanta-lockup-horizontal-white.png"
          : "/brand/maanta-lockup-horizontal.png"
      }
      // Intrinsic size of the supplied file. Passing the real dimensions lets
      // Next reserve the right box, so the header does not reflow on load.
      width={996}
      height={244}
      alt=""
      priority={priority}
      className={className}
    />
  );
}
