@echo off
rem Corvo - installazione per l utente corrente (niente amministratore). Doppio clic.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
set RC=%ERRORLEVEL%
echo.
pause
exit /b %RC%
