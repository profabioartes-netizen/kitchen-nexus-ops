## Objetivo

Resolver de uma vez o problema do agente de impressão **nunca instalado** no notebook do Marcelo, gerando do próprio app HuskyPDV um instalador `.bat` **pronto, com Tenant ID e Station já preenchidos**, que registra o agente no **Task Scheduler nativo** do Windows e sobe automaticamente no boot — sem PM2, sem dependências extras, sem digitação manual.

## Por que essa abordagem

- O diagnóstico atual já provou que o problema não é no app — é a ausência do processo `coffee-print` no notebook.
- O `install.bat` atual exige Node, PM2, `pm2-windows-startup` e digitação manual de UUID/SERVICE_ROLE_KEY no CMD. Toda etapa manual é um ponto de falha — e a evidência é que ninguém conseguiu até agora.
- Um instalador **gerado pelo próprio app** elimina erros de digitação dos campos críticos (TENANT_ID, STATION) e usa só o que o Windows já tem (Task Scheduler + Node baixado pelo próprio script).

## Mudanças

### 1. Edge function nova: `generate-print-agent-installer`

Endpoint protegido (verifica JWT + role admin do tenant) que recebe `{ station: "Caixa" }` e devolve um `.zip` com 3 arquivos prontos:

- **`INSTALAR.bat`** — instalador one-click (detalhes técnicos abaixo)
- **`agent.mjs`** — cópia exata do `print-agent/agent.mjs` atual
- **`.env`** — já preenchido com `SUPABASE_URL`, `TENANT_ID` (do JWT do usuário logado), `STATION`, `SUPABASE_SERVICE_ROLE_KEY`

A SERVICE_ROLE_KEY é injetada server-side, então o cliente nunca a vê — só o `.zip` baixado contém ela.

### 2. Botão na página `/impressoras`

Acima do bloco de impressoras: card "**Configurar notebook de impressão**" com:

- Select de Station (Caixa/Cozinha/Bebidas)
- Botão **"Baixar instalador para Windows (.zip)"** → chama a edge function
- Texto curto: "Descompacte e dê duplo-clique em INSTALAR.bat como Administrador"

### 3. Detector de agente offline (banner persistente)

Acima da lista de impressoras, quando `last_seen_at` for nulo ou > 60s para qualquer impressora ativa:

```
⚠️ Agente offline há 5 min — impressora "EPSON TM-T20X" não está recebendo jobs.
                                                     [Baixar instalador]
```

Atualiza a cada 30s via realtime/refetch.

### 4. Conteúdo do `INSTALAR.bat` gerado

Roteiro do script (executado como Admin):

```text
1. Verifica se está como Administrador (auto-elevação se não estiver)
2. Cria pasta C:\HuskyPDV\print-agent
3. Verifica Node.js → se ausente, baixa o instalador MSI oficial e instala silencioso
4. Copia agent.mjs e .env para a pasta
5. Roda `npm install @supabase/supabase-js` na pasta
6. Faz teste-fumaça: `node agent.mjs --selftest` (modo novo, ver item 5)
7. Registra no Task Scheduler:
   schtasks /Create /TN "HuskyPDV-PrintAgent" 
            /TR "node C:\HuskyPDV\print-agent\agent.mjs"
            /SC ONSTART /RU SYSTEM /RL HIGHEST /F
8. Inicia a task imediatamente: schtasks /Run /TN "HuskyPDV-PrintAgent"
9. Aguarda 5s e valida heartbeat consultando o log local
10. Imprime ✅ CONCLUÍDO ou ❌ ERRO com mensagem específica
```

Tudo em uma janela só — usuário só dá duplo-clique e espera.

### 5. Modo `--selftest` no `agent.mjs`

Adicionar flag CLI que:
- Conecta no Supabase
- Faz 1 heartbeat na tabela `printers` (filtrado por tenant + station)
- Retorna exit code 0 (ok) ou 1 (erro) com mensagem clara
- Permite o `.bat` validar credenciais ANTES de registrar a task

### 6. Desinstalador (`DESINSTALAR.bat` no mesmo zip)

```text
schtasks /End /TN "HuskyPDV-PrintAgent"
schtasks /Delete /TN "HuskyPDV-PrintAgent" /F
rmdir /S /Q C:\HuskyPDV\print-agent
```

## Detalhes técnicos

- **Edge function** em `supabase/functions/generate-print-agent-installer/index.ts`. Usa `jsr:@std/archive` ou `npm:jszip` para montar o zip em memória. Valida JWT, busca `tenant_id` via `current_tenant_id`, lê `SUPABASE_SERVICE_ROLE_KEY` do env Deno, devolve `application/zip`.
- **Conteúdo embedado**: `agent.mjs` precisa estar disponível à edge function. Solução: copiar o conteúdo para uma constante `AGENT_SOURCE` no próprio `index.ts` durante deploy (script de build) ou ler de uma URL pública. Mais simples: incluir uma cópia inline do agent.mjs no diretório da edge function (`supabase/functions/generate-print-agent-installer/agent.mjs`) e ler com `Deno.readTextFile` em runtime.
- **Banner offline** em `PrintersPage.tsx`: novo `useQuery` com `refetchInterval: 30000` em `printers` calculando `Date.now() - new Date(last_seen_at).getTime() > 60000`.
- **Self-test no agent.mjs**: detectar `process.argv.includes("--selftest")` no topo, executar bloco de validação, `process.exit(0|1)`.
- **Logs do Task Scheduler**: o `.bat` redireciona stdout/stderr para `C:\HuskyPDV\print-agent\agent.log` para ficar inspecionável quando algo der errado.

## Resultado esperado para o Marcelo

1. Você abre `/impressoras` no PDV, clica "Baixar instalador para Windows".
2. Manda o `.zip` para o WhatsApp do Marcelo (ou ele baixa direto no notebook).
3. Marcelo descompacta, clica direito em `INSTALAR.bat` → Executar como Administrador.
4. Em ~2 min, vê "✅ CONCLUÍDO — agente rodando".
5. No app, o banner some, `last_seen_at` começa a atualizar, o "Diagnóstico Completo" passa a imprimir.

## Fora de escopo

- Versão Linux/macOS do gerador (mantém `install.sh` atual).
- Auto-update do agente (decide depois quando estiver rodando estável).
- Integração com nssm / serviço Windows real — Task Scheduler `/RU SYSTEM /SC ONSTART` cobre o caso.