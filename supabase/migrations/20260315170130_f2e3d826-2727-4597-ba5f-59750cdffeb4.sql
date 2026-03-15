-- Remove the unique constraint that prevents multiple open orders per table.
-- This is needed for self-service: each customer gets their own order on the same table.
DROP INDEX IF EXISTS public.orders_one_active_per_table_idx;