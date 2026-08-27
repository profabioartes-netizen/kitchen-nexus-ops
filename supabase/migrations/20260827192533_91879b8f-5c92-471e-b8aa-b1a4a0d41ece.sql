DROP INDEX IF EXISTS public.cash_movements_payment_id_key;
CREATE UNIQUE INDEX cash_movements_payment_id_key ON public.cash_movements(payment_id);