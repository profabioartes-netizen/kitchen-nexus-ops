// Generates a one-click Windows installer .zip for the HuskyPDV Print Agent.
// The zip contains: INSTALAR.bat, DESINSTALAR.bat, agent.mjs, .env (pre-filled).
//
// Auth: requires a valid JWT. The tenant_id is resolved from the user's profile
// server-side, so the client cannot tamper with it. SUPABASE_SERVICE_ROLE_KEY is
// embedded in the .env that ships inside the zip (it's intended to run on the
// customer's local notebook).

import { createClient } from "jsr:@supabase/supabase-js@2";
import JSZip from "npm:jszip@3.10.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function buildInstallerBat(opts: {
  station: string;
  tenantId: string;
}): string {
  // CRLF + Windows-friendly. Uses Task Scheduler (no PM2). Auto-elevates.
  const lines = [
    "@echo off",
    "setlocal EnableDelayedExpansion",
    "title HuskyPDV - Instalador do Agente de Impressao",
    "color 0A",
    "",
    "REM ====== Auto-elevate to Administrator ======",
    'net session >nul 2>&1',
    "if %errorLevel% NEQ 0 (",
    '  echo Solicitando privilegios de Administrador...',
    `  powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"`,
    "  exit /b",
    ")",
    "",
    "set \"AGENT_DIR=C:\\HuskyPDV\\print-agent\"",
    `set "STATION=${opts.station}"`,
    `set "TENANT_ID=${opts.tenantId}"`,
    "",
    "echo ==============================================",
    "echo   HuskyPDV - Instalando Agente de Impressao",
    "echo ==============================================",
    "echo   Pasta:    %AGENT_DIR%",
    "echo   Estacao:  %STATION%",
    "echo   Tenant:   %TENANT_ID%",
    "echo ==============================================",
    "echo.",
    "",
    "REM ====== 1. Cria pasta destino ======",
    'if not exist "%AGENT_DIR%" mkdir "%AGENT_DIR%"',
    'cd /d "%AGENT_DIR%"',
    "",
    "REM ====== 2. Verifica Node.js ======",
    "where node >nul 2>nul",
    "if %errorLevel% NEQ 0 (",
    '  echo [*] Node.js nao encontrado. Baixando instalador oficial...',
    '  powershell -Command "Invoke-WebRequest -Uri https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi -OutFile %TEMP%\\node-installer.msi"',
    '  echo [*] Instalando Node.js (silencioso, ~2 min)...',
    '  msiexec /i %TEMP%\\node-installer.msi /qn /norestart',
    '  set "PATH=%PATH%;C:\\Program Files\\nodejs"',
    "  where node >nul 2>nul",
    "  if %errorLevel% NEQ 0 (",
    '    echo [ERRO] Node.js nao foi instalado corretamente. Reinicie o computador e rode este instalador novamente.',
    "    pause",
    "    exit /b 1",
    "  )",
    ")",
    'for /f "delims=" %%v in (\'node -v\') do echo [ok] Node.js %%v',
    "",
    "REM ====== 3. Copia arquivos do agente ======",
    "echo [*] Copiando arquivos do agente...",
    'copy /Y "%~dp0agent.mjs" "%AGENT_DIR%\\agent.mjs" >nul',
    'copy /Y "%~dp0.env" "%AGENT_DIR%\\.env" >nul',
    "",
    "REM ====== 4. Cria package.json minimo e instala dependencias ======",
    "if not exist package.json (",
    '  echo {"name":"huskypdv-agent","version":"1.0.0","type":"module","dependencies":{"@supabase/supabase-js":"^2.45.0","dotenv":"^16.4.5"}} > package.json',
    ")",
    "echo [*] Instalando dependencias (npm install, ~1 min)...",
    "call npm install --silent --no-audit --no-fund",
    "if %errorLevel% NEQ 0 (",
    '  echo [ERRO] npm install falhou. Verifique a conexao com a internet.',
    "  pause",
    "  exit /b 1",
    ")",
    "",
    "REM ====== 5. Self-test: valida credenciais antes de registrar ======",
    "echo [*] Testando conexao com HuskyPDV...",
    "node -r dotenv/config agent.mjs --selftest",
    "if %errorLevel% NEQ 0 (",
    '  echo.',
    '  echo [ERRO] Self-test falhou. Veja o erro acima.',
    '  echo Possiveis causas:',
    '  echo   - Tenant ID errado no .env',
    '  echo   - SUPABASE_SERVICE_ROLE_KEY invalida',
    '  echo   - Sem internet',
    "  pause",
    "  exit /b 1",
    ")",
    "echo [ok] Self-test passou.",
    "",
    "REM ====== 6. Registra no Task Scheduler ======",
    "echo [*] Registrando no Task Scheduler (autostart no boot)...",
    'schtasks /Delete /TN "HuskyPDV-PrintAgent" /F >nul 2>&1',
    `schtasks /Create /TN "HuskyPDV-PrintAgent" /TR "cmd /c cd /d %AGENT_DIR% && node -r dotenv/config agent.mjs >> agent.log 2>&1" /SC ONSTART /RU SYSTEM /RL HIGHEST /F`,
    "if %errorLevel% NEQ 0 (",
    '  echo [ERRO] Falha ao criar a tarefa agendada.',
    "  pause",
    "  exit /b 1",
    ")",
    "",
    "REM ====== 7. Inicia o agente AGORA ======",
    "echo [*] Iniciando o agente...",
    'schtasks /Run /TN "HuskyPDV-PrintAgent" >nul',
    "",
    "echo.",
    "echo ==============================================",
    "echo   [OK] CONCLUIDO!",
    "echo ==============================================",
    "echo   O agente esta rodando em segundo plano.",
    "echo   Ele iniciara automaticamente toda vez que",
    "echo   o computador ligar.",
    "echo.",
    "echo   Log ao vivo: %AGENT_DIR%\\agent.log",
    "echo   Para desinstalar: rode DESINSTALAR.bat",
    "echo ==============================================",
    "echo.",
    "echo Aguarde 5 segundos e va no HuskyPDV /impressoras",
    "echo para ver o agente como ONLINE.",
    "echo.",
    "pause",
    "exit /b 0",
  ];
  return lines.join("\r\n");
}

