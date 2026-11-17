@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
    where py >nul 2>nul
    if errorlevel 1 (
        python -m venv .venv
    ) else (
        py -3 -m venv .venv
    )
    if errorlevel 1 goto :erro
)
".venv\Scripts\python.exe" -m pip install -r requirements.txt
if errorlevel 1 goto :erro
echo.
echo Abra no navegador: http://127.0.0.1:5000
echo Para encerrar, pressione Ctrl+C nesta janela.
echo.
".venv\Scripts\python.exe" app.py
if errorlevel 1 goto :erro
exit /b 0
:erro
echo.
echo Nao foi possivel iniciar. Confira a mensagem acima.
echo Instale Python 3.10 ou superior e marque Add Python to PATH.
pause
exit /b 1
