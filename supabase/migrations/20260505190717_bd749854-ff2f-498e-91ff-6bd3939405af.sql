-- Tabela para o print agent reportar impressoras USB detectadas no computador local
CREATE TABLE IF NOT EXISTS public.usb_printer_discoveries (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL DEFAULT public.current_tenant_id(auth.uid()),
  device_id text NOT NULL,
  display_name text NOT NULL,
  reported_at timestamp with time zone NOT NULL DEFAULT now(),
  agent_host text,
  UNIQUE (tenant_id, device_id)
);

ALTER TABLE public.usb_printer_discoveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_select" ON public.usb_printer_discoveries
  FOR SELECT TO authenticated USING (public.user_belongs_to_tenant(tenant_id));
CREATE POLICY "tenant_insert" ON public.usb_printer_discoveries
  FOR INSERT TO authenticated WITH CHECK (public.user_belongs_to_tenant(tenant_id));
CREATE POLICY "tenant_update" ON public.usb_printer_discoveries
  FOR UPDATE TO authenticated USING (public.user_belongs_to_tenant(tenant_id))
  WITH CHECK (public.user_belongs_to_tenant(tenant_id));
CREATE POLICY "tenant_delete" ON public.usb_printer_discoveries
  FOR DELETE TO authenticated USING (public.user_belongs_to_tenant(tenant_id));

-- Trigger de isolamento por tenant
CREATE TRIGGER trg_enforce_tenant_id
  BEFORE INSERT OR UPDATE ON public.usb_printer_discoveries
  FOR EACH ROW EXECUTE FUNCTION public.enforce_tenant_id();

-- Realtime
ALTER TABLE public.usb_printer_discoveries REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.usb_printer_discoveries;