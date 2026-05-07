
# Auditoria HuskyPDV — Preparação para Escala (+100 comandas / 10+ tenants)

## Diagnóstico atual

**Cálculos financeiros**: dispersos em `AddItemDialog.tsx`, `PaymentPanel.tsx`, `recalculateOrderTotal.ts`, `printItems.ts`, `WaiterOrderPage.tsx`. Usam `Number`, `parseFloat` e `.toFixed(2)` ad-hoc — risco de arredondamento (ex: 0,1+0,2). Total da comanda já é recalculado no servidor via `recalculate_order_total` (✅ bom), mas a UI faz seus próprios totais paralelos.

**Queries / React Query**: `TablesPage.tsx` tem **13 useQuery** simultâneos sem `staleTime`, sem paginação. Carrega TODAS as `orders` abertas + `order_items` + `restaurant_tables`. Com 100+ comandas × 20 itens = 2000+ rows por refetch, multiplicado por cada cliente conectado.

**Realtime**: 8 canais espalhados, todos com `event: '*'` (INSERT+UPDATE+DELETE de TODAS as colunas). Sem filtros `filter:` por tenant_id, sem restrição a colunas. Cada UPDATE de `viewed_at` ou `paid_quantity` dispara invalidação completa de queries pesadas.

**Índices DB**: existem só `(tenant_id)` e PKs. **Faltam** índices compostos para os filtros mais usados:
- `orders (tenant_id, status)` → toda listagem filtra por status='open'
- `orders (tenant_id, table_id, status)` → busca da comanda da mesa
- `orders (tenant_id, created_at)` → relatórios e dashboards
- `order_items (order_id, preparation_status)` → KDS
- `payments (tenant_id, created_at)` → caixa/relatórios
- `table_activity_log (tenant_id, created_at)` → timeline

## Plano de refatoração

### 1. FinanceUtils centralizado (precisão decimal)

Novo `src/lib/finance.ts` baseado em **inteiros (centavos)** — solução mais leve que Big.js, zero dependência, mesma precisão para moeda:

```ts
export const FinanceUtils = {
  parseDecimal(input): number          // aceita "1,5" "1.5" 1.5
  toCents(value): number                // 12.34 → 1234
  fromCents(cents): number              // 1234 → 12.34
  multiply(a, b): number                // peso × preço, retorna number 2 casas
  weightedPrice(kg, pricePerKg): number // 0.348 × 79.90
  sum(values[]): number
  formatBRL(value): string              // "R$ 12,34"
  formatWeight(kg): string              // "0,348 kg"
  round(value, decimals=2): number      // arredondamento bancário half-even
}
```

Substituir nos pontos: `AddItemDialog`, `PaymentPanel`, `WaiterOrderPage`, `printItems`, `ReceiptTemplate`, `CashierPage`, `SalesPage`, `ReportsPage`.

### 2. Otimização React Query

**Adicionar staleTime/refetch tuning** nas queries de listagem:
- `tables` / `categories` / `products`: `staleTime: 5min` (mudam raro, dependem só de realtime)
- `openOrders` / `kitchen_items`: `staleTime: 30s`, remover `refetchInterval: 5000` do KDS (deixar só realtime)
- `todayStats`, `avgServiceTime`: `staleTime: 60s`
- Dashboard global: trocar agregações no cliente por **RPC** que retorna apenas o resumo

**Paginação na listagem de pedidos** (`WaiterOrdersPage`):
- `useInfiniteQuery` com `range(offset, offset+19)`, ordenado por `created_at DESC`
- Lista virtualizada (`@tanstack/react-virtual`) quando >50 itens

**Seleção de colunas**: substituir `select("*")` por colunas específicas onde possível (especialmente `order_items` no KDS e nas previews).

### 3. Realtime estrito

Para cada `.channel(...)`:
- Adicionar `filter: 'tenant_id=eq.<id>'` (puxar do `TenantContext`) → reduz ~90% do tráfego em ambiente multi-tenant
- Trocar `event: '*'` por eventos específicos (`UPDATE` para status/total; `INSERT` separado quando precisar)
- Para `orders`, ouvir apenas mudanças relevantes: invalidar lista só quando `status` ou `total` mudam, não a cada `updated_at`. Implementar via callback que compara `payload.new` vs `payload.old` antes de invalidar.
- Consolidar canais duplicados: `dashboard-sync`, `waiter-tables-sync`, `waiter-orders-sync` cobrem o mesmo evento → criar hook `useTenantRealtime()` único compartilhado.
- Debounce nas invalidações (`setTimeout` 250ms agrupando múltiplos eventos do mesmo burst).

### 4. Índices de banco (migration)

```sql
CREATE INDEX IF NOT EXISTS idx_orders_tenant_status         ON orders(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_table_status   ON orders(tenant_id, table_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_tenant_created_at     ON orders(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_status     ON order_items(order_id, preparation_status);
CREATE INDEX IF NOT EXISTS idx_order_items_tenant_created   ON order_items(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_created      ON payments(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_order               ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_table_activity_tenant_created ON table_activity_log(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comanda_locks_table          ON comanda_locks(table_id);
CREATE INDEX IF NOT EXISTS idx_nfce_records_order           ON nfce_records(order_id);
```

RLS já usa `user_belongs_to_tenant(tenant_id)` — combinada com o índice `(tenant_id, ...)` o planner usa index scan ao invés de seq scan.

### 5. REPLICA IDENTITY (necessário para realtime UPDATE eficiente)

Verificar e garantir `REPLICA IDENTITY FULL` em `orders`, `order_items`, `payments` para que `payload.old` venha completo (necessário pro filtro "só invalida se status/total mudou").

---

## Resposta direta: a estrutura suporta SaaS com 10 clientes nesse potencial?

**Hoje, com cuidado: sim para ~5 clientes pequenos (até 30 comandas simultâneas cada). Para 10 clientes a 100+ comandas: não, sem este refactor.**

Gargalos atuais que travariam:
1. `TablesPage` faz 13 queries sem paginação → ~2-3s de carregamento por refresh com volume.
2. Realtime sem filtro por tenant: cada cliente recebe eventos de todos os outros (Supabase Realtime tem cota — você estouraria antes dos 10 tenants).
3. Sem índices compostos: `WHERE tenant_id=X AND status='open'` faz seq scan quando a tabela passa de ~50k linhas.
4. Cálculos em `Number` JS: hoje aceitável; em escala, divergência de centavos vira reclamação semanal.

**Após este plano**: a base aguenta confortavelmente 10 tenants × 100 comandas (1000 comandas ativas), com headroom para 50 tenants antes de precisar de read-replicas ou sharding.

## Arquivos afetados

- **novo**: `src/lib/finance.ts`
- **novo**: `src/hooks/useTenantRealtime.ts`
- **migration**: 10 índices acima + checagem REPLICA IDENTITY
- **edit**: `src/components/AddItemDialog.tsx`, `src/components/PaymentPanel.tsx`, `src/lib/printItems.ts`, `src/lib/recalculateOrderTotal.ts` (consumidores), `src/pages/TablesPage.tsx`, `src/pages/KitchenStationPage.tsx`, `src/pages/waiter/WaiterTablesPage.tsx`, `src/pages/waiter/WaiterOrdersPage.tsx`, `src/pages/waiter/WaiterOrderPage.tsx`, `src/pages/TableOrderPage.tsx`, `src/pages/CashierPage.tsx`, `src/pages/SalesPage.tsx`, `src/pages/ReportsPage.tsx`

Posso executar tudo numa única passagem ou dividir em fases (1. índices+finance → 2. realtime → 3. paginação) se preferir entregas incrementais.
