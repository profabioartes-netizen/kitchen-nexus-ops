# HuskyPDV Print Agent

Servidor local em Python (Flask + win32print) que recebe cupons do HuskyPDV e
imprime direto na **impressora padrão do Windows** em modo RAW (ESC/POS).

## 🚀 Como gerar o `.exe` SEM precisar de Python no seu PC

O build é feito automaticamente na nuvem pelo **GitHub Actions** num servidor
Windows. Você (Fábio) só precisa fazer 1 clique:

1. Acesse o repositório no GitHub.
2. Aba **Actions** → workflow **"Build & Release HuskyPrintAgent"**.
3. Clique em **Run workflow** → branch `main` → **Run workflow** (botão verde).
4. Aguarde ~3 minutos. Quando terminar, baixe o `HuskyPrintAgent.exe` em
   **Artifacts** (na própria execução) **ou** publique uma release:

```bash
# alternativa: criar uma tag dispara o build E publica como Release pública
git tag print-agent-v1.0.0
git push origin print-agent-v1.0.0
```

A URL pública e estável do instalador (sempre a última versão) fica em:

```
https://github.com/profabioartes-netizen/kitchen-nexus-ops/releases/latest/download/HuskyPrintAgent.exe
```

> Já está apontada no botão "Baixar HuskyPrintAgent.exe" da tela `/impressoras`.
> Edite `src/pages/PrintersPage.tsx` (constante `INSTALLER_URL`) com o caminho
> real do seu repo (`profabioartes-netizen/kitchen-nexus-ops`).

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

## Build local (opcional, só se já tiver Python)

```bat
cd print-agent-py
build.bat
```

Saída: `dist\HuskyPrintAgent.exe` (~12 MB, sem console).

## Instalação no PC do cliente

1. Baixe o `HuskyPrintAgent.exe` (do botão na tela de Impressoras).
2. Copie para `C:\HuskyPDV\` (ou qualquer pasta).
3. **Iniciar com Windows (recomendado):**
   - `Win+R` → `shell:startup` → Enter.
   - Cole um atalho do `HuskyPrintAgent.exe` nessa pasta.
4. Defina a impressora térmica como **padrão** no Windows.
5. Abra o HuskyPDV → **Impressoras**. O badge deve estar **Online**.

## Troubleshooting

- **Badge fica Offline**: confirme que o `.exe` está rodando (Gerenciador de
  Tarefas → procure `HuskyPrintAgent.exe`).
- **Sai com caracteres estranhos / página em branco**: o driver não está em
  modo texto/RAW. Reinstale com driver "Generic / Text Only" ou ESC/POS.
- **Porta 8080 ocupada**: edite `agent.py`, mude a porta, e ajuste
  `LOCAL_AGENT_URL` em `src/lib/localAgentPrint.ts`.

## Segurança

- Bind apenas em `127.0.0.1` — não fica exposto na rede local.
- Sem autenticação: qualquer app no PC pode imprimir. Aceitável em PDV
  dedicado.
