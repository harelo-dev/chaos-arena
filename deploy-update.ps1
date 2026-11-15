param(
    [string]$Message = "Update Chaos Arena",
    [switch]$WithApk = $false
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

Write-Host "1/4 Compilando Frontend 3D (Next.js Static Export)..." -ForegroundColor Cyan
Set-Location "$Root\frontend"
$env:BUILD_APK = "1"
npm run build

Write-Host "2/4 Sincronizando archivos estáticos con backend/static..." -ForegroundColor Cyan
if (-not (Test-Path "$Root\backend\static")) {
    New-Item -ItemType Directory -Path "$Root\backend\static" | Out-Null
}
Copy-Item "$Root\frontend\out\*" "$Root\backend\static\" -Recurse -Force

if ($WithApk) {
    Write-Host "3/4 Compilando nuevo APK de Android (Capacitor + Gradle)..." -ForegroundColor Yellow
    npx cap copy android
    Set-Location "$Root\frontend\android"
    .\gradlew.bat assembleDebug
    Copy-Item "$Root\frontend\android\app\build\outputs\apk\debug\app-debug.apk" "$Root\ChaosArena.apk" -Force
    Copy-Item "$Root\ChaosArena.apk" "$Root\frontend\public\ChaosArena.apk" -Force
    Copy-Item "$Root\ChaosArena.apk" "$Root\backend\static\ChaosArena.apk" -Force
} else {
    Write-Host "3/4 Omitiendo recompilación de APK (usa -WithApk si quieres regenerar el .apk)..." -ForegroundColor DarkGray
    if (Test-Path "$Root\ChaosArena.apk") {
        Copy-Item "$Root\ChaosArena.apk" "$Root\backend\static\ChaosArena.apk" -Force
    }
}

Write-Host "4/4 Subiendo cambios a GitHub (Auto-Deploy en Railway)..." -ForegroundColor Green
Set-Location $Root
git add .
git commit -m "$Message"
git push origin main

Write-Host "¡Listo! Railway desplegará la actualización automáticamente en ~25 segundos en:" -ForegroundColor Green
Write-Host "https://chaos-arena-server-production.up.railway.app" -ForegroundColor Magenta
