-- Apply only after the staff call-forward application deployment is live.
-- Qualification remains stamped at arrival; points move only after a
-- successful staff verification of the shopper's deal code.
UPDATE public.app_config
SET value = 'true'
WHERE key = 'fast_visit_enabled';
