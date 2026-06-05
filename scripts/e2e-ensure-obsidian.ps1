param(
	[int]$DebugPort = 9222,
	[string]$VaultName = "test_vault",
	[string]$ObsidianPath = "$env:LOCALAPPDATA\Programs\Obsidian\Obsidian.exe",
	[switch]$RestartIfNeeded
)

$ErrorActionPreference = "Stop"

function Test-CdpEndpoint {
	param([int]$Port)
	try {
		$response = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/json/version" -TimeoutSec 2
		return [bool]$response.webSocketDebuggerUrl
	} catch {
		return $false
	}
}

if (Test-CdpEndpoint -Port $DebugPort) {
	Write-Output "Obsidian CDP endpoint is already available at http://127.0.0.1:$DebugPort"
	exit 0
}

$existing = Get-Process Obsidian -ErrorAction SilentlyContinue
if ($existing -and -not $RestartIfNeeded) {
	$processList = ($existing | ForEach-Object { "$($_.Id) $($_.MainWindowTitle)" }) -join "; "
	throw "Obsidian is already running but http://127.0.0.1:$DebugPort/json/version is not reachable. Close/relaunch Obsidian with --remote-debugging-port=$DebugPort, or run this script with -RestartIfNeeded. Running processes: $processList"
}

if ($existing -and $RestartIfNeeded) {
	$existing | ForEach-Object {
		Write-Output "Stopping existing Obsidian process $($_.Id) $($_.MainWindowTitle)"
		Stop-Process -Id $_.Id -Force
	}
	Start-Sleep -Seconds 2
}

if (!(Test-Path $ObsidianPath)) {
	throw "Obsidian executable not found: $ObsidianPath"
}

$existingListener = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
	Where-Object { $_.LocalPort -eq $DebugPort }
if ($existingListener) {
	$owners = $existingListener | Select-Object -ExpandProperty OwningProcess -Unique
	throw "Debug port $DebugPort is already in use by process id(s): $($owners -join ', ')"
}

$arguments = @(
	"--remote-debugging-port=$DebugPort",
	"obsidian://open?vault=$VaultName"
)

Write-Output "Launching Obsidian with CDP: $ObsidianPath $($arguments -join ' ')"
$process = Start-Process -FilePath $ObsidianPath -ArgumentList $arguments -PassThru
Write-Output "Started Obsidian process $($process.Id)"

$deadline = (Get-Date).AddSeconds(45)
do {
	Start-Sleep -Milliseconds 500
	if (Test-CdpEndpoint -Port $DebugPort) {
		Write-Output "Obsidian CDP endpoint is ready at http://127.0.0.1:$DebugPort"
		exit 0
	}
} while ((Get-Date) -lt $deadline)

throw "Obsidian did not expose CDP endpoint http://127.0.0.1:$DebugPort/json/version within 45 seconds"
