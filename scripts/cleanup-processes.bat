@echo off
setlocal enabledelayedexpansion

echo 🔍 SLIME FPS - Process Detection and Cleanup
echo.

:: Check for Node.js processes that might be servers
echo Checking for Node.js processes...
for /f "tokens=1,2,5" %%a in ('tasklist /fi "imagename eq node.exe" /fo table /nh') do (
    if "%%a"=="node.exe" (
        echo Found Node.js process: PID=%%b
        
        :: Check if this process is using our ports
        for /f "tokens=*" %%p in ('netstat -ano ^| findstr :2567 ^| findstr %%b') do (
            echo   └─ ⚠️  This process is using port 2567 (Server)
            set /p choice="Kill this process? (y/n): "
            if /i "!choice!"=="y" (
                taskkill /PID %%b /F >nul 2>&1
                if !errorlevel!==0 (
                    echo   └─ ✅ Process %%b killed successfully
                ) else (
                    echo   └─ ❌ Failed to kill process %%b
                )
            )
        )
        
        for /f "tokens=*" %%p in ('netstat -ano ^| findstr :3001 ^| findstr %%b') do (
            echo   └─ ⚠️  This process is using port 3001 (Client)
            set /p choice="Kill this process? (y/n): "
            if /i "!choice!"=="y" (
                taskkill /PID %%b /F >nul 2>&1
                if !errorlevel!==0 (
                    echo   └─ ✅ Process %%b killed successfully
                ) else (
                    echo   └─ ❌ Failed to kill process %%b
                )
            )
        )
    )
)

echo.
echo Checking ports:
echo.

:: Check port 2567 (Server)
echo 🌐 Port 2567 (Server):
for /f "tokens=*" %%i in ('netstat -ano ^| findstr :2567') do (
    echo   %%i
)

echo.
echo 🌐 Port 3001 (Client):
for /f "tokens=*" %%i in ('netstat -ano ^| findstr :3001') do (
    echo   %%i
)
    echo   %%i
)

echo.
echo 📁 Checking for PID files:
if exist "server\.server.pid" (
    set /p server_pid=<"server\.server.pid"
    echo   Server PID file found: !server_pid!
    
    :: Check if process is still running
    tasklist /fi "PID eq !server_pid!" | findstr !server_pid! >nul
    if !errorlevel!==0 (
        echo   └─ ✅ Process !server_pid! is still running
    ) else (
        echo   └─ ⚠️  Process !server_pid! is not running (stale PID file)
        del "server\.server.pid" >nul 2>&1
        echo   └─ 🗑️  Removed stale PID file
    )
) else (
    echo   No server PID file found
)

echo.
echo 🛠️  Quick Actions:
echo   1. Kill all Node.js processes
echo   2. Clean all PID files
echo   3. Start fresh server
echo   4. Exit
echo.
set /p action="Choose action (1-4): "

if "%action%"=="1" (
    echo Killing all Node.js processes...
    taskkill /im node.exe /f >nul 2>&1
    echo ✅ Done
)

if "%action%"=="2" (
    echo Cleaning PID files...
    del "server\.server.pid" >nul 2>&1
    echo ✅ Done
)

if "%action%"=="3" (
    echo Starting fresh server...
    taskkill /im node.exe /f >nul 2>&1
    del "server\.server.pid" >nul 2>&1
    timeout /t 2 >nul
    cd server
    start "SLIME Server" npm run dev
    cd ..
    echo ✅ Server started in new window
)

if "%action%"=="4" (
    echo Goodbye! 👋
)

pause
