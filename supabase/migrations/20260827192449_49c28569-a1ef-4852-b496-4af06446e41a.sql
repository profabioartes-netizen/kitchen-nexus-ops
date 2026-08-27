-- 1) Permitir métodos débito/crédito separados (mantendo 'card' legado)
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_method_check;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_method_check
  CHECK (method IN ('cash','card','pix','debit','credit'));

-- 2) Ampliar cash_movements para receber pagamentos de qualquer origem
ALTER TABLE public.cash_movements ALTER COLUMN session_id DROP NOT NULL;
ALTER TABLE public.cash_movements
  ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES public.payments(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS order_id uuid,
  ADD COLUMN IF NOT EXISTS method text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS voided_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS cash_movements_payment_id_key
  ON public.cash_movements(payment_id) WHERE payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS cash_movements_session_idx ON public.cash_movements(session_id);
CREATE INDEX IF NOT EXISTS cash_movements_tenant_created_idx ON public.cash_movements(tenant_id, created_at);

-- 3) Camada centralizada: todo pagamento gera exatamente uma movimentação financeira
CREATE OR REPLACE FUNCTION public.sync_payment_cash_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_session uuid;
  v_origin text;
  v_label text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT id INTO v_session
    FROM public.cash_register_sessions
    WHERE tenant_id = NEW.tenant_id AND status = 'open'
    ORDER BY opened_at DESC
    LIMIT 1;

    SELECT COALESCE(o.origin, 'waiter'),
           COALESCE(NULLIF(BTRIM(o.origin_location), ''), o.customer_name, 'Balcão')
      INTO v_origin, v_label
    FROM public.orders o WHERE o.id = NEW.order_id;

    INSERT INTO public.cash_movements (
      session_id, type, amount, description, created_by_name,
      tenant_id, payment_id, order_id, method, source, voided_at, created_at
    ) VALUES (
      v_session,
      'sale',
      NEW.amount,
      CASE WHEN NEW.kind = 'credit' THEN 'Abatimento' ELSE 'Venda' END
        || ' — ' || COALESCE(v_label, 'Balcão'),
      COALESCE(NEW.created_by_name, ''),
      NEW.tenant_id,
      NEW.id,
      NEW.order_id,
      NEW.method,
      COALESCE(v_origin, 'waiter'),
      NEW.voided_at,
      NEW.created_at
    )
    ON CONFLICT (payment_id) DO NOTHING;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.voided_at IS DISTINCT FROM OLD.voided_at
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.method IS DISTINCT FROM OLD.method
       OR NEW.order_id IS DISTINCT FROM OLD.order_id THEN
      UPDATE public.cash_movements
      SET voided_at = NEW.voided_at,
          amount = NEW.amount,
          method = NEW.method,
          order_id = NEW.order_id
      WHERE payment_id = NEW.id;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_payment_cash_movement ON public.payments;
CREATE TRIGGER trg_sync_payment_cash_movement
AFTER INSERT OR UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.sync_payment_cash_movement();

-- 4) Resumo de fechamento: físico separado do eletrônico
CREATE OR REPLACE FUNCTION public.get_cash_session_summary(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_session public.cash_register_sessions%ROWTYPE;
  v_opening numeric := 0;
  v_cash_sales numeric := 0;
  v_pix numeric := 0;
  v_debit numeric := 0;
  v_credit numeric := 0;
  v_card numeric := 0;
  v_supply numeric := 0;
  v_withdraw numeric := 0;
  v_expense numeric := 0;
  v_voided numeric := 0;
BEGIN
  SELECT * INTO v_session FROM public.cash_register_sessions WHERE id = p_session_id;
  IF NOT FOUND OR NOT public.user_belongs_to_tenant(v_session.tenant_id) THEN
    RETURN NULL;
  END IF;

  v_opening := COALESCE(v_session.opening_amount, 0);

  SELECT
    COALESCE(SUM(CASE WHEN m.voided_at IS NULL AND m.type = 'sale' AND m.method = 'cash' THEN m.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN m.voided_at IS NULL AND m.type = 'sale' AND m.method = 'pix' THEN m.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN m.voided_at IS NULL AND m.type = 'sale' AND m.method = 'debit' THEN m.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN m.voided_at IS NULL AND m.type = 'sale' AND m.method = 'credit' THEN m.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN m.voided_at IS NULL AND m.type = 'sale' AND m.method = 'card' THEN m.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN m.voided_at IS NULL AND m.type = 'supply' THEN m.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN m.voided_at IS NULL AND m.type = 'withdraw' THEN m.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN m.voided_at IS NULL AND m.type = 'expense' THEN m.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN m.voided_at IS NOT NULL AND m.type = 'sale' THEN m.amount ELSE 0 END), 0)
  INTO v_cash_sales, v_pix, v_debit, v_credit, v_card, v_supply, v_withdraw, v_expense, v_voided
  FROM public.cash_movements m
  WHERE m.session_id = p_session_id;

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'opening_amount', v_opening,
    'cash_sales', v_cash_sales,
    'pix', v_pix,
    'debit', v_debit,
    'credit', v_credit,
    'card_legacy', v_card,
    'supplies', v_supply,
    'withdrawals', v_withdraw,
    'expenses', v_expense,
    'voided_sales', v_voided,
    'electronic_total', v_pix + v_debit + v_credit + v_card,
    'total_sales', v_cash_sales + v_pix + v_debit + v_credit + v_card,
    'expected_cash', v_opening + v_cash_sales + v_supply - v_withdraw - v_expense
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_cash_session_summary(uuid) TO authenticated, service_role;