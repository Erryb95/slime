@echo off
setlocal enabledelayedexpansion

:: SLIME FPS - Complete Launch and Management Script
echo.
echo  ███████╗██╗     ██╗███╗   ███╗███████╗    ███████╗██████╗ ███████╗
echo  ██╔════╝██║     ██║████╗ ████║██╔════╝    ██╔════╝██╔══██╗██╔════╝
echo  ███████╗██║     ██║██╔████╔██║█████╗      █████╗  ██████╔╝███████╗
echo  ╚════██║██║     ██║██║╚██╔╝██║██╔══╝      ██╔══╝  ██╔═══╝ ╚════██║
echo  ███████║███████╗██║██║ ╚═╝ ██║███████╗    ██║     ██║     ███████║
echo  ╚══════╝╚══════╝╚═╝╚═╝     ╚═╝╚══════╝    ╚═╝     ╚═╝     ╚══════╝
echo.
echo 🎮 Competitive FPS Game - Development Launcher
echo 📅 %date% %time%
echo.

:: Configuration
set CLIENT_PORT=3001
set SERVER_PORT=2567
set PROJECT_DIR=%~dp0
set CLIENT_DIR=%PROJECT_DIR%client
set SERVER_DIR=%PROJECT_DIR%server

:: Color codes for output
set RED=[91m
set GREEN=[92m
set YELLOW=[93m
set BLUE=[94m
set PURPLE=[95m
set CYAN=[96m
set WHITE=[97m
set RESET=[0m

echo %CYAN%🔍 Starting SLIME FPS Development Environment...%RESET%
echo.

:: Step 1: Cleanup any existing processes
echo %YELLOW%🧹 STEP 1: Cleaning up existing processes...%RESET%
call :cleanup_processes

:: Step 2: Check dependencies
echo.
echo %YELLOW%📦 STEP 2: Checking dependencies...%RESET%
call :check_dependencies

:: Step 3: Start servers
echo.
echo %YELLOW%🚀 STEP 3: Starting servers...%RESET%
call :start_servers

:: Step 4: Wait and monitor
echo.
echo %YELLOW%👀 STEP 4: Monitoring services...%RESET%
call :monitor_services

:: Cleanup and exit
call :cleanup_and_exit
goto :eof

:: ============================================================================
:: CLEANUP PROCESSES
:: ============================================================================
:cleanup_processes
echo %CYAN%🔍 Checking for existing Node.js processes...%RESET%

:: Kill processes on specific ports
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%CLIENT_PORT% ^| findstr LISTENING') do (
    if not "%%a"=="0" (
        echo %RED%🔧 Killing process %%a using port %CLIENT_PORT%...%RESET%
        taskkill /PID %%a /F >nul 2>&1
    )
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%SERVER_PORT% ^| findstr LISTENING') do (
    if not "%%a"=="0" (
        echo %RED%🔧 Killing process %%a using port %SERVER_PORT%...%RESET%
        taskkill /PID %%a /F >nul 2>&1
    )
)

:: Clean up PID files
if exist "%SERVER_DIR%\.server.pid" (
    echo %CYAN%🗑️ Removing stale server PID file...%RESET%
    del "%SERVER_DIR%\.server.pid" >nul 2>&1
)

echo %GREEN%✅ Cleanup completed%RESET%
timeout /t 2 >nul
goto :eof

:: ============================================================================
:: CHECK DEPENDENCIES
:: ============================================================================
:check_dependencies
echo %CYAN%🔍 Checking Node.js dependencies...%RESET%

:: Check if node_modules exist
if not exist "%CLIENT_DIR%\node_modules" (
    echo %YELLOW%📥 Installing client dependencies...%RESET%
    cd /d "%CLIENT_DIR%"
    npm install
    if !errorlevel! neq 0 (
        echo %RED%❌ Failed to install client dependencies%RESET%
        pause
        exit /b 1
    )
)

if not exist "%SERVER_DIR%\node_modules" (
    echo %YELLOW%📥 Installing server dependencies...%RESET%
    cd /d "%SERVER_DIR%"
    npm install
    if !errorlevel! neq 0 (
        echo %RED%❌ Failed to install server dependencies%RESET%
        pause
        exit /b 1
    )
)

echo %GREEN%✅ Dependencies checked%RESET%
goto :eof

:: ============================================================================
:: START SERVERS
:: ============================================================================
:start_servers
echo %CYAN%🌐 Starting game server on port %SERVER_PORT%...%RESET%
cd /d "%SERVER_DIR%"
start "SLIME FPS Server" cmd /k "echo %PURPLE%🎯 SLIME FPS Server%RESET% && npm run dev"

:: Wait for server to start
timeout /t 5 >nul

echo %CYAN%💻 Starting client dev server on port %CLIENT_PORT%...%RESET%
cd /d "%CLIENT_DIR%"
start "SLIME FPS Client" cmd /k "echo %BLUE%🎮 SLIME FPS Client%RESET% && npm run dev"

:: Wait for client to start
timeout /t 5 >nul

echo %GREEN%✅ Both servers started%RESET%
goto :eof

:: ============================================================================
:: MONITOR SERVICES
:: ============================================================================
:monitor_services
echo %CYAN%📊 Service Status:%RESET%

:: Check server port
netstat -ano | findstr :%SERVER_PORT% | findstr LISTENING >nul
if !errorlevel! equ 0 (
    echo   %GREEN%🟢 Game Server: Running on port %SERVER_PORT%%RESET%
) else (
    echo   %RED%🔴 Game Server: Not responding on port %SERVER_PORT%%RESET%
)

:: Check client port
netstat -ano | findstr :%CLIENT_PORT% | findstr LISTENING >nul
if !errorlevel! equ 0 (
    echo   %GREEN%🟢 Client Server: Running on port %CLIENT_PORT%%RESET%
) else (
    echo   %RED%🔴 Client Server: Not responding on port %CLIENT_PORT%%RESET%
)

echo.
echo %GREEN%🎮 SLIME FPS is ready!%RESET%
echo.
echo %CYAN%📱 Access the game at:%RESET%
echo   %WHITE%🌐 Main Game: http://localhost:%CLIENT_PORT%/%RESET%
echo   %WHITE%🗺️ Level Explorer: http://localhost:%CLIENT_PORT%/level-explorer-new.html%RESET%
echo   %WHITE%📊 System Status: http://localhost:%CLIENT_PORT%/system-status.html%RESET%
echo   %WHITE%🔧 Debug Pages:%RESET%
echo      http://localhost:%CLIENT_PORT%/test-connection.html
echo      http://localhost:%CLIENT_PORT%/debug-connection.html
echo      http://localhost:%CLIENT_PORT%/debug-map-selection.html
echo      http://localhost:%CLIENT_PORT%/test-animation-loading.html
echo      http://localhost:%CLIENT_PORT%/test-asset-loading.html
echo.
echo %CYAN%🎯 Server endpoints:%RESET%
echo   %WHITE%📊 Health Check: http://localhost:%SERVER_PORT%/health%RESET%
echo   %WHITE%🔍 Monitor: http://localhost:%SERVER_PORT%/colyseus%RESET%
echo   %WHITE%🎮 Playground: http://localhost:%SERVER_PORT%/playground%RESET%
echo.
echo %PURPLE%⚠️ Press Ctrl+C or close this window to stop all servers%RESET%
echo.

:: Keep monitoring
:monitor_loop
timeout /t 10 >nul

:: Check if servers are still running
netstat -ano | findstr :%SERVER_PORT% | findstr LISTENING >nul
set server_running=!errorlevel!

netstat -ano | findstr :%CLIENT_PORT% | findstr LISTENING >nul
set client_running=!errorlevel!

if !server_running! neq 0 (
    echo %RED%⚠️ Game server stopped unexpectedly%RESET%
)

if !client_running! neq 0 (
    echo %RED%⚠️ Client server stopped unexpectedly%RESET%
)

if !server_running! neq 0 if !client_running! neq 0 (
    echo %YELLOW%🛑 Both servers stopped. Exiting...%RESET%
    goto :cleanup_and_exit
)

goto :monitor_loop

:: ============================================================================
:: CLEANUP AND EXIT
:: ============================================================================
:cleanup_and_exit
echo.
echo %YELLOW%🛑 Shutting down SLIME FPS...%RESET%

:: Kill server processes
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%CLIENT_PORT% ^| findstr LISTENING') do (
    if not "%%a"=="0" (
        echo %CYAN%🔧 Stopping client server (PID: %%a)...%RESET%
        taskkill /PID %%a /F >nul 2>&1
    )
)

for /f "tokens=5" %%a in ('netstat -ano ^| findstr :%SERVER_PORT% ^| findstr LISTENING') do (
    if not "%%a"=="0" (
        echo %CYAN%🔧 Stopping game server (PID: %%a)...%RESET%
        taskkill /PID %%a /F >nul 2>&1
    )
)

:: Clean up PID files
if exist "%SERVER_DIR%\.server.pid" (
    del "%SERVER_DIR%\.server.pid" >nul 2>&1
)

:: Close server windows
taskkill /fi "WindowTitle eq SLIME FPS Server*" /f >nul 2>&1
taskkill /fi "WindowTitle eq SLIME FPS Client*" /f >nul 2>&1

echo %GREEN%✅ Cleanup completed%RESET%
echo %CYAN%👋 Thank you for playing SLIME FPS!%RESET%
echo.
pause
goto :eof

:: Handle Ctrl+C
:ctrl_c_handler
echo.
echo %YELLOW%🛑 Ctrl+C detected. Shutting down...%RESET%
call :cleanup_and_exit
exit
