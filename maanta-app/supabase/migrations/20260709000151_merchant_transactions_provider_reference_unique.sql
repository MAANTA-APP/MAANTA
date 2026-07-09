-- Task: guarantee idempotency of payment-provider ledger writes under
-- concurrent webhook delivery. provider_reference is the provider-side
-- id of a money movement (Stripe session/payment_intent, IntaSend invoice).
-- NULLs stay allowed (internal entries like success fees have none) and do
-- not collide with each other.
ALTER TABLE public.merchant_transactions
  ADD CONSTRAINT merchant_transactions_provider_reference_key
  UNIQUE (provider_reference);
