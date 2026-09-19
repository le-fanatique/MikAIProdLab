@echo off
rem MikAI dev + sidecar OpenReel + InvokeAI, en local.
rem Thin wrapper autour de scripts\start-stack.mjs : toute la logique est
rem la-bas, pour que Windows et Linux ne divergent pas.
rem LOCAL UNIQUEMENT. Le mode dev ne doit jamais etre ce qu'atteint un
rem navigateur distant (docs\REMOTE_ACCESS_SETUP.md section 4).
rem Ce fichier reste en ASCII strict : cmd le lit en codepage OEM, et un
rem caractere accentue ou un tiret long y casse la ligne rem qui le porte.
setlocal
cd /d "%~dp0"
node scripts\start-stack.mjs dev
exit /b %ERRORLEVEL%
