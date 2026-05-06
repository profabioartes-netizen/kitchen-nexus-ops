## Problema

O erro "Usuário sem tenant vinculado não pode inserir dados" aparece porque o usuário `minhaeradigital@gmail.com` (dono do tenant "Fábio Teste") **não tem registro na tabela `profiles`**, mesmo tendo vínculo válido em `user_tenants` com o tenant `71e98c23-...` como `admin_cliente`.

A função `current_tenant_id()` consulta apenas `profiles.tenant_id`, retorna NULL, e o trigger `enforce_tenant_id` bloqueia toda inserção/edição (categorias, produtos, configurações, etc.).

Outros usuários novos provavelmente terão o mesmo problema se o trigger de criação de profile não rodar / não preencher tenant_id.

## Correção (migration SQL)

1. **Backfill imediato**: criar/atualizar `profiles` para todos os usuários que já têm vínculo ativo em `user_tenants` mas estão sem `tenant_id` em `profiles`.
   ```sql
   INSERT INTO public.profiles (id, tenant_id)
   SELECT ut.user_id, ut.tenant_id
   FROM public.user_tenants ut
   WHERE ut.active = true
   ON CONFLICT (id) DO UPDATE
     SET tenant_id = COALESCE(public.profiles.tenant_id, EXCLUDED.tenant_id);
   ```

2. **Tornar `current_tenant_id()` resiliente**: fallback para `user_tenants` quando `profiles.tenant_id` for NULL — assim, mesmo que o profile não exista, o tenant é resolvido.
   ```sql
   CREATE OR REPLACE FUNCTION public.current_tenant_id(_user_id uuid DEFAULT auth.uid())
   RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
     SELECT COALESCE(
       (SELECT tenant_id FROM public.profiles WHERE id = _user_id),
       (SELECT tenant_id FROM public.user_tenants
         WHERE user_id = _user_id AND active = true
         ORDER BY created_at ASC LIMIT 1)
     )
   $$;
   ```

3. **Trigger de auto-sync**: quando uma linha for criada/atualizada em `user_tenants`, garantir que o `profiles.tenant_id` do usuário fique preenchido.
   ```sql
   CREATE OR REPLACE FUNCTION public.sync_profile_tenant() ...
     INSERT INTO profiles(id, tenant_id) VALUES (NEW.user_id, NEW.tenant_id)
     ON CONFLICT (id) DO UPDATE SET tenant_id = COALESCE(profiles.tenant_id, EXCLUDED.tenant_id);
   CREATE TRIGGER trg_sync_profile_tenant AFTER INSERT OR UPDATE ON user_tenants ...
   ```

## Resultado

- Fábio Teste consegue salvar configurações, criar categorias e produtos imediatamente.
- Novos clientes onboardados via convite/edge function não cairão mais nesse buraco.
- Nenhuma mudança de UI necessária.
