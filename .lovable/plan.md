## Objetivo

Substituir a dependência de Chrome `--kiosk-printing` por um **Agente Local em Python** que recebe o cupom já formatado e envia direto para a impressora padrão do Windows via `win32print` em modo RAW (ESC/POS-friendly). O front continua com fallback nativo (`window.print` via iframe) caso o agente esteja offline.

## Resultado para o cliente

- Instala um único `HuskyPrintAgent.exe` (sem console, fica rodando em background).
- Define a impressora térmica como padrão no Windows.
- Clica em "Imprimir" no HuskyPDV → papel sai. Sem janela do navegador, sem kiosk-printing.

---

## Parte 1 — Novo projeto: `print-agent-py/`

Pasta separada do app (igual a `desktop-agent/` e `caixa-launcher/`).

```text
print-agent-py/
├── agent.py              # Flask + win32print + CORS
├── requirements.txt      # flask, flask-cors, pywin32, pyinstaller
├── build.bat             # pyinstaller --onefile --noconsole --name HuskyPrintAgent agent.py
├── icon.ico              # ícone do executável (reusa o do caixa-launcher)
└── README.md             # instruções de instalação, troubleshooting, build
```

### `agent.py` (resumo)

- `GET  /ping` → `{ "ok": true, "version": "1.0.0", "printer": "<nome impressora padrão>" }` para o indicador "Online/Offline" do front.
- `POST /print` body `{ "content": "<texto monoespaçado>", "copies": 1 }` →
  - abre `win32print.GetDefaultPrinter()`,
  - `StartDocPrinter(... "RAW")` + `WritePrinter(content.encode("utf-8"))`,
  - retorna `200 { "status": "success" }` ou `500 { "status": "error", "message": "..." }`.
- `flask_cors.CORS(app, resources={r"/*": {"origins": "*"}})` para o site do Lovable poder chamar `127.0.0.1:8080`.
- `app.run(host="127.0.0.1", port=8080)` — somente loopback, sem expor à rede.

### Build (Windows)

```bash
pip install -r requirements.txt
pyinstaller --onefile --noconsole --name HuskyPrintAgent --icon icon.ico agent.py
```

Saída: `dist/HuskyPrintAgent.exe` (sem console, abre na bandeja silenciosamente). Distribuímos esse `.exe` pela pasta `public/downloads/` ou release do GitHub.

### Auto-start no Windows (opcional, no README)

Atalho em `shell:startup` apontando para o `.exe` → roda toda vez que o Windows liga.

---

## Parte 2 — Cliente HuskyPDV (já existe `src/lib/localAgentPrint.ts`)

Hoje o cliente envia o **JSON estruturado** (`BrowserPrintPayload`) para `/print`. O agente Python espera `{ content: "<texto>" }`. Precisamos formatar o cupom em **texto monoespaçado 48 colunas (80mm) / 32 colunas (58mm)** no cliente.

### 2.1 Novo módulo `src/lib/receiptText.ts`

`formatReceiptText(payload: BrowserPrintPayload): string` — gera string com:
- cabeçalho centralizado (nome, telefone, MESA, "NÃO É DOCUMENTO FISCAL"),
- separadores `--------------------------------------------`,
- itens em colunas (`PRODUTO ........ QNT  UNIT  TOTAL`) com padding,
- complementos indentados,
- totais (`PRODUTOS:`, `TOTAL:`),
- pagamento / troco,
- "Volte sempre!!!" + 5 quebras de linha (avanço de papel),
- `\x1d\x56\x00` no final → comando ESC/POS para corte automático (impressoras térmicas que suportam ignoram silenciosamente as outras).

### 2.2 Atualizar `src/lib/localAgentPrint.ts`

- `printViaLocalAgent(payload)` passa a enviar `{ content: formatReceiptText(payload), copies: 1 }`.
- Mantém timeout 2.5s, fallback para `printViaBrowser(payload)` quando agente offline ou retorna != 200.
- `pingLocalAgent()` continua chamando `GET /ping` — agora retorna também o nome da impressora padrão para mostrar na tela de configurações.

