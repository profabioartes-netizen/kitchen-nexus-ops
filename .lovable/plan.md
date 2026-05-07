## Diagnóstico

### Problema 1 — Acentos saindo desformatados
O agente Tauri (`desktop-agent/src-tauri/src/lib.rs`, função `print_raw`) grava o ticket em arquivo temp como **UTF-8 sem BOM** e manda para o PowerShell:

```
Get-Content -Path '...' -Raw | Out-Printer -Name '...'
```

`Get-Content` no Windows PowerShell 5.1 (que vem por padrão no Windows) **assume codificação ANSI/Default quando não há BOM**. Resultado: caracteres como `ç`, `ã`, `é` viram lixo (`Ã§`, `Ã£`...). É exatamente o sintoma reportado.

### Problema 2 — Telefone não aparece no cupom
Há um descasamento de chaves em `restaurant_settings`:

- `src/pages/SettingsPage.tsx` (linhas 62, 74, 93): **salva** o telefone na chave **`business_phone`**.
- `src/pages/TableOrderPage.tsx` (linha 79) e `src/pages/CashierPage.tsx` (linha 30): **leem** da chave **`phone`** — que não existe.

Confirmado no banco: existe `business_phone = "(37) 99182-1347"`, mas não existe chave `phone`. Por isso `businessPhone` chega vazio em todo print_job → o renderer (`desktop-agent/src/render.ts`) só imprime o telefone se `payload.business_phone` vier preenchido.

Bônus: `printCancellationIfNeeded` e o bloco de envio à cozinha em `WaiterOrderPage.tsx` nem sequer incluem `business_name`/`business_phone` no payload — o cabeçalho desses tickets fica só com o nome do tenant e sem telefone.

---

## Plano de correção

### 1. Corrigir acentos no agente (Rust/Tauri)
Em `desktop-agent/src-tauri/src/lib.rs`, função `print_raw`:
- Escrever o arquivo temp com **BOM UTF-8** (`\xEF\xBB\xBF`) antes do conteúdo, **e/ou** mudar o comando para `Get-Content -Encoding UTF8 -Raw -Path '...' | Out-Printer -Name '...'`.
- Aplicar as duas coisas em conjunto garante que tanto PowerShell 5.1 quanto 7.x leiam corretamente.

Isso exige rebuild do instalador (workflow `Build & Release Windows Installer` no GitHub Actions) e que o cliente reinstale o `HuskyPDV-Agent-Setup.exe`.

### 2. Corrigir chave do telefone (frontend)
Em `src/pages/TableOrderPage.tsx` (linhas 75–84) e `src/pages/CashierPage.tsx` (linhas 25–36): trocar o filtro `eq("key", "phone")` por `eq("key", "business_phone")`. Sem migração de dados — a chave correta já existe no banco.

### 3. Incluir nome/telefone também nos tickets de cozinha e cancelamento
- `src/pages/waiter/WaiterOrderPage.tsx` (bloco ~411–426): adicionar `business_name` e `business_phone` ao payload do print_job (ler da mesma forma que `TableOrderPage` faz).
- `src/lib/printCancellation.ts`: aceitar `businessName` e `businessPhone` como parâmetros e incluí-los no payload; ajustar os call sites para passar esses valores.

### 4. (Opcional) Limpeza dos dados duplicados
Existem 2 linhas com `business_phone` em `restaurant_settings` (uma com formatação, outra sem). Após validar qual o tenant correto de cada uma, deduplicar via migração — não é bloqueante para os fixes acima.

---

## Resultado esperado
- Cupons de comanda, recibo, cozinha e cancelamento exibem `Ç`, `Ã`, `É` corretamente.
- Linha do telefone aparece centralizada logo abaixo do nome do estabelecimento em todos os tipos de ticket.

Posso aplicar?
