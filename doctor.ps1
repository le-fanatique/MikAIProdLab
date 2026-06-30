# MikAI Production Lab - environment diagnostic script
# Read-only: does not modify files, install packages, or run migrations.
# Usage: powershell -ExecutionPolicy Bypass -File .\doctor.ps1

Set-Location $PSScriptRoot
$ErrorActionPreference = "Continue"

$script:OkCount   = 0
$script:WarnCount = 0
$script:ErrCount  = 0

function Write-Step($msg) { Write-Host "`n--- $msg ---" -ForegroundColor Cyan }
function Write-OK($msg)   { Write-Host "  [OK]   $msg" -ForegroundColor Green;  $script:OkCount++ }
function Write-Warn($msg) { Write-Host "  [WARN] $msg" -ForegroundColor Yellow; $script:WarnCount++ }
function Write-Err($msg)  { Write-Host "  [ERR]  $msg" -ForegroundColor Red;    $script:ErrCount++ }
function Write-Info($msg) { Write-Host "         $msg" -ForegroundColor Gray }

function Test-Cmd($name) {
    return $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

# ---------------------------------------------------------------------------
# 1. Repo / working directory
# ---------------------------------------------------------------------------
Write-Step "Repo"

$pkgJson = Join-Path $PSScriptRoot "package.json"
if (Test-Path $pkgJson) {
    Write-OK "package.json found"
    Write-Info "Path: $PSScriptRoot"
} else {
    Write-Err "package.json not found - run this script from the project root."
}

if (Test-Cmd "git") {
    $branch   = git rev-parse --abbrev-ref HEAD 2>&1
    $headHash = git rev-parse --short HEAD 2>&1
    Write-OK "git: branch=$branch  HEAD=$headHash"
    $dirty = git status --porcelain 2>&1
    if ($dirty) {
        Write-Warn "Working tree has uncommitted changes."
    } else {
        Write-Info "Working tree clean."
    }
} else {
    Write-Warn "git not found - branch/status check skipped."
}

# ---------------------------------------------------------------------------
# 2. Node version
# ---------------------------------------------------------------------------
Write-Step "Node"

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
                break
            }
        }
    }
}

if (Test-Cmd "node") {
    $nodeVersionRaw = node --version 2>&1
    $nodeMajor = 0
    if ($nodeVersionRaw -match "v(\d+)\.") { $nodeMajor = [int]$Matches[1] }

    if ($nodeMajor -eq 22) {
        Write-OK "node $nodeVersionRaw (Node 22 LTS - required)"
    } elseif ($nodeMajor -gt 22) {
        Write-Err "node $nodeVersionRaw - Node 22 required. Node 24+ breaks better-sqlite3."
        Write-Info "Fix: nvm install 22 then nvm use 22"
    } else {
        Write-Warn "node $nodeVersionRaw - Node 22 LTS recommended."
        Write-Info "Fix: nvm install 22 then nvm use 22"
    }
} else {
    Write-Err "node not found. Install Node 22 LTS: nvm install 22 then nvm use 22"
}

# ---------------------------------------------------------------------------
# 3. npm
# ---------------------------------------------------------------------------
Write-Step "npm"

$npmExe = $null
foreach ($name in @("npm.cmd", "npm")) {
    $found = Get-Command $name -ErrorAction SilentlyContinue
    if ($found) { $npmExe = $found.Source; break }
}

if ($npmExe) {
    $npmVer = & $npmExe --version 2>&1
    Write-OK "npm $npmVer"
} else {
    Write-Err "npm not found - check Node installation."
}

# ---------------------------------------------------------------------------
# 4. Dependencies
# ---------------------------------------------------------------------------
Write-Step "Dependencies"

if (Test-Path "node_modules") {
    Write-OK "node_modules present"
} else {
    Write-Warn "node_modules missing - run setup-windows.ps1 or: npm.cmd ci"
}

# ---------------------------------------------------------------------------
# 5. Environment file
# ---------------------------------------------------------------------------
Write-Step "Environment"

if (Test-Path ".env.local") {
    Write-OK ".env.local present"
} else {
    Write-Warn ".env.local missing - copy .env.local.example to .env.local"
}

if (Test-Path ".env.local.example") {
    Write-OK ".env.local.example present"
} else {
    Write-Warn ".env.local.example missing"
}

# ---------------------------------------------------------------------------
# 6. Database
# ---------------------------------------------------------------------------
Write-Step "Database"

