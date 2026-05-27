## Objetivo

Marcar clientes como **VIP** (mensalistas que pagam depois) e destacar visualmente suas comandas em **amarelo** no mapa de mesas, além de permitir filtrar VIPs na tela de Clientes.

---

## 1. Banco de dados

Adicionar coluna na tabela `customers`:

- `is_vip boolean NOT NULL DEFAULT false`
- Índice parcial `idx_customers_vip ON customers(tenant_id) WHERE is_vip = true` para acelerar o filtro.

Nenhuma alteração em RLS (a policy de tenant já cobre).

---

## 2. CustomersPage (cadastro/edição)

- No formulário de cliente (`CustomersPage.tsx`), adicionar checkbox **"Cliente VIP (mensalista)"** com ícone de coroa/estrela amarela e um texto-ajuda curto explicando o efeito (comanda fica amarela).
- Na listagem, exibir um badge amarelo "VIP" ao lado do nome dos clientes marcados.
- **Ao lado da barra de pesquisa**, adicionar um toggle/chip de filtro **"Apenas VIPs"** (Crown icon, amarelo quando ativo). O filtro é aplicado client-side sobre a query existente.

---

## 3. CustomerPicker (seleção na criação de comanda)

- No `CustomerPicker.tsx` (usado no `NewComandaDialog`), exibir o badge VIP ao lado do nome do cliente nos resultados, para o garçom já reconhecer no momento da abertura.

---

## 4. Destaque amarelo da comanda VIP

Hoje, comandas abertas/aguardando aparecem em **lilás/roxo**. Vamos derivar a cor a partir de `order.customer.is_vip`.

### 4.1 Query

Em `TablesPage.tsx` e `WaiterTablesPage.tsx`, expandir a query de `orders` para trazer `customer:customers(is_vip)` junto (join via `customer_id`), ou buscar em paralelo um `Set<vipCustomerId>` por tenant e cruzar em memória. Recomendado: **embed do customer** na própria query de orders abertos, já filtrado por tenant.

### 4.2 Token semântico

Em `src/index.css` e `tailwind.config.ts`, criar:

- `--vip: <amarelo HSL>` (ex: dourado quente, alinhado ao "Coffee Thrones Gold")
- `--vip-foreground`
- `--vip-border`

E classes utilitárias `bg-vip`, `text-vip`, `border-vip`.

### 4.3 Aplicação nos cards

No card da comanda (grade de mesas — desktop e waiter mobile):

- Se `order.customer?.is_vip === true`: usar fundo/borda **amarelo VIP** no lugar do lilás.
- Mantém os demais estados (verde = entregue, etc.) — VIP só substitui o roxo de "aguardando/aberta".
- Adicionar um pequeno chip "VIP" (Crown icon) no canto superior do card para reforçar.

### 4.4 Popover de preview da comanda

No popover de preview (`OrderSelector`/preview de mesa), exibir também o badge VIP ao lado do nome do cliente.

---

## 5. Arquivos afetados

- **Migração SQL**: nova coluna + índice em `customers`.
- `src/pages/CustomersPage.tsx` — checkbox VIP, badge na lista, filtro "Apenas VIPs" ao lado da busca.
- `src/components/CustomerPicker.tsx` — badge VIP nos resultados.
- `src/pages/TablesPage.tsx` — join `customer.is_vip`, cor amarela no card.
- `src/pages/waiter/WaiterTablesPage.tsx` — mesma lógica para o mobile do garçom.
- `src/components/OrderSelector.tsx` (preview) — badge VIP.
- `src/index.css` + `tailwind.config.ts` — tokens `--vip*`.
- `src/integrations/supabase/types.ts` — regerado automaticamente após a migração.

---

## 6. Fora de escopo (proposto, confirmar se quiser depois)

- Relatório separado de "saldo aberto de VIPs / mensalistas".
- Bloqueio de fechamento automático ou regras de cobrança recorrente.

Se concordar, ao aprovar eu já rodo a migração e implemento os ajustes de UI.