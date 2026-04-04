-- Close the ghost order (empty, no customer, no items)
UPDATE public.orders
SET status = 'closed', updated_at = now()
WHERE id = 'cbf29529-6606-4cb7-a67c-5d3939991151'
  AND status = 'open';

-- Free the table if no more open orders remain
UPDATE public.restaurant_tables
SET status = 'free', updated_at = now()
WHERE id = '9a23b6f3-c419-4a1e-bf67-604a96ce3e1b'
  AND NOT EXISTS (
    SELECT 1 FROM public.orders
    WHERE table_id = '9a23b6f3-c419-4a1e-bf67-604a96ce3e1b'
      AND status = 'open'
      AND id != 'cbf29529-6606-4cb7-a67c-5d3939991151'
  );