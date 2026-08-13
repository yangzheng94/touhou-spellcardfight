# 东方符卡战 - 本地开发服务器启动脚本
# 用法：右键选择"使用 PowerShell 运行"，或在终端执行 .\start-local.ps1

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Touhou Spellcard Battle - Local Server" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Starting backend (npm run server:dev)" -ForegroundColor Yellow
Write-Host "Starting frontend (npm run dev)" -ForegroundColor Yellow
Write-Host ""
Write-Host "Close the two popup windows to stop." -ForegroundColor DarkGray
Write-Host ""

Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run server:dev" -WindowStyle Normal
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev" -WindowStyle Normal

Write-Host "Servers started." -ForegroundColor Green
