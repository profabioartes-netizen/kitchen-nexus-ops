# ☕ Coffee Thrones — Agente Local de Impressão

Agente Node.js que roda no notebook do caixa e envia comandos ESC/POS diretamente para as impressoras térmicas via rede TCP.

## Instalação

```bash
cd print-agent
npm install
```

## Uso

```bash
npm start
```

O agente vai:
1. Conectar ao backend e buscar impressoras ativas
2. Fazer polling na fila de impressão (a cada 3s)
3. Reagir em tempo real a novos jobs via Realtime
4. Enviar comandos ESC/POS para o IP:porta de cada impressora
5. Marcar o job como impresso

## Configuração

Edite as variáveis no topo de `agent.mjs` ou use variáveis de ambiente:

| Variável | Descrição | Padrão |
|---|---|---|
| `SUPABASE_URL` | URL do projeto | (pré-configurado) |
| `SUPABASE_ANON_KEY` | Chave anon | (pré-configurado) |
| `POLL_INTERVAL_MS` | Intervalo de polling em ms | `3000` |

## Impressoras

Configure as impressoras no sistema em **Impressoras & Estações** (`/impressoras`):
- Defina o IP e a porta (padrão 9100) de cada impressora térmica
- Associe cada impressora a uma estação (Caixa, Cozinha, Bebidas, Sobremesa)

## Requisitos

- Node.js 18+
- Impressoras térmicas ESC/POS na mesma rede (ex: Epson TM-T20, Elgin i9)
- Portas de rede abertas (padrão: TCP 9100)
