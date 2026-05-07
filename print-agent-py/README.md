# HuskyPDV Print Agent

Servidor local em Python (Flask + win32print) que recebe cupons do HuskyPDV e
imprime direto na **impressora padrão do Windows** em modo RAW (ESC/POS).

## Como funciona

- Escuta em `http://127.0.0.1:8080` (somente loopback).
- O HuskyPDV envia `POST /print` com `{ "content": "<texto>" }`.
- O agente repassa os bytes ao Spooler em modo `RAW`, sem renderização gráfica.
- Se o agente estiver offline, o HuskyPDV cai automaticamente no
  `window.print()` do navegador (fallback nativo).

## Endpoints

- `GET  /ping` → `{ "ok": true, "version": "1.0.0", "printer": "Elgin i9" }`
- `POST /print` body:
  ```json
  { "content": "...texto monoespaçado...", "copies": 1, "printer": "opcional" }
  ```

## Build (Windows)

Pré-requisito: Python 3.10+.

```bat
cd print-agent-py
build.bat
```

Saída: `dist\HuskyPrintAgent.exe` (~12 MB, sem console).

## Instalação no PC do cliente

1. Copie `HuskyPrintAgent.exe` para `C:\HuskyPDV\`.
2. **Iniciar com Windows (recomendado):**
   - Pressione `Win+R` → digite `shell:startup` → Enter.
   - Cole um atalho do `HuskyPrintAgent.exe` nessa pasta.
3. Defina a impressora térmica como **padrão** no Windows
   (Configurações → Bluetooth e dispositivos → Impressoras).
4. Abra o HuskyPDV. Em **Impressoras**, o badge deve aparecer como
   **Agente Local: Online**.

## Troubleshooting

- **Badge fica Offline**: confirme que o `.exe` está rodando
  (Gerenciador de Tarefas → procure `HuskyPrintAgent.exe`).
- **Sai com caracteres estranhos**: o driver da impressora não está em modo
  texto/RAW. Reinstale com o driver "Generic / Text Only" ou ESC/POS.
- **Sai página em branco / muito grande**: a impressora está usando driver GDI
  com renderização gráfica. Mesma solução do item anterior.
- **Porta 8080 ocupada**: edite `agent.py` e mude para outra porta; também
  ajuste `LOCAL_AGENT_URL` em `src/lib/localAgentPrint.ts`.

## Segurança

- Bind apenas em `127.0.0.1` — não fica exposto na rede local.
- Sem autenticação: qualquer app no PC pode imprimir. Aceitável em PDV
  dedicado.
