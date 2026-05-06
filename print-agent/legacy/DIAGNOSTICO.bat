@echo off
REM =====================================================================
REM  HuskyPDV - Diagnostico do Agente de Impressao
REM  Mostra exatamente o que esta funcionando e o que esta falhando.
REM =====================================================================
title HuskyPDV - Diagnostico
cd /d "%~dp0"

echo.
echo  ============================================================
echo    HuskyPDV - DIAGNOSTICO COMPLETO
echo  ============================================================
echo.

echo  [1/7] Pasta atual:
echo        %CD%
echo.

echo  [2/7] Node.js instalado?
where node 2>nul
if errorlevel 1 (
  echo        [X] NAO - instale em https://nodejs.org/
) else (
  for /f "delims=" %%v in ('node -v') do echo        [OK] %%v
)
echo.

echo  [3/7] Arquivo agent.mjs existe?
if exist agent.mjs (
  echo        [OK] sim
  findstr /C:"rydfhkphvhkqxwpqoeku" agent.mjs >nul
  if errorlevel 1 (
    echo        [X]  ATENCAO: agent.mjs aponta para projeto Supabase ERRADO!
    echo            Baixe a versao nova do Lovable e cole aqui.
  ) else (
    echo        [OK] aponta para o projeto Supabase correto
  )
) else (
  echo        [X] NAO existe! Copie agent.mjs para esta pasta.
)
echo.

echo  [4/7] node_modules instalado?
if exist node_modules (
  echo        [OK] sim
) else (
  echo        [X] NAO - rode: npm install
)
echo.

echo  [5/7] Impressora EPSON TM-T20X Receipt instalada no Windows?
powershell -NoProfile -Command "$p = Get-Printer -Name 'EPSON TM-T20X Receipt' -ErrorAction SilentlyContinue; if ($p) { Write-Host '       [OK] sim - status:' $p.PrinterStatus } else { Write-Host '       [X] NAO encontrada. Impressoras disponiveis:'; Get-Printer | Select-Object -ExpandProperty Name | ForEach-Object { Write-Host '          -' $_ } }"
echo.

echo  [6/7] Agente esta rodando agora?
tasklist /FI "IMAGENAME eq node.exe" /FO CSV 2>nul | findstr /I "node.exe" >nul
if errorlevel 1 (
  echo        [X] NAO - nenhum processo node.exe rodando
  echo            Inicie com: wscript.exe run-agent.vbs
) else (
  echo        [OK] node.exe esta rodando
  tasklist /FI "IMAGENAME eq node.exe"
)
echo.

echo  [7/7] Ultimas 20 linhas do log do agente:
if exist agent.log (
  powershell -NoProfile -Command "Get-Content agent.log -Tail 20"
) else (
  echo        [X] agent.log nao existe ainda
)
echo.

echo  ============================================================
echo    Teste de impressao direta (sem o agente):
echo  ============================================================
echo.
echo  Vou tentar imprimir um teste DIRETO no Windows agora...
echo.
powershell -NoProfile -Command "try { 'TESTE DIRETO HUSKYPDV' + [char]10 + 'Se este texto saiu, a impressora funciona!' + [char]10 + [char]10 + [char]10 + [char]10 | Out-Printer -Name 'EPSON TM-T20X Receipt'; Write-Host '       [OK] Comando enviado para a impressora.' } catch { Write-Host '       [X] FALHOU:' $_.Exception.Message }"
echo.

echo  ============================================================
echo  Diagnostico concluido. Tire foto desta tela e envie.
echo  ============================================================
echo.
pause
