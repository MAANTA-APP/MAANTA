-- notifications: per-user notification feed. Client code never inserts directly (no
-- "fabricate my own notification" path) — inserts are admin/service_role only.

create table public.notifications (
  id uuid primary key default extensions.uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  merchant_id uuid references public.merchants(id) on delete set null,
  title text not null,
  message text not null,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_id_created_at_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy notifications_select on public.notifications
  for select
  using (user_id = public.current_user_id());

create policy notifications_update on public.notifications
  for update
  using (user_id = public.current_user_id());

create policy notifications_insert on public.notifications
  for insert
  with check (public.current_user_role() = 'admin');
