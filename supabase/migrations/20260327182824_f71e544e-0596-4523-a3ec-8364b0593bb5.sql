UPDATE nfce_records 
SET url_danfe = 'https://api.focusnfe.com.br' || url_danfe 
WHERE status = 'emitida' 
AND url_danfe IS NOT NULL 
AND url_danfe NOT LIKE 'http%';