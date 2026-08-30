-- D169: a fresh database must match production's wallet-ledger posture.
-- All ledger mutations go through SECURITY DEFINER money-path functions;
-- authenticated clients never write public.merchant_transactions directly.

REVOKE INSERT, UPDATE, DELETE
ON public.merchant_transactions
FROM authenticated;
