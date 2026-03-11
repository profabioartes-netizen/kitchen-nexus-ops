# ☕ Coffee Thrones — Agente Local de Impressão

Agente Node.js que roda no notebook do caixa e envia comandos ESC/POS diretamente via **TCP socket** para impressoras Elgin i9 na rede local.

## Instalação Rápida (Windows)

**Dê dois cliques no `install.bat`** — ele instala tudo automaticamente:
- Dependências npm
- PM2 (gerenciador de processos)
- Configura início automático com Windows

```bash
# Ou manualmente:
cd print-agent
npm install
npm install -g pm2
pm2 start agent.mjs --name "coffee-print"
pm2 save
pm2-startup install
```

## Comandos Úteis

```bash
pm2 logs coffee-print      # Ver logs em tempo real
pm2 restart coffee-print    # Reiniciar agente
pm2 stop coffee-print       # Parar agente
pm2 status                  # Ver status de todos os processos
```

## Desinstalar

Dê dois cliques no `uninstall.bat` ou:

```bash
pm2 stop coffee-print
pm2 delete coffee-print
pm2 save
```

## Como Funciona

```
[Garçom PWA] → [INSERT print_jobs] → [Supabase Realtime WebSocket]
                                             ↓
                                       [Agente Node.js]
                                             ↓
                                    [TCP Socket ESC/POS]
                                             ↓
                                      [ELGIN i9 (rede)]
                                             ↓
                                 [UPDATE status = printed]
```

1. Garçom cria pedido no PWA → itens são inseridos na fila `print_jobs`
2. Agente recebe via **WebSocket** (latência sub-1s)
3. Constrói ticket ESC/POS e envia via **TCP direto** para o IP da impressora
4. Marca job como `printed` ou `error`
5. Health check TCP a cada 10s marca impressoras como Online/Offline

## Impressoras Configuradas

| Estação | Impressora | IP | Porta |
|---|---|---|---|
| Caixa | ELGIN i9 CAIXA | 192.168.4.177 | 9100 |
| Cozinha | ELGIN i9 COZINHAOFC | 192.168.4.166 | 9100 |
| Bebidas | ELGIN i9 BEBIDAS | 192.168.4.155 | 9100 |
| Sobremesa | ELGIN i9 SOBREMESAS | 192.168.4.144 | 9100 |

IPs são configurados na UI em `/impressoras`.

## Controles de Fila

Disponíveis na UI (`/impressoras`):
- **Limpar fila** — remove todos os jobs pendentes/erro
- **Reimprimir** — reenvia um job individual
- **Cancelar job** — marca como cancelado
- **Indicador de agente** — mostra se o agente está conectado em tempo real

## Requisitos

- **Windows 10/11**
- Node.js 18+
- Impressoras Elgin i9 conectadas via Ethernet na rede local
- Porta 9100 acessível
