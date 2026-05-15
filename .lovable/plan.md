## Tela de Clientes Cadastrados

Criar uma página dedicada `/clientes` para visualizar, editar e gerenciar todos os clientes cadastrados no sistema (atualmente só é possível cadastrar via popup ao criar nova comanda).

### Onde fica

- Nova rota `/clientes` no `src/App.tsx`, dentro do bloco autenticado (`BlockWaiter` para não aparecer para garçom).
- Novo item no menu lateral (`src/components/NavigationRail.tsx`) na seção **Gestão**, com ícone `Users` e label "Clientes".

### O que a tela mostra

Página `src/pages/CustomersPage.tsx` com:

- **Cabeçalho**: título "Clientes" + botão "Novo Cliente" + campo de busca (por nome ou telefone, ilike, debounce 200ms).
- **Tabela / lista de cards** (responsivo — tabela no desktop, cards empilhados no mobile) listando:
  - Nome, telefone/WhatsApp, aniversário, nº de visitas, última visita (data relativa), data de cadastro.
  - Ações por linha: **Editar** e **Excluir** (com confirmação).
- **Paginação** simples (50 por página) ou scroll infinito — usar paginação por offset.
- **Estado vazio** amigável quando não houver clientes ou busca não retornar nada.

### Modal de criar / editar

Um único `Dialog` reaproveitado para criar e editar, com os campos da tabela `customers`:
- `name` (obrigatório, máx 100)
- `phone` (opcional, máx 20)
- `birthday` (date, opcional)
- `notes` (textarea, máx 500)

Validação com `zod` (mesmo schema usado em `CustomerPicker`). Tenant é preenchido automaticamente pela trigger.

### Detalhes técnicos

- Usar `@tanstack/react-query` com query keys `["customers", search, page]` e invalidar após mutações.
- Mutações: `insert`, `update` (por id) e `delete` (por id) em `customers` via cliente Supabase. RLS já cobre isolamento por tenant.
- Excluir é hard delete — mostrar `AlertDialog` de confirmação alertando que comandas antigas mantêm o nome do cliente em `orders.customer_name` (não há FK, então delete é seguro), mas perderão o vínculo `customer_id`.
- Campos de leitura `visit_count` e `last_visit_at` mostrados, sem edição (atualizados automaticamente por `get_or_create_open_order`).
- Sem alterações de schema, sem alterações em edge functions.
- Reaproveitar componentes shadcn já existentes (`Dialog`, `AlertDialog`, `Input`, `Button`, `Table`).

### Arquivos afetados

- **Novo**: `src/pages/CustomersPage.tsx`
- **Editar**: `src/App.tsx` (registrar rota), `src/components/NavigationRail.tsx` (adicionar item de menu).
