# Merchant KYC / AML Policy (DRAFT)

**Status: draft for internal review only — not published, not legal advice.**
This is a starting proposal for merchant verification, written to be
implementable against the current onboarding flow (`merchants` table:
name, address, phone, email, WhatsApp, what3words location — no identity
documents captured today). Legal/compliance should confirm which parts are
a business choice versus a legal requirement once the entity and its money
flows (does Maanta ever custody customer funds? — currently no) are final.

## 1. Why this exists

Maanta doesn't currently custody customer funds (redemption happens
directly between customer and Merchant in-store) and likely isn't a
"reporting institution" under Kenya's Proceeds of Crime and Anti-Money
Laundering Act (POCAMLA) on that basis — but it does receive money *from*
Merchants (top-ups) and controls a Merchant-facing balance, which is enough
reason to have baseline verification regardless of strict legal
requirement: it reduces fraud (fake merchants collecting top-up "float" and
disappearing), protects the marketplace's reputation, and is table stakes
for any future payment processor underwriting (Paystack/Flutterwave/Stripe
all require merchant KYC as part of onboarding Maanta itself).

## 2. Verification tiers (proposed)

**Tier 0 — current state**: business name, phone, email, physical mall
location (what3words), no document verification. Sufficient only for
`status = "pending"` (admin has not yet approved).

**Tier 1 — required before `status = "approved"`** (proposed new
requirement, not yet built):
- Business registration document (Certificate of Incorporation / Business
  Name registration from the Business Registration Service) or [sole
  proprietor equivalent].
- National ID or passport of the merchant owner/primary contact.
- Phone number verified via OTP (already implemented via Twilio Verify).
- Physical location confirmed (already captured via what3words + mall/floor/
  unit fields).

**Tier 2 — required before first top-up above [threshold amount TBD]**:
- KRA PIN certificate (tax registration) — needed regardless for any future
  invoicing/tax obligations.
- [Proof of address / utility bill — TBD whether necessary given the mall
  unit already serves this purpose.]

## 3. Ongoing monitoring (proposed, not yet built)

- Flag for manual review: unusually large or frequent top-ups relative to a
  Merchant's history, top-ups immediately followed by high redemption
  volume then account closure, multiple merchant accounts tied to the same
  ID/phone/bank details.
- Admin retains ability to suspend or shadow-ban (`is_shadow_banned` already
  exists in the data model) pending review.

## 4. Sanctions/PEP screening

[Placeholder — determine whether screening against sanctions lists is
warranted given Maanta's risk profile and scale; likely not required at
launch scale but worth a one-line policy statement either way, and easy to
revisit if a payment processor's underwriting requires it.]

## 5. Record-keeping

[Placeholder — retention period for KYC documents, consistent with the
Privacy Policy's retention section and any POCAMLA-adjacent record-keeping
norms, even if Maanta isn't formally a reporting institution.]

## 6. What's not built yet

This policy describes a target state. As of this draft, none of Tier 1/2
document collection is implemented in the onboarding flow — it's
currently just text fields. Before this policy can be truthfully published,
either the onboarding flow needs document upload + admin review, or the
policy needs to describe the actual (lighter) process instead of an
aspirational one.

---
*Open items: confirm with counsel whether Maanta's money flows in fact keep
it outside POCAMLA reporting-institution status; decide Tier 1/2 thresholds;
decide whether document collection is worth building before scale demands
it.*
