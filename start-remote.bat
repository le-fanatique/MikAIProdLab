@echo off
rem MikAI production + sidecar OpenReel + InvokeAI + tunnel Cloudflare "mikai",
rem pour un acces A DISTANCE (docs\REMOTE_ACCESS_SETUP.md).
rem Thin wrapper autour de scripts\start-stack.mjs : les gardes qui etaient
rem ecrites ici en batch (sondes de port, detection de cloudflared) vivent
rem desormais dans ce module, en un seul exemplaire partage par les trois modes.
setlocal
cd /d "%~dp0"
node scripts\start-stack.mjs remote
exit /b %ERRORLEVEL%
