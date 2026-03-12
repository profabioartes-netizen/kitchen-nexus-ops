-- Prevent accidental production printing when stale clients insert per-item jobs on add
-- Keeps existing valid flows intact: grouped Save print jobs and cancellation tickets.

CREATE OR REPLACE FUNCTION public.enforce_production_print_job_shape()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payload_type text;
  payload_items jsonb;
BEGIN
  IF NEW.station IN ('Cozinha', 'Bebidas', 'Sobremesa') THEN
    payload_type := COALESCE(NEW.payload->>'type', '');
    payload_items := NEW.payload->'items';

    -- Valid cancellation ticket
    IF payload_type = 'cancellation' THEN
      RETURN NEW;
    END IF;

    -- Valid grouped production ticket (created on "Salvar Comanda")
    IF jsonb_typeof(payload_items) = 'array' AND jsonb_array_length(payload_items) > 0 THEN
      RETURN NEW;
    END IF;

    -- Invalid/legacy per-item production job (causes print on add): block by canceling it at insert time
    NEW.status := 'canceled';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_production_print_job_shape ON public.print_jobs;

CREATE TRIGGER trg_enforce_production_print_job_shape
BEFORE INSERT ON public.print_jobs
FOR EACH ROW
EXECUTE FUNCTION public.enforce_production_print_job_shape();