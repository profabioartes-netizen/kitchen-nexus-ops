# Comandas com número cadastrado + ordenação crescente

## O que muda

### 1. Rótulo da comanda usa o número cadastrado

Hoje cada cartão mostra um rótulo sequencial automático "Comanda 1", "Comanda 2"… baseado na posição na grade (variável `visualLabels` em `TablesPage`). Esse rótulo aparece em dois lugares:

- No **cabeçalho do cartão** (combinado com o nome via `formatComandaLabel`).
- Em um **badge separado** logo abaixo (linhas 1156–1165 de `src/pages/TablesPage.tsx`).

Mudança:
- `visualLabels[t.id]` passa a ser `"Comanda <número-cadastrado>"`, onde o número vem de `order.origin_location` (ou `current_location` como fallback) — o mesmo valor que o usuário digita no diálogo "Nova Comanda".
- Quando a mesa estiver livre (sem `order`), o fallback continua sendo `"Comanda N"` sequencial só para placeholder visual.
- O **badge extra "Comanda N" antes do nome do cliente** (linhas 1156–1165) é **removido** — fica redundante, já que o cabeçalho agora carrega o número correto.
- Aplicar o mesmo ajuste em `src/pages/waiter/WaiterTablesPage.tsx`, que também monta `Comanda ${i+1}` sequencial.

### 2. Ordenação crescente pelo número da comanda

Hoje as comandas abertas são ordenadas por `created_at` (mais antigas primeiro). Mudança em `sortedTables` (linhas ~668–696 de `TablesPage.tsx`):

- Tabelas com comanda aberta continuam antes das livres.
- Entre as ocupadas, ordenar por **`origin_location` interpretado como número** em ordem crescente (1, 10, 18, 40 — não alfabético "1, 10, 18, 40" já bate, mas comparação numérica garante para casos como "2" vs "10").
- Comandas sem número cadastrado vão para o fim do grupo das ocupadas, mantendo `created_at` como desempate.
- Mesma regra replicada em `WaiterTablesPage.tsx`.

## Detalhes técnicos

- Parse: `parseInt(origin_location, 10)`; se `NaN`, trata como `Number.MAX_SAFE_INTEGER` para empurrar pro fim.
- Comparação textual com `localeCompare(..., { numeric: true })` como tiebreak quando ambos não são puramente numéricos.
- Nada muda no banco; é puramente de apresentação/ordenação no frontend.

## Arquivos afetados

- `src/pages/TablesPage.tsx` — `visualLabels`, `sortedTables`, remoção do badge duplicado.
- `src/pages/waiter/WaiterTablesPage.tsx` — `visualLabels`, `sortedTables`.
