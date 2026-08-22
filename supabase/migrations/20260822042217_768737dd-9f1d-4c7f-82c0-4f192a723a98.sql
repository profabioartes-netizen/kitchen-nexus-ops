REVOKE EXECUTE ON FUNCTION public.get_order_balance(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.register_order_credit(uuid, numeric, text, text, text) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.void_order_payment(uuid, text, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_order_balance(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.register_order_credit(uuid, numeric, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.void_order_payment(uuid, text, text) TO authenticated, service_role;