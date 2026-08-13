@echo off
echo.
echo  ========================================
echo   Touhou Spellcard Battle - Local Server
echo  ========================================
echo.
echo  Starting backend (npm run server:dev)
echo  Starting frontend (npm run dev)
echo.
echo  Close the two popup windows to stop.
echo.

start "THSC Backend" cmd /k "npm run server:dev"
start "THSC Frontend" cmd /k "npm run dev"

echo.
echo  Servers started. Press any key to close this window.
pause
