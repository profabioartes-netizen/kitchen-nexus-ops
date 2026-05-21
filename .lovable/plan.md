# Restaurar fluxo de criação: número → cliente → itens

## Diagnóstico

O diálogo `NewComandaDialog` ainda tem o fluxo correto (passo 1: número; passo 2: cliente) e o handler em `TablesPage` (linhas 1443–1475) faz tudo certo — cria a comanda com `origin_location` = número, `customer_*` preenchidos, e só então navega para `/mesas/:id/pedido` com `skipAutoCreate: true`.

O problema é o **caminho alternativo**: quando o usuário **clica diretamente em um cartão de mesa LIVRE** na grade (`openTable(id)`, linha 539–541), o app navega direto para `TableOrderPage`, que então **auto-cria** uma comanda vazia (sem número, sem cliente) via `useEffect` em `src/pages/TableOrderPage.tsx` linhas 484–490. Isso pula totalmente as duas perguntas e cai direto na tela de itens.

## Correção

### `src/pages/TablesPage.tsx`

- Alterar `openTable(id)` para diferenciar livre vs ocupada:
  - **Livre** (sem `order` em `ordersByTable[id]`): abre o `NewComandaDialog` (mesmo diálogo do botão "Nova Comanda" / F3), pré-selecionando essa mesa específica em vez da "próxima livre".
  - **Ocupada**: comportamento atual (navega direto para `/mesas/:id/pedido`).
- O `onConfirm` do diálogo precisa de uma pequena extensão: quando aberto a partir do clique em uma mesa específica, usa essa mesa em vez de procurar a "primeira livre disponível". Implementado com um estado `targetTableId: string | null` que o handler de `openTable` seta antes de abrir o diálogo, e que é limpo no `onOpenChange(false)`.
- Ajustar a `<p>` de ajuda no diálogo: quando há `targetTableId`, mostrar "Para esta comanda" em vez de "Será aberta na próxima mesa livre disponível". (Pode ser feito via prop opcional `targetTableLabel` no `NewComandaDialog`.)

### `src/components/NewComandaDialog.tsx`

- Aceitar prop opcional `targetTableLabel?: string | null` para personalizar a mensagem do passo 1.

### Não mexer em `TableOrderPage.tsx`

O auto-create permanece como fallback para fluxos legítimos (ex.: deep link direto, garçom-mobile). A correção é só fechar a porta no caminho do caixa pela grade.

## Resultado

- Botão "Nova Comanda" / F3 → diálogo (passo 1 número, passo 2 cliente) → tela de itens. ✅ (já funcionava)
- Clique em mesa **livre** na grade → diálogo (passo 1 número, passo 2 cliente) → tela de itens. ✅ (novo)
- Clique em mesa **ocupada** na grade → tela de itens direta. ✅ (sem mudança)

## Arquivos afetados

- `src/pages/TablesPage.tsx` — `openTable`, estado `targetTableId`, handler `onConfirm` usando `targetTableId` quando setado.
- `src/components/NewComandaDialog.tsx` — prop `targetTableLabel` opcional.
