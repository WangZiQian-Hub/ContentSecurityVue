# Start the Content Security Platform backend (FastAPI + uvicorn).
# Usage:  .\start.ps1
# Optional port override:  .\start.ps1 -Port 8020

param(
    [int]$Port = 8000,
    [string]$HostAddress = "127.0.0.1"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".env")) {
    Write-Host "[!] .env not found. Creating it from .env.example ..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"
    Write-Host "[!] Fill in MYSQL_PASSWORD and SSH_PASSWORD in .env, then run this script again." -ForegroundColor Red
    exit 1
}

Write-Host "[*] Starting backend on http://${HostAddress}:${Port}" -ForegroundColor Cyan
Write-Host "[*] Health check: http://${HostAddress}:${Port}/health" -ForegroundColor Cyan
Write-Host "[*] API docs:     http://${HostAddress}:${Port}/docs" -ForegroundColor Cyan

uv run uvicorn app.main:app --app-dir . --reload --host $HostAddress --port $Port