### 2.3 `src/pages/PrintersPage.tsx`

- Indicador já existe (Online/Offline). Adicionar abaixo do badge **Online**: `Impressora padrão: <nome>` (vindo do `/ping`).
- Trocar a seção "HuskyPDV Caixa" por **"HuskyPDV Print Agent"** com botão `Baixar HuskyPrintAgent.exe` apontando para `https://huskypdv.com/downloads/HuskyPrintAgent.exe` (mesmo padrão de download puro `<a download>` que já está implementado, sem navegação).
- Manter botão "Testar Impressão" — ele já passa por `printViaLocalAgent`.

---

## Parte 3 — Distribuição do `.exe`

Duas opções (escolher na hora de buildar):

1. **GitHub Release** no repo do agente → URL fixa, fácil de versionar.
2. **`public/downloads/HuskyPrintAgent.exe`** dentro do projeto Lovable → servido pelo próprio domínio (`huskypdv.com/downloads/...`).

Recomendado: GitHub Release (binário pesa ~10–15 MB com PyInstaller; evita inflar o bundle do Vite). O botão de download apenas linka para a release.

---

## Detalhes técnicos

### Por que RAW e não GDI

`win32print` em modo RAW envia bytes direto ao driver. Para impressoras térmicas com driver "Generic / Text Only" ou drivers ESC/POS, isso significa: o que mandar sai no papel, monoespaçado, instantâneo, sem renderização gráfica. É o mesmo caminho usado por PDVs profissionais.

### CORS e mixed-content

O HuskyPDV roda em **HTTPS** (`huskypdv.com`) e o agente em **HTTP** (`127.0.0.1:8080`). Navegadores modernos (Chrome/Edge/Firefox) **permitem** fetch de página HTTPS para `127.0.0.1` / `localhost` justamente para esse caso (exceção da spec "Secure Contexts"). Não precisa de certificado.

### Segurança

- Bind apenas em `127.0.0.1` (não escuta em `0.0.0.0`).
- Sem autenticação (loopback only) — qualquer app no PC pode imprimir, o que é aceitável para um PDV dedicado.
- Se quisermos endurecer no futuro: header `X-Husky-Token` com token gerado no primeiro start e mostrado uma vez.

### Memória

Atualizar `mem://features/print-agent-saas` para refletir a nova arquitetura Python + RAW (substituindo o agente Tauri/Deno antigo) e marcar `caixa-launcher` como **opcional** (não mais necessário se o agente estiver instalado).

---

## Arquivos a criar/alterar

**Criar**
- `print-agent-py/agent.py`
- `print-agent-py/requirements.txt`
- `print-agent-py/build.bat`
- `print-agent-py/README.md`
- `src/lib/receiptText.ts`

**Alterar**
- `src/lib/localAgentPrint.ts` (envia `{ content }`, ping retorna printer name)
- `src/pages/PrintersPage.tsx` (botão de download do novo agente, mostrar impressora padrão)

**Não tocar**
- `src/lib/browserPrint.ts` (continua sendo o fallback nativo)
- `src/components/PaymentPanel.tsx` e `src/pages/TableOrderPage.tsx` (já chamam `printViaLocalAgent`, não precisam mudar)

---

## Critério de aceite

1. Cliente instala `HuskyPrintAgent.exe`, define a térmica como padrão no Windows.
2. Tela de Impressoras mostra **"Agente Local: Online"** + nome da impressora padrão detectada.
3. Clicar em "Testar Impressão" → cupom de teste sai no papel **sem abrir nenhuma janela**.
4. Imprimir conta na comanda → cupom sai monoespaçado, alinhado, com totais.
5. Fechar o agente → badge muda para **Offline**, e ao imprimir cai automaticamente no `window.print()` (fallback funcional).
6. Trocar a impressora padrão no Windows (Elgin → Epson) → próxima impressão sai na nova, sem mexer no código.
