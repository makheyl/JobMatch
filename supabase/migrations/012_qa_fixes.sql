-- ============================================================================
-- Migration 012: QA fixes
-- - Allow anon + authenticated callers to invoke public.popular_roles() so
--   reference data loads on initial page boot with zero 401 console errors.
-- ============================================================================

grant execute on function public.popular_roles() to anon, authenticated;

notify pgrst, 'reload schema';
