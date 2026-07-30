import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";

/**
 * Frame 13j — Staff verify gate. Rule R-VERIFY-PERMISSION.
 *
 * Job: tell staff without verify permission why they cannot enter codes, and
 * who can fix it. `primaryAction` is "Contact the owner", so this is not the
 * generic permission notice — a cashier standing at the counter with a waiting
 * shopper needs a way out of the dead end, not just a refusal.
 *
 * The server remains the authority: /api/redemptions/{preflight,verify,reject}
 * all run `requireMerchant("can_verify")`. This screen only explains.
 */
export function StaffVerifyGate({
  ownerPhone,
  shopName,
}: {
  /** Shop contact number, when the merchant record carries one. */
  ownerPhone?: string | null;
  shopName?: string | null;
}) {
  // Digits only — `wa.me` rejects spaces and a leading +.
  const whatsapp = ownerPhone ? ownerPhone.replace(/\D/g, "") : null;

  return (
    <main className="mx-auto flex max-w-md flex-col px-6 py-20 text-center">
      <h1 className="text-lg font-bold text-ink">You can&apos;t verify codes</h1>
      <p className="mt-2 text-sm text-secondary">
        Verifying redemptions needs permission from the shop owner
        {shopName ? ` at ${shopName}` : ""}. They can grant it in Staff, and it
        applies the next time you sign in.
      </p>

      {whatsapp ? (
        <ButtonLink href={`https://wa.me/${whatsapp}`} full className="mt-8">
          Contact the owner
        </ButtonLink>
      ) : (
        <p className="mt-8 text-sm font-semibold text-ink">
          Ask the shop owner to enable verifying in Staff.
        </p>
      )}

      <Link
        href="/merchant/more"
        className="mt-4 text-sm font-semibold text-ink underline"
      >
        Back to the shop menu
      </Link>
    </main>
  );
}
