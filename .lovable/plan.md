## Preparar instalação do agente coffee-print para o cliente

Deixar tudo pronto no repositório para que, no dia da instalação no notebook do Marcelo, baste rodar um único script. Inclui também um botão de "Imprimir teste" no PDV para validar a impressora física.

### 1. Criar diretório `print-agent/` no repositório

Estrutura nova (não afeta o app React):

```text
print-agent/
  package.json
  coffee-print.js          # loop principal (polling de print_jobs)
  renderers.js             # renderBillCompact, renderTest, renderProduction
  .env.example             # template de configuração
  install.sh               # instalação Linux/macOS
  install.bat              # instalação Windows
  README.md                # passo-a-passo para o técnico
```

### 2. `coffee-print.js` — loop do agente

- Conecta no Supabase via `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
- A cada 2s busca jobs com `status = 'pending'` e `tenant_id = TENANT_ID` do `.env`.
- Filtra por `STATION` (ex: "Caixa") configurada por instância.
- Roteia o payload pelo `payload.type`:
  - `bill` + `compact: true` → `renderBillCompact` (snippet já validado)
  - `production` → ticket de cozinha agrupado
  - `test` → ticket de teste curto
  - `cancellation` → ticket de cancelamento
- Marca job como `status = 'printed'` ou `'error'` com mensagem.
- Reconecta automaticamente em caso de falha de rede.

### 3. `.env.example`

```text
SUPABASE_URL=https://rydfhkphvhkqxwpqoeku.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<preencher>
TENANT_ID=<uuid do Espetinho do Marcelo>
STATION=Caixa
PRINTER_DEVICE=/dev/usb/lp0     # Linux
# PRINTER_DEVICE=POS-80          # Windows: nome compartilhado
WIDTH=48                          # 48 para 80mm, 32 para 58mm
POLL_INTERVAL_MS=2000
```

### 4. Scripts de instalação

**`install.sh`** (Linux do Marcelo):
- Verifica Node.js 20+ (instala via nvm se necessário).
- `npm install` no diretório.
- Cria `.env` a partir do template (interativo).
- Instala PM2 globalmente.
- Registra `pm2 start coffee-print.js --name coffee-print`.
- `pm2 save` + `pm2 startup` (para autostart no boot).

**`install.bat`** (caso seja Windows): mesmo fluxo adaptado.

### 5. Botão "Imprimir teste" no PDV

Na página `src/pages/PrintersPage.tsx`, adicionar botão por impressora:
- Insere `print_jobs` com `payload: { type: "test", compact: true, business_name, message: "Teste de impressão OK" }`.
- Toast de confirmação: "Teste enviado — verifique a impressora".
- Útil para validar fisicamente após instalação do agente.

### 6. README.md (passo-a-passo)

Documentação clara para o técnico no dia da instalação:
1. Conectar a impressora térmica no notebook e identificar o device.
2. Clonar/baixar a pasta `print-agent/`.
3. Rodar `./install.sh`.
4. Preencher `.env` com TENANT_ID do Marcelo (obter no painel Super Admin).
5. Validar com botão "Imprimir teste" no PDV.

### Observações técnicas

- **Service role key**: necessária porque o agente roda fora do navegador, sem usuário autenticado. RLS é bypassada — por isso o filtro `tenant_id = TENANT_ID` no código do agente é crítico para isolamento.
- **Não há mudanças no schema do banco** — `print_jobs` já tem todos os campos necessários (`station`, `payload`, `status`, `tenant_id`).
- **Não há mudanças no backend Supabase** — só código do agente standalone + um botão na UI.

### Arquivos a criar/editar

- Criar: `print-agent/package.json`, `print-agent/coffee-print.js`, `print-agent/renderers.js`, `print-agent/.env.example`, `print-agent/install.sh`, `print-agent/install.bat`, `print-agent/README.md`
- Editar: `src/pages/PrintersPage.tsx` (adicionar botão de teste por impressora)
