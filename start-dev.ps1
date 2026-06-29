# MikAI Production Lab — Windows dev server launcher
# Usage: powershell -ExecutionPolicy Bypass -File .\start-dev.ps1
#
# Starts the Next.js dev server on all network interfaces (0.0.0.0:3000)
# so it is reachable from other devices on the local network.

Set-Location $PSScriptRoot

# ---------------------------------------------------------------------------
# Ensure node / npm.cmd are on the PATH
# Try common NVM Windows install locations if node is not already found.
# ---------------------------------------------------------------------------

function Test-Command($name) {
    return $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

if (-not (Test-Command "node")) {
    $candidates = @(
        "$env:NVM_SYMLINK",
        "$env:APPDATA\..\Local\nvm\nodejs",
        "C:\nvm4w\nodejs",
        "C:\Program Files\nodejs",
        "C:\Program Files (x86)\nodejs"
    )
    foreach ($dir in $candidates) {
        $resolved = [System.IO.Path]::GetFullPath($dir)
        if (Test-Path "$resolved\node.exe") {
            $env:PATH = "$resolved;" + $env:PATH
            Write-Host "[start-dev] Added to PATH: $resolved"
            break
        }
    }
}

# ---------------------------------------------------------------------------
# Verify environment
# ---------------------------------------------------------------------------

if (-not (Test-Command "node")) {
    Write-Error "[start-dev] node not found. Install Node 22 LTS via NVM: nvm install 22 && nvm use 22"
    exit 1
}

$nodeVersion = node --version
Write-Host "[start-dev] node $nodeVersion"

$npmCmd = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
if (-not $npmCmd) {
    $npmCmd = Get-Command "npm" -ErrorAction SilentlyContinue
}
if (-not $npmCmd) {
    Write-Error "[start-dev] npm not found. Check your Node installation."
    exit 1
}

$npmVersion = & $npmCmd.Source --version
Write-Host "[start-dev] npm $npmVersion"

# ---------------------------------------------------------------------------
# Start dev server
# ---------------------------------------------------------------------------

Write-Host "[start-dev] Starting MikAI on http://0.0.0.0:3000 ..."
& $npmCmd.Source run dev:host
