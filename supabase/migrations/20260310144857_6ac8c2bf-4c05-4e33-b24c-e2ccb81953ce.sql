-- Allow updating payments (needed for order transfer/merge)
CREATE POLICY "Anyone can update payments"
ON public.payments
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);