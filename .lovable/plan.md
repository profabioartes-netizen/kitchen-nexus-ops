## Diagnóstico

A tela "Nova Comanda" cria a comanda corretamente em `TablesPage` (com número e cliente) e navega para `/mesas/<id>/pedido`. Porém, a `TableOrderPage` tem um `useEffect` que **auto-cria** uma comanda quando `tableOrders.length === 0` (linhas 484-490 de `TableOrderPage.tsx`).

Há uma corrida: ao montar a página, a query `table_orders_all` ainda não retornou a comanda recém-inserida, então o efeito dispara e cria uma **segunda** comanda sem `origin_location` nem `customer_id` — exatamente o "Comanda 1" sem número que aparece no print.

## Correção

1. Em `src/pages/TablesPage.tsx`, no handler do `NewComandaDialog` (linha ~1448), passar `state` na navegação informando que a comanda já foi criada:
   ```ts
   navigate(`/mesas/${freeTable.id}/pedido`, {
     state: { justCreatedOrderId: order.id, skipAutoCreate: true },
   });
   ```

2. Em `src/pages/TableOrderPage.tsx`:
   - Estender o tipo de `navState` para incluir `skipAutoCreate?: boolean` e `justCreatedOrderId?: string`.
   - No `useEffect` de auto-create (linha 485), adicionar a condição `!navState?.skipAutoCreate` para não duplicar quando a comanda já foi criada pelo fluxo Nova Comanda.

Sem outras mudanças. O auto-create continua funcionando ao acessar diretamente uma mesa livre pelo grid.
