# HuskyPDV — Print Agent (`coffee-print`)

Agente local que roda no notebook do estabelecimento e processa a fila de impressão (`print_jobs`) do HuskyPDV, enviando os tickets para a impressora térmica via Windows Spooler ou TCP/IP.

---

## ⚡ Instalação RÁPIDA no Windows (recomendada)

1. Copie a pasta `print-agent/` para o notebook em `C:\HuskyPDV\print-agent\`
2. Crie o arquivo `.env` ao lado de `agent.mjs` com:
   ```
   SUPABASE_SERVICE_ROLE_KEY=<cole aqui a service key>
   TENANT_ID=00000000-0000-0000-0000-000000000001
   ```
   ⚠️ **A SERVICE_ROLE_KEY é obrigatória.** Sem ela o agente conecta mas não consegue ler nenhum job (RLS bloqueia). Pegue em: Lovable Cloud → Settings → API.
3. Clique com botão direito em `INSTALAR-WINDOWS.bat` → **Executar como Administrador**
4. O instalador faz tudo: instala dependências, registra no Task Scheduler do Windows, inicia em background.

Para diagnosticar problemas, rode `DIAGNOSTICO.bat`.

---

## Como funciona

```
PDV (navegador) → Supabase (print_jobs) → coffee-print (agente local) → Impressora térmica
```

- O agente filtra `print_jobs` por `tenant_id` (definido no `.env`)
- Para cada job pendente, gera bytes ESC/POS e envia direto pro Windows Spooler via P/Invoke `winspool.Drv` (RAW, não passa por driver de texto)
- Atualiza `printers.last_seen_at` (heartbeat) para o painel mostrar status online

---

## Cadastro da impressora no PDV

Na tela **Impressoras** do HuskyPDV, ao adicionar uma impressora térmica USB conectada ao notebook:

- **Tipo de conexão**: `Windows / Local`
- **Nome no Windows (`usb_device`)**: deve ser **EXATAMENTE** o nome da impressora no Windows.
  - Para descobrir, rode no PowerShell: `Get-Printer | Select Name`
  - Exemplo Epson: `EPSON TM-T20X Receipt` (atenção ao sufixo "Receipt" que o driver Epson adiciona)
  - Exemplo Elgin: `Elgin i9`
  - Exemplo Bematech: `Bematech MP-4200 TH`

---

## Comandos úteis (Windows)

```powershell
# Ver logs em tempo real
Get-Content C:\HuskyPDV\print-agent\agent.log -Wait -Tail 30

# Parar o agente
taskkill /F /IM node.exe

# Reiniciar manualmente
wscript.exe C:\HuskyPDV\print-agent\run-agent.vbs

# Listar impressoras instaladas no Windows
Get-Printer | Select Name, PrinterStatus

# Teste de impressão direto (sem o agente)
"TESTE`n`n`n`n" | Out-Printer -Name "EPSON TM-T20X Receipt"
```

---

## Troubleshooting

| Sintoma | Causa provável | Solução |
|---|---|---|
| `pm2 não é reconhecido` | PM2 não instalado | Use `INSTALAR-WINDOWS.bat` (não depende de PM2) |
| Agente roda mas nada imprime | `SUPABASE_SERVICE_ROLE_KEY` faltando no `.env` | Configurar service key — anon key não enxerga jobs (RLS) |
| `Cannot find printer` | Nome do spooler errado | Conferir com `Get-Printer` e atualizar campo `usb_device` no PDV |
| Painel mostra "offline" | Agente parou | Rodar `DIAGNOSTICO.bat` |
| Caracteres errados | Codepage da impressora | Agente já envia PC860 — conferir DIP switch da impressora |

---

## Linux/macOS (avançado)

```bash
cd print-agent
npm install
export SUPABASE_SERVICE_ROLE_KEY=...
export TENANT_ID=00000000-0000-0000-0000-000000000001
node agent.mjs
```

Em Linux usa `lp -o raw` (CUPS). Em Mac igual.

---

## Segurança

- A `SUPABASE_SERVICE_ROLE_KEY` **bypassa RLS** — por isso o agente filtra explicitamente por `tenant_id` em **toda** query/update.
- O `.env` deve ficar **apenas** no notebook do cliente. Nunca commitar.
- Se o notebook for trocado, **rotacionar a service key** no painel.

---

## Estrutura

```
print-agent/
├── agent.mjs              # loop principal (ESM, Node 20+)
├── package.json
├── INSTALAR-WINDOWS.bat   # ⭐ instalador definitivo (usa Task Scheduler)
├── DIAGNOSTICO.bat        # diagnóstico completo
├── run-agent.vbs          # gerado automaticamente — inicia em background
├── agent.log              # gerado automaticamente — logs do agente
├── .env                   # configuração local (criar manualmente)
└── README.md
```
