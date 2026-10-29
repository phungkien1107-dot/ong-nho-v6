@echo off
chcp 65001 >nul
title Ong Nhỏ - Hệ thống Kiểm tra SEO & Search Console

cd /d "%~dp0"

echo =====================================================================
echo           KHỞI ĐỘNG ỨNG DỤNG ONG NHỎ (SEO & SEARCH CONSOLE)
echo =====================================================================
echo.

:: 1. Kiểm tra thư mục node_modules
if not exist "node_modules" (
    echo [1/3] Đang cài đặt thư viện (npm install)...
    call npm install
    if errorlevel 1 (
        echo [LỖI] Không thể cài đặt thư viện. Vui lòng kiểm tra Node.js hoặc kết nối mạng.
        pause
        exit /b 1
    )
) else (
    echo [1/3] Thư viện node_modules đã sẵn sàng.
)

:: 2. Kiểm tra file .env
if not exist ".env" (
    if exist ".env.example" (
        echo [CHÚ Ý] Chưa tìm thấy file .env, tự động tạo từ .env.example...
        copy ".env.example" ".env" >nul
        echo [CHÚ Ý] Đã tạo file .env mẫu. Bạn có thể mở file .env để điền khóa Google và AI.
    )
)

:: 3. Build mã nguồn sang thư mục dist
echo.
echo [2/3] Đang đóng gói ứng dụng (npm run build)...
call npm run build
if errorlevel 1 (
    echo [LỖI] Build thất bại. Vui lòng kiểm tra mã lỗi ở trên.
    pause
    exit /b 1
)

:: 4. Xác định cổng server từ file .env (mặc định 3000)
set "APP_PORT=3000"
if exist ".env" (
    for /f "usebackq tokens=1,2 delims==" %%a in (".env") do (
        if "%%a"=="PORT" set "APP_PORT=%%b"
    )
)

:: 5. Tự động mở trình duyệt sau 3 giây và khởi động server production
echo.
echo [3/3] Đang khởi chạy máy chủ tại http://localhost:%APP_PORT% ...
echo Trình duyệt web sẽ tự động mở sau 3 giây...
echo (Nhấn Ctrl+C để dừng server bất cứ lúc nào)
echo =====================================================================
echo.

start "" cmd /c "timeout /t 3 /nobreak >nul & start http://localhost:%APP_PORT%"

call npm start
pause
