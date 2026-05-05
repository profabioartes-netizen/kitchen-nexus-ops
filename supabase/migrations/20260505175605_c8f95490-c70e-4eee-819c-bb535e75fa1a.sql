ALTER TABLE public.printers
  ADD COLUMN IF NOT EXISTS connection_type text NOT NULL DEFAULT 'network',
  ADD COLUMN IF NOT EXISTS auto_print boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS usb_device text;

ALTER TABLE public.printers ALTER COLUMN ip DROP NOT NULL;
ALTER TABLE public.printers ALTER COLUMN ip SET DEFAULT '';