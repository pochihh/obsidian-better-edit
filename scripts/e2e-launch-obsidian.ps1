param(
	[int]$DebugPort = 9222,
	[string]$VaultName = "test_vault",
	[string]$ObsidianPath = "$env:LOCALAPPDATA\Programs\Obsidian\Obsidian.exe"
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $ObsidianPath)) {
	throw "Obsidian executable not found: $ObsidianPath"
}

$existing = Get-Process Obsidian -ErrorAction SilentlyContinue
if ($existing) {
	$existing | ForEach-Object {
		Write-Output "Stopping existing Obsidian process $($_.Id) $($_.MainWindowTitle)"
		Stop-Process -Id $_.Id -Force
	}
	Start-Sleep -Seconds 2
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

Write-Output "Launching Obsidian: $ObsidianPath $($arguments -join ' ')"
$process = Start-Process -FilePath $ObsidianPath -ArgumentList $arguments -PassThru
Write-Output "Started Obsidian process $($process.Id)"

$deadline = (Get-Date).AddSeconds(45)
do {
	Start-Sleep -Milliseconds 500
	$listener = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue |
		Where-Object { $_.LocalPort -eq $DebugPort }
	if ($listener) {
		Write-Output "Debug port $DebugPort is listening"
		exit 0
	}
} while ((Get-Date) -lt $deadline)

throw "Obsidian did not open debug port $DebugPort within 45 seconds"
