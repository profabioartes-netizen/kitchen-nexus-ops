CREATE OR REPLACE FUNCTION public.enforce_production_print_job_shape()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  payload_type text;
  payload_items jsonb;
BEGIN
  IF NEW.station IN ('Cozinha', 'Bebidas', 'Sobremesa') THEN
    payload_type := COALESCE(NEW.payload->>'type', '');
    payload_items := NEW.payload->'items';

    -- Allow test tickets and cancellation tickets
    IF payload_type IN ('test', 'cancellation') THEN
      RETURN NEW;
    END IF;

    -- Valid grouped production ticket (created on "Salvar Comanda")
    IF jsonb_typeof(payload_items) = 'array' AND jsonb_array_length(payload_items) > 0 THEN
      RETURN NEW;
    END IF;

    -- Invalid/legacy per-item production job: cancel at insert time
    NEW.status := 'canceled';
  END IF;

  RETURN NEW;
END;
$function$;