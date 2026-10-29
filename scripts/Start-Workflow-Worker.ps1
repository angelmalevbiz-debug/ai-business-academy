param(
    [ValidateSet('Start','Status','Stop')][string]$Action='Start',
    [string]$DatabasePath='.data/whole-app-preview-20261027.db'
)
$ErrorActionPreference='Stop'
$workflowWorkspace=Split-Path -Parent $PSScriptRoot
$workflowDatabase=[IO.Path]::GetFullPath($(if([IO.Path]::IsPathRooted($DatabasePath)){$DatabasePath}else{Join-Path $workflowWorkspace $DatabasePath}))
if (-not $workflowDatabase.StartsWith($workflowWorkspace+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'Choose a database inside the Academy workspace.' }
$workflowHasher=[Security.Cryptography.SHA256]::Create()
try { $workflowFingerprint=([BitConverter]::ToString($workflowHasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($workflowDatabase.ToLowerInvariant())))).Replace('-','').ToLowerInvariant().Substring(0,16) } finally { $workflowHasher.Dispose() }
$workflowRoot=Join-Path $workflowWorkspace '.data\workflow-services'
$workflowHeartbeat=Join-Path $workflowRoot "worker-$workflowFingerprint.json"
$workflowStop=Join-Path $workflowRoot "worker-$workflowFingerprint.stop"
$workflowScript=Join-Path $PSScriptRoot 'workflow-worker.ts'
function Get-WorkflowWorker {
    if (-not (Test-Path -LiteralPath $workflowHeartbeat)) { return $null }
    try {
        $workflowSaved=Get-Content -LiteralPath $workflowHeartbeat -Raw | ConvertFrom-Json
        $workflowProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$workflowSaved.pid)" -ErrorAction SilentlyContinue
        $workflowAge=([DateTimeOffset]::UtcNow-[DateTimeOffset]$workflowSaved.lastSeen).TotalSeconds
        $workflowFresh=$workflowAge -ge 0 -and $workflowAge -lt 10
        if ($workflowProcess -and $workflowProcess.CommandLine -and $workflowProcess.CommandLine.Contains($workflowScript) -and $workflowFresh -and $workflowSaved.state -in @('idle','running')) { return $workflowSaved }
    } catch { }
    return $null
}
if ($Action -eq 'Status') { $workflowWorker=Get-WorkflowWorker; [pscustomobject]@{available=[bool]$workflowWorker;databaseFingerprint=$workflowFingerprint;state=$workflowWorker.state;pid=$workflowWorker.pid} | ConvertTo-Json -Compress; exit 0 }
if ($Action -eq 'Stop') {
    $workflowWorker=Get-WorkflowWorker
    if (-not $workflowWorker) { Write-Output 'No matching active worker is recorded.'; exit 0 }
    Set-Content -LiteralPath $workflowStop -Value 'Stop after the current bounded local model request.'
    Write-Output 'Stop requested. The worker will finish its current local request, preserve the queue and exit. No model or publisher service was stopped.'
    exit 0
}
$workflowWorker=Get-WorkflowWorker
if ($workflowWorker) { [pscustomobject]@{available=$true;reused=$true;pid=$workflowWorker.pid;databaseFingerprint=$workflowFingerprint} | ConvertTo-Json -Compress; exit 0 }
if(Test-Path -LiteralPath $workflowHeartbeat){
    try{
        $workflowOld=Get-Content -LiteralPath $workflowHeartbeat -Raw | ConvertFrom-Json
        $workflowOldProcess=Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$workflowOld.pid)" -ErrorAction SilentlyContinue
    }catch{$workflowOldProcess=$null}
    if($workflowOldProcess -and $workflowOldProcess.CommandLine -and $workflowOldProcess.CommandLine.Contains($workflowScript)){throw 'The existing worker is stopping or has a stale heartbeat. Wait for its bounded request to finish before starting another worker.'}
}
New-Item -ItemType Directory -Path $workflowRoot -Force | Out-Null
if (Test-Path -LiteralPath $workflowStop) { Remove-Item -LiteralPath $workflowStop }
$workflowNode=(Get-Command node -ErrorAction Stop).Source
$workflowTsx=Join-Path $workflowWorkspace 'node_modules\tsx\dist\cli.mjs'
if (-not (Test-Path -LiteralPath $workflowTsx)) { throw 'Install the existing Academy dependencies before starting its worker.' }
$workflowEnvironment=@{COMMUNITY_DB_PATH=$workflowDatabase;WORKFLOW_AI_PROVIDER='ollama';WORKFLOW_AI_MODEL='qwen3:8b';WORKFLOW_OLLAMA_ORIGIN='http://127.0.0.1:11434'}
$workflowPrevious=@{}
try {
    foreach($workflowKey in $workflowEnvironment.Keys){$workflowPrevious[$workflowKey]=[Environment]::GetEnvironmentVariable($workflowKey,'Process');[Environment]::SetEnvironmentVariable($workflowKey,$workflowEnvironment[$workflowKey],'Process')}
    $workflowProcess=Start-Process -FilePath $workflowNode -ArgumentList @('--env-file-if-exists=.env.local',('"'+$workflowTsx+'"'),('"'+$workflowScript+'"')) -WorkingDirectory $workflowWorkspace -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $workflowRoot "worker-$workflowFingerprint.stdout.log") -RedirectStandardError (Join-Path $workflowRoot "worker-$workflowFingerprint.stderr.log")
} finally {foreach($workflowKey in $workflowEnvironment.Keys){[Environment]::SetEnvironmentVariable($workflowKey,$workflowPrevious[$workflowKey],'Process')}}
for($workflowAttempt=0;$workflowAttempt -lt 30;$workflowAttempt++) {
    if($workflowProcess.HasExited){throw 'The draft worker stopped during startup. Inspect its scoped stderr log.'}
    $workflowWorker=Get-WorkflowWorker
    if($workflowWorker){[pscustomobject]@{available=$true;pid=$workflowWorker.pid;databaseFingerprint=$workflowFingerprint;externalPublishing=$false} | ConvertTo-Json -Compress;exit 0}
    Start-Sleep -Milliseconds 300
}
throw 'The worker did not produce a fresh heartbeat. Inspect its scoped log.'
