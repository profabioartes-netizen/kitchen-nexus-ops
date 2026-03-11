# ☕ Coffee Thrones — Agente Local de Impressão

Agente Node.js que roda no notebook do caixa e envia comandos ESC/POS diretamente para o **Windows Print Spooler** (modo padrão) ou via TCP para impressoras de rede.

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
2. Enviar dados RAW ESC/POS para o **Windows Print Spooler** usando `winspool.drv`
3. Se o WebSocket desconectar → **fallback polling** automático (a cada 5s)
4. Marcar o job como `printed` ou `error` (sem retry automático)
5. Fazer health check das impressoras a cada 10s

## Modos de Impressão

### Windows Spooler (padrão)
Envia dados RAW diretamente para o spooler do Windows, sem diálogo de impressão e sem `window.print()`. Usa a API `winspool.drv` via PowerShell para bypassar o driver e enviar bytes ESC/POS puros.

```bash
# Modo padrão — Windows Spooler
npm start

# Ou explicitamente
PRINT_MODE=spooler npm start
```

### TCP Direto (rede)
Para impressoras configuradas com IP/porta na rede local.

```bash
PRINT_MODE=tcp npm start
```

## Mapeamento Estação → Impressora Windows

| Estação | Impressora Windows | Variável de ambiente |
|---|---|---|
| Caixa | `ELGIN i9 CAIXA` | `PRINTER_CAIXA` |
| Cozinha | `ELGIN i9 COZINHAOFC` | `PRINTER_COZINHA` |
| Bebidas | `ELGIN i9 BEBIDAS` | `PRINTER_BEBIDAS` |
| Sobremesa | `ELGIN i9 SOBREMESAS` | `PRINTER_SOBREMESA` |

Para alterar os nomes das impressoras:

```bash
PRINTER_CAIXA="Outro Nome" npm start
```

## Configuração

| Variável | Descrição | Padrão |
|---|---|---|
| `SUPABASE_URL` | URL do projeto | (pré-configurado) |
| `SUPABASE_ANON_KEY` | Chave anon | (pré-configurado) |
| `POLL_INTERVAL_MS` | Intervalo de polling fallback em ms | `5000` |
| `PRINT_MODE` | `spooler` (Windows) ou `tcp` (rede) | `spooler` |

## Arquitetura

```
[Pedido] → [INSERT print_jobs] → [Supabase Realtime WebSocket]
                                         ↓
                                   [Agente Node.js]
                                         ↓
                            [Windows Spooler / RAW ESC/POS]
                                         ↓
                              [ELGIN i9 (USB/rede)]
                                         ↓
                             [UPDATE status = printed]
```

## Controles de Fila

Todos os controles estão disponíveis na UI (`/impressoras`):
- **Limpar fila** — remove todos os jobs pendentes/erro
- **Reimprimir** — reenvia um job individual
- **Cancelar job** — marca como cancelado
- **Pausar/Retomar agente** — controla o processamento

## Requisitos

- **Windows 10/11** com PowerShell 5.1+
- Node.js 18+
- Impressoras Elgin i9 instaladas como impressoras Windows
- As impressoras devem estar visíveis em `Painel de Controle > Dispositivos e Impressoras`
