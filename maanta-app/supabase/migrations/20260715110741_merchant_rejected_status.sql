-- Adds a real 'rejected' value to merchants.status. Previously the admin approvals UI
-- mapped "Reject" to 'churned' as a workaround since no reject state existed. Finds the
-- existing check constraint by introspection rather than assuming its name.

do $$
declare
  v_constraint_name text;
begin
  select con.conname into v_constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public'
    and rel.relname = 'merchants'
    and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%status%';

  if v_constraint_name is not null then
    execute format('alter table public.merchants drop constraint %I', v_constraint_name);
  end if;
end $$;

alter table public.merchants
  add constraint merchants_status_check
  check (status = any (array['pending'::text, 'active'::text, 'suspended'::text, 'churned'::text, 'rejected'::text]));
