-- Fast Visit is enabled only by the post-application rollout migration.
DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.app_config
  WHERE key = 'fast_visit_enabled' AND value = 'true';

  ASSERT v_count = 1,
    'post-call-forward rollout must enable Fast Visit';

  SELECT count(*) INTO v_count
  FROM public.app_config
  WHERE key = 'fast_visit_points' AND value = '50';

  ASSERT v_count = 1,
    'call-forward rollout must preserve the configured 50-point reward';

  RAISE NOTICE 'enable_fast_visit_after_call_forward passed';
END $$;
