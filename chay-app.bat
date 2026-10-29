@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Ong Nho - Kiem tra website
where node >nul 2>nul
if errorlevel 1 (
  echo Chua cai Node.js. Hay tai ban LTS tai https://nodejs.org roi bam dup file nay lai.
  pause
  exit /b
)
if not exist node_modules (
  echo Dang cai dat lan dau, doi 1-2 phut...
  call npm install --no-audit --no-fund
)
echo Dang dung app...
call npm run build
start "" cmd /c "timeout /t 6 >nul & start http://localhost:3000"
echo App chay tai http://localhost:3000 - dong cua so nay de tat app.
call npm start
pause
