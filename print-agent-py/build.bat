@echo off
REM Build do HuskyPDV Print Agent — gera um .exe sem console.
REM Pré-requisito: Python 3.10+ instalado e no PATH.

python -m pip install --upgrade pip
python -m pip install -r requirements.txt

pyinstaller --onefile --noconsole --name HuskyPrintAgent --icon icon.ico agent.py

echo.
echo ==========================================
echo Build concluido. Executavel em:
echo   dist\HuskyPrintAgent.exe
echo ==========================================
pause
