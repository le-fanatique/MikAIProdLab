@echo off
rem Deliberate update of MikAI plus its pinned compatible sidecar — thin
rem wrapper around scripts\mikai-deploy.mjs
rem (DEVOPS.MIKAI.ONE_COMMAND.INSTALL.1).
setlocal
cd /d "%~dp0"
node scripts\mikai-deploy.mjs update
exit /b %ERRORLEVEL%
