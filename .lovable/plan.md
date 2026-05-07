## Por que o ícone não aparece

Investiguei o `.ico` em `public/icons/huskypdv.ico` — está válido (multi-resolução 16→256, servido pela Cloudflare como `image/vnd.microsoft.icon`). O problema está no script PowerShell embutido no `.bat`:

1. **PowerShell 5.1 (padrão do Windows 10/11) usa TLS 1.0 por padrão.** Cloudflare exige TLS 1.2+, então `Invoke-WebRequest` falha silenciosamente. O `try/catch` engole o erro e o atalho fica sem ícone — caindo no fallback do Chrome.
2. **`IconLocation` sem índice** (`,0`) é interpretado de forma inconsistente pelo Explorer quando o `.ico` tem múltiplas resoluções.
3. **Cache de ícones do Windows** (`iconcache_*.db`) segura ícones antigos mesmo após o atalho ser corrigido, o que dá impressão de que "não funcionou".

## Correções no `src/pages/PrintersPage.tsx`

Atualizar o script PowerShell embutido no gerador `.bat` para:

- Forçar `[Net.ServicePointManager]::SecurityProtocol = Tls12` antes do download.
- Validar download: arquivo precisa existir e ter > 1000 bytes; senão tentar novamente com `System.Net.WebClient` (fallback).
- Mostrar mensagem clara se o download falhou (em vez de silencioso).
- Remover `.lnk` antigo antes de recriar (evita herdar atributos cacheados).
- Usar `IconLocation = "$iconPath,0"` (com índice explícito).
- Limpar `iconcache_*.db` em `%LOCALAPPDATA%\Microsoft\Windows\Explorer` e reiniciar `explorer.exe` para o ícone novo aparecer imediatamente, sem precisar logoff.

Nenhuma mudança no `.ico` em si — ele já está correto.

## Critério de aceite

- Após rodar o `.bat`, o atalho "HuskyPDV Caixa" exibe o logo HuskyPDV (não mais ícone branco/Chrome).
- Se o download falhar (sem internet), mensagem clara em amarelo informando.
- Funciona em Windows 10/11 com PowerShell 5.1 padrão.
