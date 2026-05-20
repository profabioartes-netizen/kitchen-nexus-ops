# Sincronia em tempo real entre Caixa e Garçom

## Diagnóstico (causa raiz encontrada)

Verifiquei a publicação `supabase_realtime` no banco e o resultado é alarmante:

```
publication tables:
- usb_printer_discoveries   ← única tabela publicada
```

**Nenhuma das tabelas operacionais (`orders`, `order_items`, `restaurant_tables`, `comanda_locks`, `payments`) está incluída na publicação de Realtime.**

Isso significa que:
- Tanto a tela do **Caixa** (`TablesPage`) quanto o **PWA do Garçom** (`WaiterTablesPage`/`WaiterOrdersPage`) chamam `useTenantRealtime` corretamente e abrem o canal — mas o Postgres **nunca emite eventos** dessas tabelas para o Realtime.
- O painel só atualiza quando o React Query refaz a query por outro motivo (foco da janela, recarregar manual, intervalo de poll). Daí a sensação de "demora" ou "não aparece" no caixa quando o garçom lança uma comanda nova.

Também detectei que `restaurant_tables`, `comanda_locks` e `order_item_complements` estão com `REPLICA IDENTITY DEFAULT` (apenas a PK no payload `old`). Para o hook `useTenantRealtime` filtrar UPDATEs por "colunas significativas" via comparação `old vs new`, é obrigatório `REPLICA IDENTITY FULL` (já está OK em `orders`, `order_items`, `payments`).

## O que será feito

### 1. Migration de Realtime

Uma única migration que:

- **Adiciona à publicação `supabase_realtime`** as tabelas:
  - `orders`
  - `order_items`
  - `order_item_complements`
  - `restaurant_tables`
  - `comanda_locks`
  - `payments`
  - `table_activity_log` (para a timeline aparecer ao vivo no preview da comanda)
  - `self_service_sessions` (para sessões de QR code refletirem na hora)

- **Seta `REPLICA IDENTITY FULL`** em:
  - `restaurant_tables`
  - `comanda_locks`
  - `order_item_complements`
  - `table_activity_log`
  - `self_service_sessions`

Tudo idempotente (`IF NOT EXISTS` / checagem em `pg_publication_tables`) para poder rodar sem riscos.

### 2. Nenhuma mudança no frontend

O hook `useTenantRealtime` e os canais já estão certos — só faltava o Postgres realmente publicar os eventos. Após a migration, os eventos passam a fluir e a invalidação do React Query roda em ~250ms (debounce já configurado), atualizando o caixa imediatamente quando o garçom lança/altera comanda.

## Detalhes técnicos

- Multi-tenant: o filtro por `tenant_id` já é aplicado no servidor pelo canal (`filter: tenant_id=eq.${tenantId}`), então adicionar as tabelas à publicação **não** aumenta tráfego entre tenants — cada cliente só recebe eventos do próprio tenant.
- `REPLICA IDENTITY FULL` aumenta levemente o tamanho do WAL para UPDATEs nessas tabelas, mas é necessário para o filtro de "colunas significativas" funcionar (sem ele, todo UPDATE invalidaria queries, ficando pior).
- A regra do projeto em `mem://tech/realtime-architecture` (REPLICA IDENTITY FULL requerido) será reforçada com esta migration.

## Risco

Baixo. Migration apenas adiciona tabelas a uma publicação e ajusta replica identity; não altera dados nem schema das tabelas. Reversível.
