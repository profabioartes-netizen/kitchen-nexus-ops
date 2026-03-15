
UPDATE orders 
SET status = 'finalized' 
WHERE id IN (
  '0661f2ae-0410-4d31-a9ba-552b0d68693f',
  '66732a2b-fafc-4ffc-ae75-acf1b9c4fbed',
  '0a5e854c-224c-4978-8beb-b15b7be1199a',
  'd44b6258-100c-4417-af5f-f006199a8fa5'
);