if (Test-Path "data") {
    Write-OK "data/ directory exists"
    $dbFiles = Get-ChildItem "data" -Filter "*.db" -ErrorAction SilentlyContinue
    if ($dbFiles -and $dbFiles.Count -gt 0) {
        foreach ($f in $dbFiles) {
            Write-OK "DB file: $($f.Name) ($([math]::Round($f.Length / 1KB, 1)) KB)"
        }
    } else {
        Write-Warn "No .db file in data/ - run: npm.cmd run db:migrate"
    }
} else {
    Write-Warn "data/ directory missing - run: npm.cmd run db:migrate"
}

# ---------------------------------------------------------------------------
# 7. Runtime folders
# ---------------------------------------------------------------------------
Write-Step "Runtime folders"

$runtimeDirs = @("public\uploads", "public\outputs", "storage", "storage\outputs")
foreach ($dir in $runtimeDirs) {
    if (Test-Path $dir) {
        Write-OK "$dir exists"
    } else {
        Write-Warn "$dir missing - run setup-windows.ps1 or create it manually."
    }
}

# ---------------------------------------------------------------------------
# 8. Git safety - verify .env.local is not tracked
# ---------------------------------------------------------------------------
Write-Step "Git safety"

if (Test-Cmd "git") {
    git ls-files --error-unmatch ".env.local" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-OK ".env.local is NOT tracked by git (correct)"
    } else {
        Write-Err ".env.local IS tracked by git - remove it: git rm --cached .env.local"
    }

    git ls-files --error-unmatch "data" 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-OK "data/ is NOT tracked by git (correct)"
    } else {
        Write-Err "data/ IS tracked by git - contains local DB. Add data/ to .gitignore."
    }
} else {
    Write-Warn "git not found - git safety checks skipped."
}

# ---------------------------------------------------------------------------
# 9. Optional local services
# ---------------------------------------------------------------------------
Write-Step "Local services (optional)"

$comfyUrl  = "http://127.0.0.1:8188"
$ollamaUrl = "http://127.0.0.1:11434"

if (Test-Path ".env.local") {
    $envLines = Get-Content ".env.local" -ErrorAction SilentlyContinue
    foreach ($line in $envLines) {
        if ($line -match "^COMFY_BASE_URL\s*=\s*(.+)$")  { $comfyUrl  = $Matches[1].Trim() }
        if ($line -match "^OLLAMA_BASE_URL\s*=\s*(.+)$") { $ollamaUrl = $Matches[1].Trim() }
    }
}

Write-Info "ComfyUI: $comfyUrl"
try {
    $resp = Invoke-WebRequest -Uri "$comfyUrl/system_stats" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
    if ($resp.StatusCode -eq 200) {
        Write-OK "ComfyUI reachable at $comfyUrl"
    } else {
        Write-Warn "ComfyUI responded HTTP $($resp.StatusCode)"
    }
} catch {
    Write-Warn "ComfyUI not reachable at $comfyUrl - start ComfyUI for image/video generation."
}

Write-Info "Ollama: $ollamaUrl"
try {
    $resp = Invoke-WebRequest -Uri "$ollamaUrl/api/tags" -TimeoutSec 3 -UseBasicParsing -ErrorAction Stop
    if ($resp.StatusCode -eq 200) {
        Write-OK "Ollama reachable at $ollamaUrl"
    } else {
        Write-Warn "Ollama responded HTTP $($resp.StatusCode)"
    }
} catch {
    Write-Warn "Ollama not reachable at $ollamaUrl - start Ollama for local LLM."
}

# ---------------------------------------------------------------------------
# 10. Summary
# ---------------------------------------------------------------------------
Write-Host ""
Write-Host "======================================" -ForegroundColor Cyan
Write-Host "  MikAI Doctor Summary" -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan
Write-Host ("  OK:      {0}" -f $script:OkCount)   -ForegroundColor Green
Write-Host ("  WARNING: {0}" -f $script:WarnCount) -ForegroundColor Yellow
Write-Host ("  ERROR:   {0}" -f $script:ErrCount)  -ForegroundColor Red
Write-Host ""

if ($script:ErrCount -gt 0) {
    Write-Host "  Errors found - fix them before starting the app." -ForegroundColor Red
    exit 1
} elseif ($script:WarnCount -gt 0) {
    Write-Host "  Warnings found - app may not work fully until resolved." -ForegroundColor Yellow
    exit 0
} else {
    Write-Host "  All checks passed." -ForegroundColor Green
    exit 0
}
