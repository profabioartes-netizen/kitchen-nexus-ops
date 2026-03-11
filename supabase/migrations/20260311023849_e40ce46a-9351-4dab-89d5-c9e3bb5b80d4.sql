
-- Table to track edit locks on comandas
CREATE TABLE public.comanda_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES public.restaurant_tables(id) ON DELETE CASCADE,
  locked_by_user_id uuid NOT NULL,
  locked_by_user_name text NOT NULL DEFAULT '',
  locked_at timestamptz NOT NULL DEFAULT now(),
  lock_expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 seconds'),
  UNIQUE(table_id)
);

ALTER TABLE public.comanda_locks ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read locks (to see if a comanda is locked)
CREATE POLICY "Anyone can read locks"
  ON public.comanda_locks FOR SELECT
  TO authenticated
  USING (true);

-- Anyone authenticated can insert locks
CREATE POLICY "Anyone can insert locks"
  ON public.comanda_locks FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Users can update their own locks or expired locks
CREATE POLICY "Users can update own or expired locks"
  ON public.comanda_locks FOR UPDATE
  TO authenticated
  USING (locked_by_user_id = auth.uid() OR lock_expires_at < now());

-- Users can delete their own locks or expired locks
CREATE POLICY "Users can delete own or expired locks"
  ON public.comanda_locks FOR DELETE
  TO authenticated
  USING (locked_by_user_id = auth.uid() OR lock_expires_at < now());

-- Function to acquire a lock (atomic upsert with conflict handling)
CREATE OR REPLACE FUNCTION public.acquire_comanda_lock(
  p_table_id uuid,
  p_user_id uuid,
  p_user_name text,
  p_duration_seconds int DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_lock comanda_locks%ROWTYPE;
  result jsonb;
BEGIN
  -- Check for existing non-expired lock by another user
  SELECT * INTO existing_lock
  FROM comanda_locks
  WHERE table_id = p_table_id
  FOR UPDATE;

  IF FOUND AND existing_lock.locked_by_user_id != p_user_id AND existing_lock.lock_expires_at > now() THEN
    -- Locked by someone else
    RETURN jsonb_build_object(
      'acquired', false,
      'locked_by_user_name', existing_lock.locked_by_user_name,
      'lock_expires_at', existing_lock.lock_expires_at
    );
  END IF;

  -- Upsert lock
  INSERT INTO comanda_locks (table_id, locked_by_user_id, locked_by_user_name, locked_at, lock_expires_at)
  VALUES (p_table_id, p_user_id, p_user_name, now(), now() + (p_duration_seconds || ' seconds')::interval)
  ON CONFLICT (table_id)
  DO UPDATE SET
    locked_by_user_id = p_user_id,
    locked_by_user_name = p_user_name,
    locked_at = now(),
    lock_expires_at = now() + (p_duration_seconds || ' seconds')::interval;

  RETURN jsonb_build_object('acquired', true);
END;
$$;

-- Function to release a lock
CREATE OR REPLACE FUNCTION public.release_comanda_lock(
  p_table_id uuid,
  p_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM comanda_locks
  WHERE table_id = p_table_id
  AND (locked_by_user_id = p_user_id OR lock_expires_at < now());
END;
$$;

-- Enable realtime for locks so other clients see changes instantly
ALTER PUBLICATION supabase_realtime ADD TABLE public.comanda_locks;
