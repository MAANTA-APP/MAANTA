# Brand assets

Source artwork, added 2026-08-17. These are the files the founder supplied — kept
as delivered, not re-exported, so there is always an unmodified original to go
back to.

| File | Size | Use |
|---|---|---|
| `maanta-icon.png` | 234×234 | The mark alone, on the amber badge |
| `maanta-lockup-horizontal.png` | 996×244 | Mark + wordmark, **black** wordmark — light backgrounds |
| `maanta-lockup-horizontal-white.png` | 997×244 | Same, **white** wordmark — dark backgrounds |
| `maanta-lockup-vertical.png` | 644×448 | Mark above wordmark, black — light backgrounds |
| `maanta-lockup-vertical-white.png` | 644×447 | Same, white — dark backgrounds |

All are RGBA with transparency. The badge amber measures **#FDBF2D**, which is
already `brand` in `tailwind.config.ts` — the palette did not change with this
artwork.

## The icon is not yet usable as an app icon, and this is why

`maanta-icon.png` is the right drawing but the wrong *packaging* for a platform
icon, on two counts. Neither is a criticism of the artwork — they are what a
web/app icon pipeline needs that a general-purpose export does not give.

**1. The rounded corners are baked in as transparency.** Decoded, pixel (0,0) is
`(0,0,0,0)` — fully transparent — and the amber only starts a few pixels in. Both
platforms apply *their own* mask: iOS rounds every Home Screen icon into a
squircle, and Android crops maskable icons to roughly the middle 80%. Feeding
them a pre-rounded image means it gets rounded twice, so the corners show the
page or launcher background through a second, wrong-radius cut.

An app icon should be a **full-bleed opaque square** with no rounding of its own.

**2. 234×234 is too small.** Android asks for a 512×512 maskable icon; iOS uses
180×180. 234 downscales to 180 fine and upscales to 512 soft.

### What to supply for the app icon

One **1024×1024 PNG, square, fully opaque, no rounded corners** — the amber
running edge to edge with the mark centred — plus, ideally, the same as SVG.
With that, `src/lib/brand/mark.ts` and `npm run brand:icons` regenerate every
size, and the iOS touch icon follows automatically.

The lockups above have no such constraint and are ready to use on the site.

## Where the icon geometry currently lives

`src/lib/brand/mark.ts` still draws the **previous** mark as vector paths, and
everything derives from it — the header `Logomark`, `public/icon.svg`,
`public/icon-maskable.svg`, and the generated iOS touch icon. Replacing the
drawing there is what makes the new artwork appear on those surfaces; dropping
these PNGs into the folder does not do it on its own.
