@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0import.ps1"
if errorlevel 1 echo Import failed. Please check the message above.
pause
