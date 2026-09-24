@echo off
rem Corvo - disinstallazione (utente corrente). Doppio clic.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall.ps1" %*
set RC=%ERRORLEVEL%
echo.
pause
exit /b %RC%
