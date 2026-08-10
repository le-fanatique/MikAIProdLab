@echo off
rem Launch the pinned MikAI + OpenReel sidecar pair in production mode —
rem thin wrapper around scripts\mikai-deploy.mjs
rem (DEVOPS.MIKAI.ONE_COMMAND.INSTALL.1).
setlocal
cd /d "%~dp0"
node scripts\mikai-deploy.mjs start
exit /b %ERRORLEVEL%
