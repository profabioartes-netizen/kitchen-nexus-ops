## Bug

Após selecionar/cadastrar o cliente em "Nova Comanda", a navegação envia o usuário para `/comanda/<id>`, mas essa rota não existe no `App.tsx`. A rota correta da página de pedido é `/mesas/:tableId/pedido` (já usada nos outros pontos do `TablesPage`).

## Correção

`src/pages/TablesPage.tsx` (linha ~1448): trocar

```ts
navigate(`/comanda/${freeTable.id}`);
```

por

```ts
navigate(`/mesas/${freeTable.id}/pedido`);
```

Sem outras mudanças. Após o ajuste, o fluxo "Nova Comanda → escolher cliente → Confirmar" abrirá a comanda recém-criada normalmente.
