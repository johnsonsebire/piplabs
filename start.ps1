<#
.SYNOPSIS
    Starts all PipLabs services for local development on Windows.

.DESCRIPTION
    Launches the API Server and Trading Platform frontend in the current window
    using pnpm's parallel execution.

.NOTES
    Prerequisites:
      - Node.js 24+
      - pnpm installed globally (npm i -g pnpm)
      - Dependencies installed (pnpm install)
      - .env file configured at project root
#>

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Stop-ProcessOnPort {
    param ([int]$Port)
    try {
        $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
        if ($connections) {
            $pids = $connections | Select-Object -ExpandProperty OwningProcess -Unique
            foreach ($pid in $pids) {
                $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
                if ($proc) {
                    Write-Host "  [!] Port $Port is in use by $($proc.ProcessName) (PID: $pid). Killing process..." -ForegroundColor Yellow
                    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
                    Start-Sleep -Seconds 1
                }
            }
        }
    } catch {
        # Port is likely not in use or access denied
    }
}
# -- Resolve project root (where this script lives) --------------------------
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition

# -- Preflight checks --------------------------------------------------------
Write-Host ""
Write-Host "+----------------------------------------------------------+" -ForegroundColor DarkGreen
Write-Host "|                 PipLabs - Local Dev Launcher             |" -ForegroundColor Green
Write-Host "+----------------------------------------------------------+" -ForegroundColor DarkGreen
Write-Host ""

Write-Host "  Cleaning up existing services..." -ForegroundColor Cyan
Stop-ProcessOnPort 8080
Stop-ProcessOnPort 21210

# Check Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "  [x] Node.js not found. Please install Node.js 24+." -ForegroundColor Red
    pause
    exit 1
}
$nodeVersion = (node --version)
Write-Host "  [v] Node.js $nodeVersion" -ForegroundColor Green

# Check pnpm
if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Host "  [x] pnpm not found. Install it with: npm i -g pnpm" -ForegroundColor Red
    pause
    exit 1
}
$pnpmVersion = (pnpm --version)
Write-Host "  [v] pnpm   v$pnpmVersion" -ForegroundColor Green

# Check .env
$envFile = Join-Path $ProjectRoot ".env"
if (-not (Test-Path $envFile)) {
    Write-Host "  [x] .env file not found at project root." -ForegroundColor Red
    Write-Host "    Copy .env.example to .env and fill in your credentials." -ForegroundColor Yellow
    pause
    exit 1
}
Write-Host "  [v] .env   found" -ForegroundColor Green

# Check node_modules
$nodeModules = Join-Path $ProjectRoot "node_modules"
if (-not (Test-Path $nodeModules)) {
    Write-Host ""
    Write-Host "  [!] node_modules not found. Running pnpm install..." -ForegroundColor Yellow
    Push-Location $ProjectRoot
    pnpm install
    Pop-Location
    Write-Host "  [v] Dependencies installed" -ForegroundColor Green
}
else {
    Write-Host "  [v] node_modules exists" -ForegroundColor Green
}

Write-Host ""
Write-Host "  +----------------------------------------------------+" -ForegroundColor DarkGray
Write-Host "  |  API Server ........... http://localhost:8080/api  |" -ForegroundColor Gray
Write-Host "  |  Trading Platform ..... http://localhost:21210     |" -ForegroundColor Gray
Write-Host "  |                                                    |" -ForegroundColor DarkGray
Write-Host "  |  Press Ctrl+C to stop all services.                |" -ForegroundColor DarkGray
Write-Host "  +----------------------------------------------------+" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Starting services (streaming logs)..." -ForegroundColor Cyan
Write-Host ""

# Ensure we're in the right directory
Set-Location $ProjectRoot

# Set environment variables expected by the frontend dev server
$env:BASE_PATH='/'

# Ensure PORT is not leaked from previous script runs (forces fallback to .env)
$env:PORT = $null
$env:VITE_PORT = $null

# Launch both services in parallel in this window
# Output will be interleaved and prefixed by package name
pnpm --filter @workspace/api-server --filter @workspace/trading-platform run --parallel dev

Write-Host ""
Write-Host "  Services stopped." -ForegroundColor Yellow
pause
