## Objetivo
Trocar a URL do botão "Baixar HuskyPDV Agent (Windows)" para o link definitivo da release publicada no GitHub.

## Mudança
**Arquivo:** `src/pages/PrintersPage.tsx`

Substituir a constante `INSTALLER_URL`:

De:
```
https://github.com/profabioartes-netizen/kitchen-nexus-ops/releases/latest/download/HuskyPrintAgent.exe
```

Para:
```
https://github.com/profabioartes-netizen/kitchen-nexus-ops/releases/download/print-agent-v1.0.0/HuskyPrintAgent.exe
```

Também atualizar o comentário acima da constante para refletir que agora aponta para a tag fixa `print-agent-v1.0.0` (em vez da `latest`), garantindo que o download funcione imediatamente, sem depender do alias `latest`.

## Observação
O restante do fluxo (nome do arquivo `HuskyPrintAgent.exe`, instruções, workflow do GitHub Actions) permanece inalterado — apenas a URL muda de `latest/download` para a tag específica `print-agent-v1.0.0`.