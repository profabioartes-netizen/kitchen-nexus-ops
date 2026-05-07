## Diagnóstico

A impressão da conta no `PaymentPanel` segue o fluxo:

1. Lê `getPrintMode()` do localStorage (`src/lib/printPreference.ts`).
2. Padrão é `"ask"` quando o usuário nunca abriu a página `/impressoras`.
3. No modo `"ask"`/`"agent"`, tenta inserir um job em `print_jobs` para o **HuskyPDV Agent**.
4. No PC do Marcelo o Agent não está pareado / não roda, então a inserção falha (timeout 6s) e o usuário vê **"Falha ao imprimir"**.

A impressão **nativa pelo navegador** (`printViaBrowser` em `src/lib/browserPrint.ts`) já está pronta e funcional — usa `<iframe>` oculto + `window.print()` e o pop-up onde o Marcelo já selecionou a impressora correta.

A página `PrintersPage` chama `setPrintMode("native")` no `useEffect`, mas só roda se o usuário abrir essa página antes de imprimir. Como o cliente nunca abriu, o modo continua em `"ask"`.

## Correção

### 1. `src/lib/printPreference.ts`
Mudar o default de `getPrintMode()` de `"ask"` para `"native"`. A arquitetura atual (HuskyPDV Caixa Launcher + impressão pelo Chrome em modo `--kiosk-printing`) torna o Agent obsoleto para impressão de cupom não-fiscal.

### 2. `src/components/PaymentPanel.tsx` (botão imprimir conta, ~linha 962-1013)
Simplificar o fluxo: usar **sempre** `printViaBrowser(...)`. Remover:
- a tentativa de `supabase.from("print_jobs").insert(...)`,
- o `window.confirm` perguntando ao usuário,
- a ramificação por `getPrintMode()`.

Mantém apenas: chamar `printViaBrowser({ ...billPayload, paper: "80mm" })` e `toast.success("Imprimindo...")`. Se retornar `false`, mostra `toast.error("Não foi possível abrir a impressão.")`.

### 3. `src/pages/TableOrderPage.tsx` (linha 643)
Mesma simplificação: usar `printViaBrowser` direto, sem branch por modo, para garantir consistência em todos os pontos de impressão de conta.

### 4. (opcional) `src/pages/PrintersPage.tsx`
Manter o `setPrintMode("native")` por compatibilidade, mas a UI de seleção de modo pode ser escondida já que só temos um caminho ativo.

## Resultado esperado

Marcelo clica em imprimir → o pop-up de impressão do Chrome abre (ou imprime direto se estiver com `--kiosk-printing` via HuskyPDV Caixa Launcher) → cupom sai na impressora térmica já selecionada. **Sem mais "Falha ao imprimir"**.

## Arquivos alterados

- `src/lib/printPreference.ts`
- `src/components/PaymentPanel.tsx`
- `src/pages/TableOrderPage.tsx`
