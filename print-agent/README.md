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
1. Conectar ao backend via **WebSocket (Realtime)** para receber jobs instantaneamente
2. Se o WebSocket desconectar, ativar **fallback polling** automático (a cada 5s)
3. Enviar comandos ESC/POS para o IP:porta de cada impressora
4. Marcar o job como impresso ou erro (sem retry automático)
5. Fazer health check das impressoras a cada 10s

## Arquitetura

```
[Novo Pedido] → [print_jobs INSERT] → [Supabase Realtime WebSocket]
                                              ↓
                                      [Agente Node.js]
                                              ↓
                                    [TCP → Impressora ESC/POS]
                                              ↓
                                   [UPDATE status = printed]
```

Se o WebSocket cair:
```
[Agente] → [Polling a cada 5s] → [SELECT pending jobs] → [Impressão]
```

## Configuração

Edite as variáveis no topo de `agent.mjs` ou use variáveis de ambiente:

| Variável | Descrição | Padrão |
|---|---|---|
| `SUPABASE_URL` | URL do projeto | (pré-configurado) |
| `SUPABASE_ANON_KEY` | Chave anon | (pré-configurado) |
| `POLL_INTERVAL_MS` | Intervalo de polling fallback em ms | `5000` |

## Impressoras

Configure as impressoras no sistema em **Impressoras & Estações** (`/impressoras`):
- Defina o IP e a porta (padrão 9100) de cada impressora térmica
- Associe cada impressora a uma estação (Caixa, Cozinha, Bebidas, Sobremesa)

### Impressoras Windows compatíveis
- ELGIN i9 CAIXA
- ELGIN i9 COZINHAOFC
- ELGIN i9 BEBIDAS
- ELGIN i9 SOBREMESAS

## Requisitos

- Node.js 18+
- Impressoras térmicas ESC/POS na mesma rede (ex: Epson TM-T20, Elgin i9)
- Portas de rede abertas (padrão: TCP 9100)
