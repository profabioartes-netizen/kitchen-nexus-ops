## Objetivo

Permitir filtrar rapidamente apenas as **comandas abertas de clientes VIP** na tela inicial (Mapa de Comandas) e na tela do garçom.

---

## 1. TablesPage.tsx (Mapa de Comandas — admin/desktop)

- Adicionar estado `vipOnly: boolean` (default `false`).
- Ao lado da barra de busca (linha 933), inserir um **chip-toggle** "Apenas VIPs" com ícone `Crown`:
  - Inativo: borda neutra, fundo `card`, texto `muted`.
  - Ativo: fundo amarelo (`#fef9c3`), borda dourada (`#facc15`), texto `#854d0e`.
  - Mostra também a contagem entre parênteses, ex: `Apenas VIPs (3)`.
- No `useMemo` `filteredTables` (linha 738), aplicar filtro extra:
  - Se `vipOnly === true`, manter apenas mesas cujo `order.customer_id` esteja em `vipCustomerIds`.
  - Combina com a busca por texto existente (AND).
- Se o filtro estiver ligado e nenhuma comanda VIP estiver aberta, exibir empty state amigável "Nenhuma comanda VIP aberta no momento" com botão para limpar filtro.

## 2. WaiterTablesPage.tsx (mobile do garçom)

- Mesma lógica: estado `vipOnly`, chip-toggle compacto acima da lista (junto com a legenda de status).
- Filtro aplicado em `sortedTables` antes do `.map`.
- Empty state equivalente.

## 3. Persistência leve (opcional)

- Guardar a preferência em `localStorage` (`tables_vip_only`) para que o filtro permaneça entre recargas — útil para o caixa/garçom que quer "modo VIP" durante um período.

---

## 4. Arquivos afetados

- `src/pages/TablesPage.tsx` — toggle + filtro + empty state.
- `src/pages/waiter/WaiterTablesPage.tsx` — toggle + filtro + empty state.

Nenhuma alteração de banco de dados (a coluna `is_vip` e a query `vipCustomerIds` já existem).

---

## 5. Fora de escopo

- Filtros adicionais (por garçom, por setor) — pode ser proposto depois.
- Filtro VIP nas telas de Caixa/Cozinha/Relatórios.

Se aprovar, implemento direto.