-- Internal money-path helpers: callable only from SECURITY DEFINER parents
-- (verify_redemption, admin_release_redemption, admin_appeal_hard_block) via
-- service_role/postgres — not directly by browser clients through PostgREST.
--
-- deduct_success_fee_or_record_arrears: a staff user with can_verify could
-- otherwise debit KES 30/call without a redemption (orphaned ledger rows).
-- increment_deal_claims: a merchant owner could inflate claims_count with no
-- audit trail. Both parents are SECURITY DEFINER and do not need EXECUTE
-- grants on these callees.

REVOKE ALL ON FUNCTION public.deduct_success_fee_or_record_arrears(uuid, numeric, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deduct_success_fee_or_record_arrears(uuid, numeric, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.deduct_success_fee_or_record_arrears(uuid, numeric, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_success_fee_or_record_arrears(uuid, numeric, uuid) TO service_role, postgres;

REVOKE ALL ON FUNCTION public.increment_deal_claims(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.increment_deal_claims(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.increment_deal_claims(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_deal_claims(uuid) TO service_role, postgres;
