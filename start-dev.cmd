@echo off
cd /d "%~dp0"
set "PLATFORM_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%PLATFORM_NODE%" set "PLATFORM_NODE=node"
if not exist "node_modules\vite\bin\vite.js" (
  echo Dependencies are missing. Run npm install first.
  pause
  exit /b 1
)
"%PLATFORM_NODE%" node_modules\vite\bin\vite.js --host 127.0.0.1
pause
