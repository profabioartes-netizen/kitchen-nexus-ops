## Objetivo

Adicionar um botão **"+ Nova Comanda"** fixo no topo da tela de comandas/mesas. Ao clicar, o atendente digita um número de identificação, escolhe (ou cadastra) o cliente, e o sistema abre automaticamente uma comanda na **próxima mesa livre** disponível.

## Fluxo do usuário

1. Na tela de mesas (`TablesPage`), botão destacado no topo: **"+ Nova Comanda"**.
2. Abre modal **passo 1**: campo numérico "Número da comanda" (rótulo visual, ex.: "12") + botão **Avançar**.
3. Abre modal **passo 2**: 
   - Campo de busca de cliente (filtra por nome/telefone na nova tabela `customers`).
   - Lista de resultados clicáveis. 
   - Botão **"+ Cadastrar novo cliente"** abre sub-formulário inline (Nome*, WhatsApp, Observações, Aniversário).
   - Opção **"Pular / Cliente avulso"** para não vincular cliente.
4. Ao confirmar:
   - Sistema busca a **próxima mesa com `status='free'`** (ordem por `sort_order`/`internal_number`).
   - Chama `get_or_create_open_order` passando essa mesa, com `customer_name` do cliente escolhido e o número digitado salvo em `origin_location` (vira o rótulo visível).
   - Redireciona para `/comanda/:tableId` (TableOrderPage).
5. Se não houver mesa livre → toast de erro: "Não há mesas livres disponíveis. Libere uma mesa antes de criar nova comanda."

## Mudanças no banco

### Nova tabela `customers`
- `id`, `tenant_id` (default + trigger padrão de isolamento)
- `name` (text, not null)
- `phone` (text, opcional, indexado)
- `notes` (text, opcional)
- `birthday` (date, opcional)
- `created_at`, `updated_at`, `last_visit_at`, `visit_count` (int default 0)
- RLS: 4 policies padrão `user_belongs_to_tenant(tenant_id)`
- Trigger `trg_enforce_tenant_id` (mesmo padrão do projeto)
- Índice em `(tenant_id, lower(name))` e `(tenant_id, phone)` para busca rápida

### Coluna nova em `orders`
- `customer_id uuid` (nullable) — vincula a comanda ao cliente cadastrado quando houver.
- Função `get_or_create_open_order` ganha parâmetro opcional `p_customer_id` e atualiza `customers.last_visit_at`/`visit_count` quando informado.

## Mudanças no frontend

### Novo: `src/components/NewComandaDialog.tsx`
Modal com 2 passos (número → cliente). Reaproveita estilos de `TableOpenDialog`.

### Novo: `src/components/CustomerPicker.tsx`
- Input de busca (debounce 200ms) que consulta `customers` por `ilike` em nome/telefone do tenant.
- Lista resultados (até 10).
- Botão "+ Cadastrar novo" abre form inline com validação Zod (Nome obrigatório, telefone com máscara opcional).

### Edição: `src/pages/TablesPage.tsx`
- Adicionar botão **"+ Nova Comanda"** no header, ao lado dos controles existentes.
- Handler abre `NewComandaDialog`.
- Ao confirmar:
  - `nextFreeTable = tables.find(t => t.status === 'free' && t.active)` (ordenado).
  - Chamar `get_or_create_open_order` com `p_table_id`, `p_customer_name`, `p_whatsapp_phone`, `p_location` = número digitado, e novo `p_customer_id`.
  - Navegar para `/comanda/${nextFreeTable.id}`.

### Edição: `src/lib/getOrCreateOpenOrder.ts`
- Aceitar `customerId?: string` opcional e repassar à RPC.

## Fora de escopo

- Tela completa de gerenciamento de clientes (CRUD com edição/exclusão). Por ora só cadastro rápido + busca. Pode virar página própria depois.
- Histórico de visitas detalhado por cliente (apenas contadores agregados nesta entrega).
- Importação em massa de clientes.

## Detalhes técnicos

- Cliente avulso (sem vínculo) continua salvo só em `orders.customer_name`, comportamento atual preservado.
- O número digitado **NÃO** altera `restaurant_tables.internal_number` — vai apenas para `orders.origin_location`/`current_location`, que já é o que o card da comanda exibe.
- Realtime já cobre `orders` e `restaurant_tables`, então o card aparece automaticamente como ocupado.
- Permissões: criar cliente e abrir comanda usa as RLS já existentes do tenant; sem PIN adicional (não é ação destrutiva).
- Validação Zod no form de cliente: `name` 1–100 chars, `phone` regex BR opcional, `notes` ≤ 500.
