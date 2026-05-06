// Generates a one-click Windows installer .zip for the HuskyPDV Print Agent.
//
// NEW FLOW (Phase 1): the installer NO LONGER embeds SUPABASE_SERVICE_ROLE_KEY.
// It ships with only the public URL and asks the user for a 6-digit pairing
// code generated in the panel. The .bat calls the `pair-print-agent` edge
// function, which returns a per-agent token persisted into .env.
//
// Auth: requires JWT (panel user) — used only to log who downloaded.

import { createClient } from "jsr:@supabase/supabase-js@2";
import JSZip from "npm:jszip@3.10.1";
import { AGENT_MJS_SOURCE } from "./agent-source.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

function buildInstallerBat(): string {
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
    `set "SUPABASE_URL=${SUPABASE_URL}"`,
    `set "SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}"`,
    "",
    "echo ==============================================",
    "echo   HuskyPDV - Instalador do Agente",
    "echo ==============================================",
    "echo.",
    "echo Voce vai precisar do CODIGO DE PAREAMENTO de 6 digitos",
    "echo gerado no painel HuskyPDV em:",
    "echo   Impressoras  ^>  Parear novo agente",
    "echo.",
    "set /p PAIR_CODE=Digite o codigo de 6 digitos: ",
    "set /p AGENT_NAME=Nome para este computador (ex: Notebook do Caixa): ",
    "if \"!AGENT_NAME!\"==\"\" set \"AGENT_NAME=Agente Windows\"",
    "echo.",
    "",
    "REM ====== Cria pasta destino ======",
    'if not exist "%AGENT_DIR%" mkdir "%AGENT_DIR%"',
    'cd /d "%AGENT_DIR%"',
    "",
    "REM ====== Verifica Node.js ======",
    "where node >nul 2>nul",
    "if %errorLevel% NEQ 0 (",
    '  echo [*] Node.js nao encontrado. Baixando instalador oficial...',
    '  powershell -Command "Invoke-WebRequest -Uri https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi -OutFile %TEMP%\\node-installer.msi"',
    '  echo [*] Instalando Node.js (silencioso, ~2 min)...',
    '  msiexec /i %TEMP%\\node-installer.msi /qn /norestart',
    '  set "PATH=%PATH%;C:\\Program Files\\nodejs"',
    "  where node >nul 2>nul",
    "  if %errorLevel% NEQ 0 (",
    '    echo [ERRO] Node.js nao foi instalado. Reinicie e rode de novo.',
    "    pause & exit /b 1",
    "  )",
    ")",
    'for /f "delims=" %%v in (\'node -v\') do echo [ok] Node.js %%v',
    "",
    "REM ====== Copia arquivos ======",
    "echo [*] Copiando agente...",
    'copy /Y "%~dp0agent.mjs" "%AGENT_DIR%\\agent.mjs" >nul',
    "if not exist package.json (",
    '  echo {"name":"huskypdv-agent","version":"1.0.0","type":"module","dependencies":{"@supabase/supabase-js":"^2.45.0","dotenv":"^16.4.5"}} > package.json',
    ")",
    "echo [*] Instalando dependencias (npm install, ~1 min)...",
    "call npm install --silent --no-audit --no-fund",
    "if %errorLevel% NEQ 0 ( echo [ERRO] npm install falhou. & pause & exit /b 1 )",
    "",
    "REM ====== Pareamento: troca codigo por token permanente ======",
    "echo [*] Parearndo com HuskyPDV...",
    "set \"PAIR_PAYLOAD={\\\"code\\\":\\\"!PAIR_CODE!\\\",\\\"agent_name\\\":\\\"!AGENT_NAME!\\\",\\\"agent_host\\\":\\\"%COMPUTERNAME%\\\",\\\"agent_version\\\":\\\"1.0.0\\\"}\"",
    "powershell -NoProfile -Command \"$body = '!PAIR_PAYLOAD!'; try { $r = Invoke-RestMethod -Uri '%SUPABASE_URL%/functions/v1/pair-print-agent' -Method POST -ContentType 'application/json' -Headers @{ 'apikey' = '%SUPABASE_ANON_KEY%' } -Body $body -ErrorAction Stop; @\\\"^",
    "SUPABASE_URL=%SUPABASE_URL%`r`n^",
    "SUPABASE_ANON_KEY=%SUPABASE_ANON_KEY%`r`n^",
    "AGENT_TOKEN=$($r.agent_token)`r`n^",
    "AGENT_ID=$($r.agent_id)`r`n^",
    "TENANT_ID=$($r.tenant_id)`r`n^",
    "TENANT_NAME=$($r.tenant_name)`r`n^",
    "STATION=$($r.station)`r`n^",
    "POLL_INTERVAL_MS=5000`r`n^",
    "\\\"@ | Out-File -FilePath '.env' -Encoding ASCII -NoNewline; Write-Host '[ok] Pareado com tenant:' $r.tenant_name } catch { Write-Host '[ERRO] Pareamento falhou:' $_.Exception.Message; if ($_.ErrorDetails) { Write-Host $_.ErrorDetails.Message }; exit 1 }\"",
    "if %errorLevel% NEQ 0 ( echo. & echo Verifique o codigo e tente de novo. & pause & exit /b 1 )",
    "",
    "REM ====== Registra no Task Scheduler ======",
    "echo [*] Registrando autostart no Windows...",
    'schtasks /Delete /TN "HuskyPDV-PrintAgent" /F >nul 2>&1',
    `schtasks /Create /TN "HuskyPDV-PrintAgent" /TR "cmd /c cd /d %AGENT_DIR% && node -r dotenv/config agent.mjs >> agent.log 2>&1" /SC ONSTART /RU SYSTEM /RL HIGHEST /F`,
    "",
    "echo [*] Iniciando agente...",
    'schtasks /Run /TN "HuskyPDV-PrintAgent" >nul',
    "",
    "echo.",
    "echo ==============================================",
    "echo   [OK] HuskyPDV Agent instalado com sucesso!",
    "echo ==============================================",
    "echo   Pasta: %AGENT_DIR%",
    "echo   Log:   %AGENT_DIR%\\agent.log",
    "echo.",
    "echo   No painel /impressoras o agente vai aparecer",
    "echo   como ONLINE em poucos segundos.",
    "echo ==============================================",
    "pause",
    "exit /b 0",
  ];
  return lines.join("\r\n");
}

