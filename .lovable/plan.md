## Problema

Para produtos vendidos por peso (ex.: "Refeição - 378g"), na impressão a coluna **UNIT** está mostrando o valor total do peso (R$ 30,20), e não o **preço do kg** configurado no produto. A coluna **QNT** também aparece como `1` em vez do peso.

Isso ocorre porque `order_items.price` guarda o subtotal do pesado (gramas × R$/kg) e `quantity = 1`. Os renderers de impressão hoje só recebem `{quantity, price}`, sem saber que é venda por peso.

## Solução

Enriquecer cada item no payload de impressão com metadados de venda por peso e ajustar todos os renderers para exibir, nesses casos:

- **QNT** → `0,378 kg` (ou `378 g`)
- **UNIT** → `R$ 50,00` (preço por kg)
- **TOTAL** → continua o mesmo (price × quantity)

### Onde alterar

**1. Origem dos dados** — buscar `sale_type` e `price_per_kg` dos produtos referenciados pelos itens (já temos `product_id` em `order_items`):

- `src/pages/TableOrderPage.tsx` (mutation `printBill`)
- `src/components/PaymentPanel.tsx` (recibo de pagamento)
- `src/pages/CashierPage.tsx` (`printBill`, `printReceipt`, `handleFinalizeAndPrint`)
- `src/pages/waiter/WaiterOrderPage.tsx` (impressão de cozinha — opcional, peso aparece só no nome)

Em cada lugar, fazer um `select id, sale_type, price_per_kg` em `products` para os IDs dos itens e adicionar ao payload de cada item:
```ts
{
  product_name, quantity, price,
  sale_type: 'weight' | 'unit',
  price_per_kg: number | null,
  grams: number | null,   // extraído do product_name "... - 378g"
  complements: [...],
}
```

`grams` é derivado do sufixo do nome (já é o padrão atual em `AddItemDialog.handleAdd`: `"${product.name} - ${gramsNum}g"`).

**2. Renderers** — quando `sale_type === 'weight'`:

- `src/lib/browserPrint.ts` (linhas 50-65 — montagem de `<tr>`):
  - Coluna QNT → `${(grams/1000).toFixed(3).replace('.',',')} kg`
  - Coluna UNIT → preço por kg formatado
  - Limpar o sufixo `" - 378g"` do nome (já está na coluna QNT)

- `print-agent/agent.mjs` (linhas 678-699 — loop de itens do recibo):
  - Mesma lógica: trocar `qty` e `unitStr` quando `item.sale_type === 'weight'`
  - Usar `item.price_per_kg` para UNIT
  - `item.grams/1000` formatado como `0,378 kg` para QTD

- `supabase/functions/generate-print-agent-installer/agent-source.ts`:
  - Esse arquivo é uma cópia "embedada" de `print-agent/agent.mjs` usada pelo instalador. Aplicar a mesma alteração para que novos instaladores gerados saiam corretos.

- `desktop-agent/src/render.ts` (renderer Tauri novo):
  - O loop de itens do recibo (`type === 'payment_receipt'`) precisa do mesmo tratamento condicional.

- `src/pages/print/PrintReceiptPage.tsx` (recibo HTML alternativo):
  - Mesmo ajuste nas colunas QNT/UNIT.

### Detalhes técnicos

- **Identificar peso sem mudar schema**: usamos `sale_type === 'weight'` vindo de `products` no payload. Não precisa migrar `order_items`.
- **Extração de gramas**: usar regex `/(\d+)\s*g\s*$/i` no `product_name`. Fallback: se não der parse, calcular `Math.round((price / price_per_kg) * 1000)`.
- **Formato**: `qtdKg = (grams/1000).toFixed(3).replace('.', ',')` → `"0,378"`. Concatenar `" kg"` na coluna QNT (no agent ESC/POS pode ficar `"0,378kg"` para caber em 4 colunas; verificar largura).
- **Compatibilidade**: itens unitários continuam funcionando (campos novos `sale_type/price_per_kg/grams` são opcionais; renderers só agem quando `sale_type === 'weight'`).
- **Limpeza do nome**: opcional remover `" - 378g"` do nome impresso (já que aparece na coluna QNT). Manter por enquanto para não quebrar layout de tickets de cozinha.

## Resultado esperado no recibo

```
PRODUTO                       QNT       UNIT    TOTAL
Refeição                   0,378 kg    50,00    30,20
```
