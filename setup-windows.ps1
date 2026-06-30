# MikAI Production Lab - Windows setup script
# Prepares a fresh clone for development on Windows.
# Usage: powershell -ExecutionPolicy Bypass -File .\setup-windows.ps1

Set-Location $PSScriptRoot
$ErrorActionPreference = "Continue"

$script:Results = @{
    Node      = "FAIL"
    Npm       = "FAIL"
    EnvLocal  = "?"
    Folders   = "?"
    NpmCi     = "FAIL"
    DbMigrate = "FAIL"
}

function Write-Step($msg) { Write-Host "`n[setup] $msg" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "  OK    $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  WARN  $msg" -ForegroundColor Yellow }
function Write-Err($msg)  { Write-Host "  ERROR $msg" -ForegroundColor Red }

function Test-Cmd($name) {
    return $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

# ---------------------------------------------------------------------------
# 1. Git check (informational - not required if already cloned)
# ---------------------------------------------------------------------------
Write-Step "Git"
if (Test-Cmd "git") {
    $gv = git --version 2>&1
    Write-OK $gv
} else {
    Write-Warn "git not found - install from https://git-scm.com if you need to pull updates."
}

# ---------------------------------------------------------------------------
# 2. Detect Node/npm - try NVM Windows locations if not in PATH
# ---------------------------------------------------------------------------
Write-Step "Node / npm detection"

if (-not (Test-Cmd "node")) {
    $candidates = @(
        $env:NVM_SYMLINK,
        (Join-Path $env:NVM_HOME "nodejs"),
        "C:\nvm4w\nodejs",
        (Join-Path $env:LOCALAPPDATA "nvm\nodejs"),
        "C:\Program Files\nodejs",
        "C:\Program Files (x86)\nodejs"
    )
    foreach ($dir in $candidates) {
        if (-not [string]::IsNullOrWhiteSpace($dir)) {
            $resolved = [System.IO.Path]::GetFullPath($dir)
            if (Test-Path "$resolved\node.exe") {
                $env:PATH = "$resolved;" + $env:PATH
                Write-OK "Added to PATH: $resolved"
                break
            }
        }
    }
}

# ---------------------------------------------------------------------------
# 3. Verify Node version == 22
# ---------------------------------------------------------------------------
Write-Step "Node version check"

if (-not (Test-Cmd "node")) {
    Write-Err "node not found. Install Node 22 LTS via NVM:"
    Write-Err "  nvm install 22"
    Write-Err "  nvm use 22"
    Write-Host ""
    Write-Host "Aborting setup." -ForegroundColor Red
    exit 1
}

$nodeVersionRaw = node --version 2>&1
$nodeMajor = 0
if ($nodeVersionRaw -match "v(\d+)\.") { $nodeMajor = [int]$Matches[1] }

if ($nodeMajor -eq 22) {
    Write-OK "node $nodeVersionRaw (Node 22 LTS - required)"
    $script:Results.Node = "OK"
} else {
    Write-Err "node $nodeVersionRaw - MikAI requires Node 22 LTS."
    Write-Err "  Node 24 is not supported (better-sqlite3 native bindings unavailable)."
    Write-Err "  Fix: nvm install 22 then nvm use 22"
    Write-Host ""
    Write-Host "Aborting setup." -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------------------
# 4. Verify npm
# ---------------------------------------------------------------------------
Write-Step "npm"

$npmExe = $null
foreach ($name in @("npm.cmd", "npm")) {
    $found = Get-Command $name -ErrorAction SilentlyContinue
    if ($found) { $npmExe = $found.Source; break }
}

if (-not $npmExe) {
    Write-Err "npm not found. Check your Node installation."
    exit 1
}

$npmVersion = & $npmExe --version 2>&1
Write-OK "npm $npmVersion"
$script:Results.Npm = "OK"

# ---------------------------------------------------------------------------
# 5. Copy .env.local from example if missing
# ---------------------------------------------------------------------------
Write-Step ".env.local"

if (Test-Path ".env.local") {
    Write-OK ".env.local already exists - not overwritten."
    $script:Results.EnvLocal = "already existed"
} elseif (Test-Path ".env.local.example") {
    Copy-Item ".env.local.example" ".env.local"
    Write-OK ".env.local created from .env.local.example."
    Write-Warn "Review .env.local and set your API keys / paths as needed."
    $script:Results.EnvLocal = "created"
} else {
    Write-Warn ".env.local.example not found - could not create .env.local."
    $script:Results.EnvLocal = "missing example"
}

# ---------------------------------------------------------------------------
# 6. Create runtime directories if absent
# ---------------------------------------------------------------------------
Write-Step "Runtime directories"

$dirs    = @("data", "public\uploads", "public\outputs", "storage", "storage\outputs")
$created = @()
$existed = @()

foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
        $created += $dir
    } else {
        $existed += $dir
    }
}

if ($created.Count -gt 0) { Write-OK "Created: $($created -join ', ')" }
if ($existed.Count -gt 0) { Write-OK "Already exist: $($existed -join ', ')" }
$script:Results.Folders = if ($created.Count -gt 0) { "created $($created.Count)" } else { "all existed" }

# ---------------------------------------------------------------------------
# 7. npm ci
# ---------------------------------------------------------------------------
Write-Step "npm ci (install dependencies)"

& $npmExe ci
if ($LASTEXITCODE -eq 0) {
    Write-OK "Dependencies installed."
    $script:Results.NpmCi = "OK"
} else {
    Write-Err "npm ci failed (exit code $LASTEXITCODE). Check output above."
    $script:Results.NpmCi = "FAIL"
    Write-Host "Aborting setup." -ForegroundColor Red
    exit 1
}

# ---------------------------------------------------------------------------
# 8. npm run db:migrate
# ---------------------------------------------------------------------------
Write-Step "Database migrations"

& $npmExe run db:migrate
if ($LASTEXITCODE -eq 0) {
    Write-OK "Migrations applied."
    $script:Results.DbMigrate = "OK"
} else {
    Write-Err "db:migrate failed (exit code $LASTEXITCODE). Check output above."
    $script:Results.DbMigrate = "FAIL"
    exit 1
}

# ---------------------------------------------------------------------------
# 9. Summary
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  MikAI Setup Summary" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

function Write-SummaryLine($label, $value) {
    $color = if ($value -like "*FAIL*" -or $value -like "*ERROR*") { "Red" }
             elseif ($value -like "*WARN*" -or $value -like "*missing*") { "Yellow" }
             else { "Green" }
    Write-Host ("  {0,-16} {1}" -f $label, $value) -ForegroundColor $color
}

Write-SummaryLine "Node"       $script:Results.Node
Write-SummaryLine "npm"        $script:Results.Npm
Write-SummaryLine ".env.local" $script:Results.EnvLocal
Write-SummaryLine "Folders"    $script:Results.Folders
Write-SummaryLine "npm ci"     $script:Results.NpmCi
Write-SummaryLine "db:migrate" $script:Results.DbMigrate

Write-Host ""
Write-Host "  Setup complete. Start the dev server:" -ForegroundColor Cyan
Write-Host ""
Write-Host "    npm.cmd run dev:host" -ForegroundColor White
Write-Host "    # or"
Write-Host "    powershell -ExecutionPolicy Bypass -File .\start-dev.ps1" -ForegroundColor White
Write-Host ""
