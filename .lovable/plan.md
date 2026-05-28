## Faturamento por cliente na tela de Clientes

Adicionar uma coluna **"Faturamento"** na listagem de clientes (`CustomersPage.tsx`), exibindo o total pago pelo cliente, com um filtro de período no topo da página.

### 1. Fonte dos dados
O faturamento vem da tabela `payments` (campo `amount`), ligada ao cliente via `payments.order_id → orders.customer_id`. Apenas pagamentos cujo `orders.customer_id` corresponde ao cliente são contados — pagamentos sem cliente vinculado ficam de fora.

### 2. Filtro de período (novo controle no topo, ao lado dos filtros existentes)
Opções (dropdown):
- **Hoje**
- **Últimos 7 dias**
- **Últimos 30 dias**
- **Este mês**
- **Mês passado**
- **Período personalizado** (abre dois date pickers)
- **Total (desde o início)** — padrão

O período filtra `payments.created_at`. A escolha é persistida em `localStorage` (`customers_revenue_period`).

### 3. Cálculo e exibição
- Para a página atual (até 50 clientes), buscar em paralelo um agregado:
  ```
  SELECT o.customer_id, SUM(p.amount) AS total
  FROM payments p
  JOIN orders o ON o.id = p.order_id
  WHERE o.customer_id IN (<ids da página>)
    AND p.created_at BETWEEN <início> AND <fim>
  GROUP BY o.customer_id
  ```
  (executado via `supabase.from('payments').select('amount, orders!inner(customer_id)').in('orders.customer_id', ids)` + filtro de data, e agregado no client; ou via uma RPC `get_customer_revenue(ids, start, end)` — recomendado RPC para performance e para respeitar RLS multi-tenant).
- Nova coluna **"Faturamento"** na tabela desktop (entre "Visitas" e "Última visita"), alinhada à direita, formato `R$ 1.234,56`. Clientes sem pagamentos no período mostram `—`.
- Nos cards mobile, exibir uma linha extra: `R$ 1.234,56 no período`.
- VIPs com faturamento > 0 ganham destaque sutil em âmbar no número.

### 4. Total geral
Acima da tabela, mostrar um card resumo com:
- **Faturamento total no período** (soma de todos os clientes filtrados, não só da página)
- Quantidade de clientes que pagaram no período

### 5. Ordenação (opcional, mesma entrega)
Permitir clicar no cabeçalho "Faturamento" para ordenar desc/asc — útil para ver os maiores clientes do período.

### Detalhes técnicos
- **Nova RPC** `get_customers_revenue(p_customer_ids uuid[], p_start timestamptz, p_end timestamptz)` retornando `customer_id, total_revenue, payment_count`. SECURITY DEFINER com filtro `tenant_id = current_tenant_id(auth.uid())` para isolamento multi-tenant.
- **RPC separada** `get_customers_revenue_summary(p_start, p_end)` retornando soma total + count de clientes distintos no tenant para o card resumo.
- React Query keys: `["customer_revenue", periodKey, pageIds]` e `["customer_revenue_summary", periodKey]`. Invalidar quando filtros mudam.
- Sem alterações de schema; apenas duas RPCs novas em migration.
- Sem impacto em outras telas.

### Fora do escopo
- Drill-down (lista de pagamentos do cliente) — pode virar próximo passo.
- Exportar CSV do ranking de faturamento por cliente.
- Filtrar por método de pagamento.
