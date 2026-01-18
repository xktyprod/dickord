@echo off
REM Development script for Dickord Electron App
REM This script checks for Node.js, installs dependencies, and starts the dev server

REM Change to the directory where this script is located
cd /d "%~dp0"

echo ========================================
echo Dickord - Development Mode
echo ========================================
echo.

REM Check if Node.js is installed
echo [1/3] Checking Node.js installation...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Node.js is not installed or not in PATH
    echo.
    echo Please install Node.js from https://nodejs.org/
    echo After installation, restart your terminal and try again.
    echo.
    pause
    exit /b 1
)

echo Node.js found: 
node --version
echo.

REM Install dependencies
echo [2/3] Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Failed to install dependencies
    echo Try deleting node_modules folder and running this script again.
    echo.
    pause
    exit /b 1
)
echo Dependencies installed successfully.
echo.

REM Start development server
echo [3/3] Starting development server...
echo.
echo The Vite dev server will start on http://127.0.0.1:3000
echo Electron will launch automatically when ready.
echo Press Ctrl+C to stop the development server.
echo.
call npm run dev
