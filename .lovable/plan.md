## Objetivo

1. Exibir o **número digitado** (salvo em `orders.origin_location`) como prefixo do nome do cliente em todos os pontos da comanda, no formato `12 — João Silva`. Isso permite localizar a comanda tanto pelo número quanto pelo nome no campo de busca.
2. Verificar de ponta a ponta o fluxo de "Nova Comanda" implementado no turno anterior.

## Mudanças de exibição

### `src/pages/TablesPage.tsx`
- Criar helper `formatComandaLabel(order, fallback)` que retorna:
  - `"<origin_location> — <customer_name>"` quando ambos existem
  - só o número, ou só o nome, ou o `fallback` (visualLabel/table.name) caso contrário.
- Aplicar nos 3 pontos:
  - Header do card de mesa (linha ~1113)
  - Header do card no modo "floor" (linha ~1323)
  - Lista de comandas múltiplas no popover (linha ~997)
- Atualizar `filteredTables` (linha ~693) para também buscar por `order.origin_location` (match numérico exato e parcial).

### `src/components/OrderSelector.tsx`
- Mostrar o número antes do nome no botão da sidebar de comandas (`label = number + name`).

### `src/pages/TableOrderPage.tsx`
- No cabeçalho da comanda aberta, exibir `Nº 12 — João Silva` quando houver `origin_location` numérico.

## Verificação ponta-a-ponta

Roteiro de testes manuais a confirmar antes de fechar:

1. **Botão Nova Comanda** aparece no topo (mobile e desktop) → abre modal passo 1.
2. **Passo 1**: digitar "12", Enter avança ao passo 2.
3. **Passo 2 — busca**: lista clientes existentes, filtra por nome/telefone com debounce.
4. **Passo 2 — cadastrar**: criar "Maria Teste" → cliente persiste em `customers` (com `tenant_id` correto via trigger).
5. **Passo 2 — pular**: confirma como avulso (sem `customer_id`).
6. **Mesa livre**: comanda aberta na primeira mesa com `status='free'` (ordenada por `sort_order`).
7. **Card**: header mostra `12 — Maria Teste` (ou `12` se avulso). Mesa muda para `occupied` em realtime.
8. **Busca**: digitando "12" filtra a comanda. Digitando "Maria" também filtra.
9. **Sem mesa livre**: toast de erro impede criação.
10. **Cliente recorrente**: ao reabrir nova comanda no dia seguinte, "Maria" aparece no topo da lista (ordenada por `last_visit_at`) e `visit_count` incrementa.
11. **TableOrderPage**: cabeçalho da comanda reflete o número.
12. **Console/network**: sem erros de RLS, sem erros de tipo.

Qualquer falha encontrada será corrigida no mesmo turno.

## Fora de escopo

- Edição/exclusão de clientes cadastrados (CRUD completo fica para depois).
- Renomear `origin_location` para algo mais semântico (manteremos a coluna existente).
