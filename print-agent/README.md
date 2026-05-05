# HuskyPDV — Print Agent (`coffee-print`)

Agente local que roda no notebook do estabelecimento e processa a fila de impressão (`print_jobs`) do HuskyPDV, enviando os tickets para a impressora térmica USB/serial conectada.

---

## Visão geral

```
PDV (navegador) → Supabase (print_jobs) → coffee-print → Impressora térmica
```

- **1 instância por impressora física** (cada uma com seu `STATION`).
- Polling a cada 2s na tabela `print_jobs` filtrando por `tenant_id` + `station`.
- Atualiza `printers.last_seen_at` (heartbeat) para o painel mostrar status online.
- Roda em background via **PM2** com autostart no boot.

---

## Requisitos

- Node.js 20+ (instalado automaticamente no Linux pelo `install.sh` se faltar)
- Impressora térmica ESC/POS (POS-58 ou POS-80) conectada por **USB**
- Acesso à internet (para falar com o Supabase)

---

## Passo a passo (técnico)

### 1. Conectar e identificar a impressora

**Linux:**
```bash
ls -l /dev/usb/lp*
# Esperado: /dev/usb/lp0
```
Se não aparecer, verifique `dmesg | tail` ao plugar a impressora.

**Windows:**
- Painel de Controle → Dispositivos e Impressoras → instale o driver da impressora.
- Compartilhe a impressora com um nome curto (ex.: `POS-80`).

### 2. Baixar o agente para o notebook

Copie a pasta `print-agent/` (deste repositório) para o notebook do cliente, por exemplo em `~/huskypdv-print-agent/` (Linux) ou `C:\HuskyPDV\print-agent\` (Windows).

### 3. Coletar credenciais no painel Super Admin

No HuskyPDV:
1. Login como Super Admin → painel `/admin-platform`.
2. Estabelecimentos → copiar o **UUID** do estabelecimento (será o `TENANT_ID`).
3. Cloud → Settings → API → copiar a **Service Role Key**.

### 4. Rodar o instalador

**Linux/macOS:**
```bash
cd ~/huskypdv-print-agent
chmod +x install.sh
./install.sh
```

**Windows:**
- Duplo clique em `install.bat` (rodar como Administrador na primeira vez para configurar o startup do PM2).

O instalador vai pedir interativamente:
- `SUPABASE_SERVICE_ROLE_KEY`
- `TENANT_ID`
- `STATION` (default `Caixa`)
- `PRINTER_DEVICE` (default `/dev/usb/lp0` ou `POS-80`)
- `WIDTH` (default `48` para 80mm; use `32` para 58mm)

### 5. Validar a impressão

No PDV do estabelecimento:
1. Vá em **Impressoras**.
2. Clique no botão **Testar** da impressora cadastrada (cujo "Setor" é igual ao `STATION` do agente).
3. O ticket deve sair em segundos.

---

## Múltiplas impressoras no mesmo notebook

Para 2 impressoras (ex.: Caixa + Cozinha):

```bash
# Copia a pasta para uma segunda instância
cp -r ~/huskypdv-print-agent ~/huskypdv-print-agent-cozinha
cd ~/huskypdv-print-agent-cozinha

# Edita .env: STATION=Cozinha, PRINTER_DEVICE=/dev/usb/lp1
nano .env

# Registra com nome diferente no PM2
pm2 start coffee-print.js --name coffee-print-cozinha
pm2 save
```

---

## Comandos PM2 úteis

```bash
pm2 logs coffee-print          # ver logs em tempo real
pm2 restart coffee-print       # reiniciar
pm2 stop coffee-print          # parar
pm2 status                     # status de todos os processos
pm2 monit                      # dashboard interativo
```

---

## Troubleshooting

| Sintoma | Causa provável | Solução |
|---|---|---|
| `EACCES: permission denied /dev/usb/lp0` | Permissão no device | `sudo chmod 666 /dev/usb/lp0` (já feito pelo install.sh) |
| Tickets ficam em `error` no painel | Impressora desligada / sem papel | Verificar impressora física + `pm2 logs coffee-print` |
| Painel mostra impressora "offline" | Agente parou | `pm2 restart coffee-print` |
| Caracteres acentuados saem errados | Codepage da impressora ≠ CP850 | Configurar a impressora física para CP850 ou ajustar renderer |
| Job nunca é puxado | `STATION` no .env ≠ "Setor" no PDV | Conferir e reiniciar agente |

---

## Segurança

- A `SUPABASE_SERVICE_ROLE_KEY` no `.env` **bypassa RLS** — por isso o agente filtra explicitamente por `tenant_id` em **toda** query/update.
- Esse arquivo `.env` deve ficar **apenas** no notebook do cliente. Nunca commitar.
- Se o notebook for trocado, **rotacionar a service key** no painel Super Admin.

---

## Estrutura de arquivos

```
print-agent/
├── package.json        # dependências
├── coffee-print.js     # loop principal (polling)
├── renderers.js        # geração ESC/POS (bill/production/test/cancellation)
├── .env.example        # template de configuração
├── .env                # configuração real (criada pelo install)
├── install.sh          # instalador Linux/macOS
├── install.bat         # instalador Windows
└── README.md           # este arquivo
```
