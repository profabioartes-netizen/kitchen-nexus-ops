-- Clean up duplicate empty orders for Comanda 1
UPDATE orders SET status = 'canceled' 
WHERE table_id = 'cd683d69-3520-4393-8b74-f9cc338aea2d' 
  AND status = 'open' 
  AND total = 0 
  AND customer_name IS NULL
  AND id != 'b66d66af-d9e1-4c84-bc3f-3a7d744aa7f9';