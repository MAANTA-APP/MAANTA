alter table merchant_transactions
  add column currency text not null default 'KES',
  add column charged_amount numeric;

alter table merchant_transactions
  add constraint merchant_transactions_currency_check
    check (currency = any (array['KES','USD','EUR','GBP']));

alter table merchant_transactions
  drop constraint merchant_transactions_transaction_type_check;

alter table merchant_transactions
  add constraint merchant_transactions_transaction_type_check
    check (transaction_type = any (array['topup','success_fee','success_fee_arrears','boost_fee','subscription','refund','dispute']));

create table payment_webhook_failures (
  id uuid primary key default uuid_generate_v4(),
  payment_provider text not null,
  event_type text,
  error_message text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);