function buildUninstallerBat(): string {
  return [
    "@echo off",
    "title HuskyPDV - Desinstalador",
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
    "echo Removido.",
    "pause",
  ].join("\r\n");
}

function buildReadme(): string {
  return [
    "HuskyPDV — Agente de Impressao",
    "================================",
    "",
    "INSTALACAO (Windows):",
    "  1. Descompacte este .zip em qualquer pasta",
    "  2. No painel HuskyPDV: /impressoras > 'Parear novo agente'",
    "     Anote o codigo de 6 digitos exibido (valido por 10 min)",
    "  3. Clique com o botao DIREITO em INSTALAR.bat",
    "  4. Escolha 'Executar como administrador'",
    "  5. Digite o codigo de 6 digitos quando solicitado",
    "  6. Aguarde a mensagem [OK] CONCLUIDO!",
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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
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

    const zip = new JSZip();
    zip.file("INSTALAR.bat", buildInstallerBat());
    zip.file("DESINSTALAR.bat", buildUninstallerBat());
    zip.file("agent.mjs", AGENT_MJS_SOURCE);
    zip.file("LEIA-ME.txt", buildReadme());

    const zipBytes = await zip.generateAsync({ type: "uint8array" });

    return new Response(zipBytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="huskypdv-agent.zip"`,
      },
    });
  } catch (e) {
    console.error("[generate-print-agent-installer]", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
