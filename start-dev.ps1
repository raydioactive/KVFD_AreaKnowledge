#!/usr/bin/env pwsh
# MoCo EMS Trainer - Development Startup Script
# Launches all 4 services in separate windows

Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  MoCo EMS Trainer - Starting Development Mode" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

$projectRoot = $PSScriptRoot

# Terminal 1: GraphHopper (Java Routing Engine)
Write-Host "[1/4] Starting GraphHopper..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$projectRoot\backend'; .\venv\Scripts\Activate.ps1; cd ..; Write-Host 'GraphHopper Routing Engine' -ForegroundColor Green; py routing/start_graphhopper.py --verbose"

# Wait 2 seconds before starting next service
Start-Sleep -Seconds 2

# Terminal 2: Python Backend (FastAPI)
Write-Host "[2/4] Starting Python Backend..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$projectRoot\backend'; .\venv\Scripts\Activate.ps1; Write-Host 'Python Backend (FastAPI)' -ForegroundColor Green; python app\main.py"

# Wait 2 seconds
Start-Sleep -Seconds 2

# Terminal 3: Frontend Dev Server (Vite)
Write-Host "[3/4] Starting Frontend Dev Server..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$projectRoot\frontend'; Write-Host 'Frontend Dev Server (Vite)' -ForegroundColor Green; npm run dev"

# Wait 5 seconds for backend to be ready
Start-Sleep -Seconds 5

# Terminal 4: Electron App (Main Window)
Write-Host "[4/4] Starting Electron App..." -ForegroundColor Yellow
Write-Host ""
Write-Host "================================================" -ForegroundColor Green
Write-Host "  All services starting!" -ForegroundColor Green
Write-Host "  Electron will NOT spawn Python (already running)" -ForegroundColor Yellow
Write-Host "  Close individual terminals to stop each service." -ForegroundColor Yellow
Write-Host "================================================" -ForegroundColor Green
Write-Host ""

cd $projectRoot
$env:NODE_ENV = "development"
$env:SKIP_PYTHON_SPAWN = "true"
npm run dev