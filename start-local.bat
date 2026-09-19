@echo off
rem MikAI production + sidecar OpenReel + InvokeAI, en local, sans tunnel.
rem Thin wrapper autour de scripts\start-stack.mjs.
setlocal
cd /d "%~dp0"
node scripts\start-stack.mjs local
exit /b %ERRORLEVEL%
