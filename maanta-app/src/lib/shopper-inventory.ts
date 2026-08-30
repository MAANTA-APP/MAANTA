/** Server-issued marker used by the immediately-following inventory RSC read. */
export const SHOPPER_INVENTORY_BYPASS_COOKIE =
  "maanta-shopper-inventory-fresh";

/** Long enough for the immediately-following router.refresh, short by design. */
export const SHOPPER_INVENTORY_BYPASS_MAX_AGE_SECONDS = 10;

export function shouldBypassLiveDealsCache(value: string | undefined): boolean {
  return value === "1";
}
