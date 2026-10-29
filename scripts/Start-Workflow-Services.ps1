param(
    [ValidateSet('Start','Status','Stop')][string]$Action = 'Start',
    [string]$PublisherRoot = 'C:\Users\Chavd\Desktop\tiktok_publisher\tiktok_publisher',
    [string]$DatabasePath = '.data/whole-app-preview-20261027.db',
    [switch]$NoModels,
    [switch]$StopOwnedModels
)
$ErrorActionPreference = 'Stop'
$workflowWorkspace = Split-Path -Parent $PSScriptRoot
$workflowServiceRoot = Join-Path $workflowWorkspace '.data\workflow-services'
$workflowStatePath = Join-Path $workflowServiceRoot 'services.json'
$workflowBridgeScript = Join-Path $PSScriptRoot 'workflow-publisher-bridge.py'
$workflowOrigin = 'http://127.0.0.1:8881'

function Get-WorkflowHealth {
    try { return Invoke-RestMethod -Uri "$workflowOrigin/api/bootstrap" -TimeoutSec 2 } catch { return $null }
}
function Get-WorkflowModels {
    try { return @((Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2).models | ForEach-Object { $_.name }) } catch { return @() }
}

if ($Action -eq 'Status') {
    $workflowHealth = Get-WorkflowHealth
    [pscustomobject]@{ bridgeReady=($workflowHealth.bridge_mode -eq 'read_only'); origin=$workflowOrigin; postingWorkersStarted=$false; models=@(Get-WorkflowModels) } | ConvertTo-Json -Compress
    & (Join-Path $PSScriptRoot 'Start-Workflow-Worker.ps1') -Action Status -DatabasePath $DatabasePath
    exit 0
}

if ($Action -eq 'Stop') {
    & (Join-Path $PSScriptRoot 'Start-Workflow-Worker.ps1') -Action Stop -DatabasePath $DatabasePath
    if (-not (Test-Path -LiteralPath $workflowStatePath)) { Write-Output 'No launcher-owned bridge is recorded.'; exit 0 }
    $workflowSaved = Get-Content -LiteralPath $workflowStatePath -Raw | ConvertFrom-Json
    $workflowBridgeOwner = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$workflowSaved.bridgePid)" -ErrorAction SilentlyContinue
    if ($workflowBridgeOwner) {
        if (-not $workflowBridgeOwner.CommandLine.Contains($workflowBridgeScript)) { throw 'The recorded PID belongs to another process; nothing was stopped.' }
        Stop-Process -Id ([int]$workflowSaved.bridgePid) -ErrorAction Stop
    }
    if ($StopOwnedModels -and $workflowSaved.modelStartedByLauncher) {
        $workflowModelOwner = Get-Process -Id ([int]$workflowSaved.modelPid) -ErrorAction SilentlyContinue
        if ($workflowModelOwner) {
            if ($workflowModelOwner.Path -ne $workflowSaved.modelExecutable) { throw 'The recorded model PID belongs to another process; it was not stopped.' }
            Stop-Process -Id ([int]$workflowSaved.modelPid) -ErrorAction Stop
        }
    }
    Remove-Item -LiteralPath $workflowStatePath
    Write-Output 'The launcher-owned read-only bridge was stopped. Shared existing model servers remain running.'
    exit 0
}

$workflowPublisher = (Resolve-Path -LiteralPath $PublisherRoot).Path.TrimEnd('\')
if (-not (Test-Path -LiteralPath (Join-Path $workflowPublisher 'tiktok_clip_factory\studio\academy.py'))) { throw 'Choose the existing tiktok_publisher project root.' }
$workflowHasher = [Security.Cryptography.SHA256]::Create()
try { $workflowFingerprint = ([BitConverter]::ToString($workflowHasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($workflowPublisher.ToLowerInvariant())))).Replace('-','').ToLowerInvariant() } finally { $workflowHasher.Dispose() }
$workflowListener = Get-NetTCPConnection -LocalPort 8881 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($workflowListener) {
    $workflowHealth = Get-WorkflowHealth
    if ($workflowHealth.bridge_mode -ne 'read_only' -or $workflowHealth.source_fingerprint -ne $workflowFingerprint) { throw 'Port 8881 is used by another service. Nothing was stopped or replaced.' }
    [pscustomobject]@{ bridgeReady=$true; origin=$workflowOrigin; reused=$true; postingWorkersStarted=$false; models=@(Get-WorkflowModels) } | ConvertTo-Json -Compress
    & (Join-Path $PSScriptRoot 'Start-Workflow-Worker.ps1') -Action Start -DatabasePath $DatabasePath
    exit 0
}

New-Item -ItemType Directory -Path $workflowServiceRoot -Force | Out-Null
$workflowHadModels = [bool](Get-NetTCPConnection -LocalPort 11434 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1)
if (-not $NoModels) { & (Join-Path $workflowPublisher 'Start Local Models.ps1') -Quiet }
$workflowPython = Join-Path $workflowPublisher '.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $workflowPython)) { $workflowPython = (Get-Command python -ErrorAction Stop).Source }
$workflowBridge = Start-Process -FilePath $workflowPython -ArgumentList @('-u', ('"'+$workflowBridgeScript+'"'), '--publisher-root', ('"'+$workflowPublisher+'"'), '--port', '8881') -WorkingDirectory $workflowWorkspace -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $workflowServiceRoot 'bridge.stdout.log') -RedirectStandardError (Join-Path $workflowServiceRoot 'bridge.stderr.log')
$workflowModelListener = Get-NetTCPConnection -LocalPort 11434 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
$workflowState = [ordered]@{ bridgePid=$workflowBridge.Id; sourceFingerprint=$workflowFingerprint; modelStartedByLauncher=([bool]$workflowModelListener -and -not $workflowHadModels); modelPid=0; modelExecutable=(Join-Path $workflowPublisher 'data\studio\local-runtime\ollama\ollama.exe'); startedAt=[DateTime]::UtcNow.ToString('o') }
if ($workflowModelListener) { $workflowState.modelPid=$workflowModelListener.OwningProcess }
$workflowState | ConvertTo-Json | Set-Content -LiteralPath $workflowStatePath -Encoding utf8
for ($workflowAttempt=0; $workflowAttempt -lt 25; $workflowAttempt++) {
    if ($workflowBridge.HasExited) { throw 'The read-only bridge stopped. Inspect .data/workflow-services/bridge.stderr.log.' }
    $workflowHealth = Get-WorkflowHealth
    if ($workflowHealth.bridge_mode -eq 'read_only' -and $workflowHealth.source_fingerprint -eq $workflowFingerprint) {
        [pscustomobject]@{ bridgeReady=$true; origin=$workflowOrigin; postingWorkersStarted=$false; models=@(Get-WorkflowModels); serverEnvironment='WORKFLOW_PUBLISHER_ORIGIN=http://127.0.0.1:8881' } | ConvertTo-Json -Compress
        & (Join-Path $PSScriptRoot 'Start-Workflow-Worker.ps1') -Action Start -DatabasePath $DatabasePath
        exit 0
    }
    Start-Sleep -Milliseconds 300
}
throw 'The read-only bridge did not become ready. Inspect .data/workflow-services/bridge.stderr.log.'
