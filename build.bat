@echo off
REM Production build script for Dickord Electron App
REM This script checks for Node.js, installs dependencies, and builds the EXE

REM Change to the directory where this script is located
cd /d "%~dp0"

echo ========================================
echo Dickord - Production Build
echo ========================================
echo.

REM Check if Node.js is installed
echo [1/4] Checking Node.js installation...
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
echo [2/4] Installing dependencies...
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

REM Build the application
echo [3/4] Building application...
echo This may take several minutes...
echo.
call npm run build
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Build failed
    echo.
    echo Common solutions:
    echo - Delete node_modules and dist-renderer folders, then try again
    echo - Check if you have enough disk space
    echo - Verify package.json configuration
    echo.
    pause
    exit /b 1
)
echo.

REM Build complete
echo [4/4] Build completed successfully!
echo.
echo ========================================
echo Build Output Location:
echo ========================================
echo.
echo The installer has been created in the 'dist' folder.
echo Look for a file like: Dickord Setup 1.0.0.exe
echo.
echo You can now distribute this installer to users.
echo Double-click the installer to install the application.
echo.
pause
