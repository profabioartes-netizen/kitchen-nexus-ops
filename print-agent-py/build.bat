@echo off
REM Build local do HuskyPDV Print Agent — gera um .exe sem console.
REM Pré-requisito: Python 3.10+ instalado e no PATH.
REM (Para build automático na nuvem, use GitHub Actions: tag print-agent-v*)

python -m pip install --upgrade pip
python -m pip install -r requirements.txt

if exist icon.ico (
    pyinstaller --onefile --noconsole --name HuskyPrintAgent --icon icon.ico agent.py
) else (
    pyinstaller --onefile --noconsole --name HuskyPrintAgent agent.py
)

echo.
echo ==========================================
echo Build concluido. Executavel em:
echo   dist\HuskyPrintAgent.exe
echo ==========================================
pause
