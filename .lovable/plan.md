## Objetivo

Na tela **Vendas** (`/vendas`):
1. Adicionar botão **"Reimprimir"** em cada linha de venda (mesmo finalizadas), que envia o cupom novamente para a impressora via Print Agent local (com fallback para impressão nativa do navegador).
2. Adicionar **barra de pesquisa** para filtrar vendas por nome do cliente.

## Mudanças

### `src/pages/SalesPage.tsx`

**Pesquisa por cliente**
- Novo estado `searchCustomer` (string).
- Input de busca posicionado ao lado do filtro "Pagamento" (ícone de lupa, placeholder "Buscar por cliente…").
- `filteredOrders` passa a aplicar também: `o.customer_name?.toLowerCase().includes(searchCustomer.trim().toLowerCase())` quando o termo não estiver vazio (case-insensitive, sem acentos via `normalize`).
- `setPage(0)` ao digitar, para resetar paginação.

**Botão Reimprimir**
- Novo botão `Printer` em cada `OrderRow` (coluna de ações, ao lado do chevron). Visível em todos os tamanhos.
- Também disponível dentro do bloco expandido (`ExpandedDetails`), mais largo, para uso fácil no mobile.
- Ao clicar:
  1. Busca em paralelo: `restaurant_settings` (business_name, business_phone), `order_items` completo (com `id`, `product_id`, `product_name`, `quantity`, `price`), `order_item_complements` dos itens, e `restaurant_tables` (já em cache via `tableMap`).
  2. Monta `billPayload` no mesmo formato usado em `PaymentPanel.tsx` (type `"bill"`, business_name/phone, location, table_name, customer_name, waiter_name, items com complementos, total, payment_method concatenado, change para dinheiro, footer "Volte sempre!!!", paper "80mm").
  3. Chama `printViaLocalAgent(payload)` de `@/lib/localAgentPrint`.
  4. Toast de sucesso/erro idêntico ao do PaymentPanel ("Impressão enviada" / "Imprimindo conta..." / "Não foi possível abrir a impressão.").
- Estado `reprintingId` para mostrar `Loader2` no botão da linha em impressão e desabilitá-lo.

**Pequenos ajustes**
- Reaproveitar `methodLabels` já existente para montar `payment_method`.
- Não alterar regras de RLS / consultas existentes — apenas adicionar fetches sob demanda no clique.
- Sem mudanças em `localAgentPrint.ts`, `PaymentPanel.tsx` ou demais arquivos.

## Critério de aceite

- Digitando "rogerio" no campo de busca, aparecem só vendas cujo cliente contenha "rogerio" (case-insensitive).
- Clicar em "Reimprimir" em uma venda já finalizada envia o cupom para a mesma impressora usada no fechamento (com fallback de navegador se o agente estiver offline), exatamente como o botão 🧾 do PaymentPanel.
