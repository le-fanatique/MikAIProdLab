@echo off
rem First installation / idempotent repair — thin wrapper around
rem scripts\mikai-deploy.mjs (DEVOPS.MIKAI.ONE_COMMAND.INSTALL.1). All
rem non-trivial behavior lives in that one Node module so Windows and Linux
rem cannot drift.
setlocal
cd /d "%~dp0"
node scripts\mikai-deploy.mjs install
exit /b %ERRORLEVEL%
