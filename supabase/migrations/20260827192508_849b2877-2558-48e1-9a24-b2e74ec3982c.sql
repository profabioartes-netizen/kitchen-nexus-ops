REVOKE ALL ON FUNCTION public.get_cash_session_summary(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.get_cash_session_summary(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_cash_session_summary(uuid) TO authenticated, service_role;