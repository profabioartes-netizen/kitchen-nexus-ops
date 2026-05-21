# Grade exibe apenas comandas abertas

## Objetivo

Esconder cartões de mesas livres na grade. A grade só mostra comandas com pedido aberto. Quando não houver nenhuma comanda aberta, a grade fica vazia com um estado vazio amigável ("Nenhuma comanda aberta — use Nova Comanda / F3 para abrir").

Criação continua igual: botão "Nova Comanda" (ou F3) abre o `NewComandaDialog` (passo 1 número → passo 2 cliente → itens). Não dependerá mais de clicar em cartão de mesa livre.

## Mudanças

### `src/pages/TablesPage.tsx` (painel do caixa)

- Em `sortedTables`, filtrar para manter apenas mesas com `ordersByTable[id]` presente (ocupada / conta / entregue). Ordenação por número de comanda crescente já existente é mantida.
- Remover/ocultar o cartão "livre" da grade — não renderizar mesas sem pedido.
- Atualizar contadores/legenda: a contagem "ocupadas/total" pode permanecer no header (informativo), mas a legenda de status "Livre" deixa de fazer sentido na grade e é removida.
- Estado vazio: quando `sortedTables.length === 0`, renderizar bloco centralizado com ícone + texto "Nenhuma comanda aberta" e botão "Nova Comanda" (dispara o mesmo handler do F3).
- `openTable` simplifica: só lida com cartões ocupados (navega para `/mesas/:id/pedido`). Lógica de `targetTableId` para mesa livre torna-se irrelevante na grade, mas mantém-se o caminho do diálogo escolher automaticamente a próxima mesa livre por `sort_order` (comportamento atual do "Nova Comanda").

### `src/pages/waiter/WaiterTablesPage.tsx` (PWA do garçom)

- Mesma regra: filtrar `sortedTables` para incluir apenas `occupiedTableIds`.
- Estado vazio equivalente, com botão/atalho para abrir nova comanda (fluxo do garçom já existente).
- Header "ocupadas/total" mantido.

### Não mexer

- `NewComandaDialog`, criação de comanda, RLS, realtime, `TableOrderPage`, gestão de mesas em Configurações (lá continua listando todas as mesas cadastradas).
- Mesas livres continuam existindo no banco e disponíveis para o diálogo selecionar — apenas não aparecem na grade operacional.

## Resultado

- Grade vazia quando não há comanda aberta.
- Cada cartão visível = uma comanda aberta, ordenada por número crescente.
- Criação por "Nova Comanda" / F3 inalterada.
