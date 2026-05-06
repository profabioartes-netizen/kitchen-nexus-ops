UPDATE public.printers
SET usb_device = 'EPSON TM-T20X Receipt',
    name = 'EPSON TM-T20X Receipt',
    connection_type = 'usb',
    ip = NULL,
    port = 9100
WHERE id = '6f983add-262c-44ae-a382-1e9981bff284';

UPDATE public.print_jobs
SET status = 'canceled'
WHERE status IN ('pending', 'processing', 'error');