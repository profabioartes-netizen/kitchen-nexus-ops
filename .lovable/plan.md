## Causa da lentidão no botão "MARCAR ENTREGUE"

Em `src/pages/TablesPage.tsx`, as duas mutations que marcam pedidos como entregues fazem **round-trips sequenciais ao banco** sem feedback otimista:

**`toggleOrderDelivered` (1 pedido)** — 5 round-trips em série:
1. `UPDATE orders` (delivered_at)
2. `UPDATE order_items` (delivered_at)
3. `recalcTableDeliveryStatus` → `SELECT orders` + `UPDATE restaurant_tables`

**`toggleAllOrdersDelivered` (todos os pedidos da mesa)** — pior ainda: loop `for ... await` sequencial. Para uma mesa com **N comandas**, são `2N + 2` round-trips em série. Com 4 comandas e 200ms de latência ≈ 2 segundos.

Além disso, ambas só atualizam o cache **depois** que o servidor responde (`onSuccess` + 3 `invalidateQueries` que disparam refetch grande de `open_orders`, `preview_order_items`, `restaurant_tables`). Resultado: o botão "trava" até tudo terminar.

## Correções em `src/pages/TablesPage.tsx`

1. **Paralelizar** as queries dentro de cada mutation com `Promise.all` em vez de `await` sequencial.
2. **`toggleAllOrdersDelivered`**: trocar o loop `for/await` por um único `Promise.all` com todas as N×2 operações disparadas simultaneamente.
3. **Adicionar `onMutate` (optimistic update)** em ambas: atualizar `open_orders` e `restaurant_tables` no cache imediatamente — botão responde no clique.
4. **Adicionar `onError` rollback** restaurando o snapshot anterior do cache.
5. **Mover `recalcTableDeliveryStatus` para background** (`void recalcTableDeliveryStatus(tableId)`) — não bloqueia o `await` da mutation. O cálculo final cai no `onSettled`/refetch.
6. **Mover `invalidateQueries` para `onSettled`** (em vez de `onSuccess`) — refetch acontece em background depois que o usuário já viu o resultado.

## Critério de aceite

- Clicar em "MARCAR ENTREGUE" muda a cor da comanda/mesa **instantaneamente** (< 50ms percebidos).
- Mesa com várias comandas marca todas em paralelo (1× round-trip de tempo, não N×).
- Em caso de erro, o estado volta ao anterior e mostra toast vermelho.
