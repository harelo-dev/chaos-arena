Write-Host "Iniciando Chaos Arena Backend (FastAPI :8000) y Frontend (Next.js :3000)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$PSScriptRoot\backend'; python main.py"
Set-Location "$PSScriptRoot\frontend"
npm run dev