function buildUninstallerBat(): string {
  const lines = [
    "@echo off",
    "title HuskyPDV - Desinstalador do Agente",
    'net session >nul 2>&1',
    "if %errorLevel% NEQ 0 (",
    `  powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"`,
    "  exit /b",
    ")",
    "echo Removendo HuskyPDV-PrintAgent...",
    'schtasks /End /TN "HuskyPDV-PrintAgent" >nul 2>&1',
    'schtasks /Delete /TN "HuskyPDV-PrintAgent" /F >nul 2>&1',
    'taskkill /F /IM node.exe >nul 2>&1',
    'rmdir /S /Q "C:\\HuskyPDV\\print-agent"',
    "echo Removido com sucesso.",
    "pause",
  ];
  return lines.join("\r\n");
}

function buildEnvFile(opts: { tenantId: string; station: string }): string {
  return [
    `# HuskyPDV Print Agent — gerado automaticamente`,
    `# Gerado em: ${new Date().toISOString()}`,
    ``,
    `SUPABASE_URL=${SUPABASE_URL}`,
    `SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}`,
    `TENANT_ID=${opts.tenantId}`,
    `STATION=${opts.station}`,
    `POLL_INTERVAL_MS=5000`,
    ``,
  ].join("\r\n");
}

function buildReadme(opts: { tenantId: string; station: string }): string {
  return [
    "HuskyPDV — Agente de Impressao",
    "================================",
    "",
    `Estacao: ${opts.station}`,
    `Tenant:  ${opts.tenantId}`,
    "",
    "INSTALACAO (Windows):",
    "  1. Descompacte este .zip em qualquer pasta",
    "  2. Clique com o botao DIREITO em INSTALAR.bat",
    "  3. Escolha 'Executar como administrador'",
    "  4. Aguarde a mensagem [OK] CONCLUIDO!",
    "",
    "DESINSTALAR:",
    "  Execute DESINSTALAR.bat como administrador.",
    "",
    "LOGS:",
    "  C:\\HuskyPDV\\print-agent\\agent.log",
    "",
  ].join("\r\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── 1. Validate JWT ────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claims.claims.sub;

    // ── 2. Resolve tenant via service role (bypass RLS) ───────
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: profile, error: profileErr } = await adminClient
      .from("profiles")
      .select("tenant_id")
      .eq("id", userId)
      .maybeSingle();

    if (profileErr || !profile?.tenant_id) {
      return new Response(
        JSON.stringify({ error: "Usuario sem tenant vinculado" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const tenantId = profile.tenant_id as string;

    // ── 3. Parse body ──────────────────────────────────────────
    let station = "Caixa";
    try {
      const body = await req.json();
      if (typeof body?.station === "string" && body.station.trim()) {
        station = body.station.trim();
      }
    } catch (_) {
      // sem body, usa default
    }

    // ── 4. Read agent.mjs from disk (shipped alongside) ────────
    const agentPath = new URL("./agent.mjs", import.meta.url);
    const agentSource = await Deno.readTextFile(agentPath);

    // ── 5. Build zip ───────────────────────────────────────────
    const zip = new JSZip();
    zip.file("INSTALAR.bat", buildInstallerBat({ station, tenantId }));
    zip.file("DESINSTALAR.bat", buildUninstallerBat());
    zip.file(".env", buildEnvFile({ tenantId, station }));
    zip.file("agent.mjs", agentSource);
    zip.file("LEIA-ME.txt", buildReadme({ tenantId, station }));

    const zipBytes = await zip.generateAsync({ type: "uint8array" });

    const safeStation = station.replace(/[^a-zA-Z0-9]/g, "_");
    const filename = `huskypdv-print-agent-${safeStation}.zip`;

    return new Response(zipBytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    console.error("[generate-print-agent-installer] erro:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
