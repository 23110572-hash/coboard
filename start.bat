@echo off
title SyncBoard Launcher
echo ===================================================
echo               Launching SyncBoard
echo ===================================================
echo.

echo Starting Backend Fastify Server...
start "SyncBoard Backend" cmd /k "cd server && npm run dev"

echo Starting Frontend Next.js Client...
start "SyncBoard Frontend" cmd /k "cd client && npm run dev"

echo.
echo ===================================================
echo SyncBoard is running!
echo Backend is available at: http://localhost:5000
echo Frontend is available at: http://localhost:3000
echo ===================================================
echo.
pause
