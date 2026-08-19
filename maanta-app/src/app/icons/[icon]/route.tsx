import { ImageResponse } from "next/og";
import { markDataUri, MARK_COLORS } from "@/lib/brand/mark";
import { APP_ICON_NAMES, findAppIcon } from "@/lib/brand/app-icons";

/**
 * Raster app icons for the web manifest — drift **D93**.
 *
 * `public/` held `icon.svg` and `icon-maskable.svg` and no raster at all, so an
 * install target that will not take SVG had nothing to use. These are the 192
 * and 512 PNGs Android asks for, in both purposes.
 *
 * **Generated rather than committed**, for the reason `src/app/apple-icon.tsx`
 * already states: the geometry lives in `@/lib/brand/mark`, so replacing the
 * artwork is one edit and every icon follows, whereas a committed binary is a
 * second copy that nothing checks. That is also a correction to
 * `scripts/write-brand-icons.mjs`, whose docblock says the manifest icons must
 * be static files "because the web manifest has to reference them by stable URL,
 * which a generated Next route cannot give". True of the *metadata file
 * conventions*, which hash their URLs; not true of a route handler, which serves
 * at exactly its path. The two SVGs stay committed — they are referenced by
 * `brand-icons.test.ts` byte-for-byte and that guard is worth keeping.
 *
 * **Which artwork.** The previous shield from `mark.ts`, not the newly supplied
 * `public/brand/maanta-icon.png`. **D114** is explicit that the supplied icon
 * waits for a square opaque export — its rounding is baked in as transparency
 * and it is 234×234 — and the founder instruction was to wire the lockups and
 * wait on the icon. Rasterising the mark that already ships as the manifest icon
 * changes the format, not the brand, so it does not pre-empt that decision.
 */

export const dynamic = "force-static";
/** Unknown segments 404 at build time rather than being generated on demand. */
export const dynamicParams = false;

export function generateStaticParams() {
  return APP_ICON_NAMES.map((icon) => ({ icon }));
}

export function GET(_request: Request, { params }: { params: { icon: string } }) {
  const spec = findAppIcon(params.icon);
  if (!spec) return new Response("Not found", { status: 404 });

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          // The mark's own badge fills the square; this stops a transparent
          // hairline showing through if the SVG is rasterised a pixel short.
          background: MARK_COLORS.badge,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={markDataUri({ safeAreaScale: spec.safeAreaScale })}
          alt=""
          width={spec.size}
          height={spec.size}
        />
      </div>
    ),
    { width: spec.size, height: spec.size }
  );
}
