ALTER TABLE public.merchant_transactions
  DROP CONSTRAINT merchant_transactions_payment_provider_check;

ALTER TABLE public.merchant_transactions
  ADD CONSTRAINT merchant_transactions_payment_provider_check
  CHECK (payment_provider = ANY (ARRAY['intasend'::text, 'daraja'::text, 'manual'::text, 'stripe'::text]));
