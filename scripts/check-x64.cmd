@echo off
setlocal
set "ROOT=%~dp0.."
set "NODE=%ROOT%\tools\node-v24.18.0-win-x64\node.exe"
"%NODE%" --experimental-strip-types --test "%ROOT%\tests\*.test.ts"
