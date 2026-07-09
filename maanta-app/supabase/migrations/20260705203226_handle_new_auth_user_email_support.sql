CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO public.users (auth_uid, phone, email, role)
  VALUES (NEW.id, NEW.phone, NEW.email, 'customer')
  ON CONFLICT (auth_uid) DO NOTHING;
  RETURN NEW;
END;
$function$;
