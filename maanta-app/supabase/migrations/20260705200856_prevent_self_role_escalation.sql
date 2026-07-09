CREATE OR REPLACE FUNCTION public.prevent_self_role_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF auth.role() IS DISTINCT FROM 'service_role'
       AND public.current_user_role() IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'unauthorized: cannot change role';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER prevent_self_role_escalation_trigger
BEFORE UPDATE ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.prevent_self_role_escalation();
