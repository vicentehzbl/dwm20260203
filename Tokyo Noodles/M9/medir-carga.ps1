$ErrorActionPreference = 'Stop'

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$backendRoot = (Resolve-Path (Join-Path $projectRoot 'MODULO 3\backend')).Path
$nodePath = (Get-Command node -ErrorAction Stop).Source
$evidencePath = Join-Path $PSScriptRoot 'evidencia-carga.json'
$logicalProcessors = [Environment]::ProcessorCount
$baselineNodeIds = @(Get-Process -Name node -ErrorAction SilentlyContinue | ForEach-Object { [int]$_.Id })
$backendProcessIds = @()
$backendSupervisor = $null
$loadProcess = $null
$stdoutLog = Join-Path $env:TEMP ("tokyo-m9-" + [guid]::NewGuid().ToString('N') + '.out')
$stderrLog = Join-Path $env:TEMP ("tokyo-m9-" + [guid]::NewGuid().ToString('N') + '.err')

function Get-BackendSample {
  $processes = @($backendProcessIds | ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue } | Where-Object { $_ })
  [pscustomobject]@{
    processCount = $processes.Count
    cpuSeconds = [double](($processes | Measure-Object -Property CPU -Sum).Sum)
    workingSetBytes = [long](($processes | Measure-Object -Property WorkingSet64 -Sum).Sum)
  }
}

try {
  # Start a fresh local backend so its Node PIDs can be identified without WMI permissions.
  $backendSupervisor = Start-Process -FilePath $nodePath -ArgumentList @('dev.js') `
    -WorkingDirectory $backendRoot -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput $stdoutLog -RedirectStandardError $stderrLog

  $healthy = $false
  for ($attempt = 0; $attempt -lt 60; $attempt++) {
    try {
      $health = Invoke-RestMethod -Uri 'http://127.0.0.1:4000/health' -TimeoutSec 5
      $dependencies = @($health.dependencies.PSObject.Properties)
      if ($health.service -eq 'gateway' -and $dependencies.Count -gt 0 -and @($dependencies | Where-Object { $_.Value -ne $true }).Count -eq 0) {
        $healthy = $true
        break
      }
    } catch { }
    Start-Sleep -Milliseconds 500
  }
  if (-not $healthy) {
    $startupDetails = Get-Content -Raw -LiteralPath $stderrLog -ErrorAction SilentlyContinue
    throw "El API Gateway no quedó healthy en 30 segundos. Revisa backend/.env. $startupDetails"
  }

  $backendProcessIds = @(Get-Process -Name node -ErrorAction SilentlyContinue |
    Where-Object { $baselineNodeIds -notcontains [int]$_.Id } |
    ForEach-Object { [int]$_.Id })
  if ($backendProcessIds.Count -lt 6) {
    throw "Solo se identificaron $($backendProcessIds.Count) procesos Node nuevos; se esperaban al menos seis servicios del backend."
  }

  $initial = Get-BackendSample
  $peakWorkingSet = $initial.workingSetBytes
  $sampleCount = 0
  $start = Get-Date
  $loadProcess = Start-Process -FilePath $nodePath -ArgumentList @('M9/prueba-carga.mjs') `
    -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $evidencePath
  do {
    $sample = Get-BackendSample
    if ($sample.workingSetBytes -gt $peakWorkingSet) { $peakWorkingSet = $sample.workingSetBytes }
    $sampleCount += 1
    Start-Sleep -Milliseconds 10
    $loadProcess.Refresh()
  } while (-not $loadProcess.HasExited)
  $loadProcess.WaitForExit()
  $loadProcess.Refresh()
  $end = Get-Date
  $final = Get-BackendSample

  $load = Get-Content -Raw -LiteralPath $evidencePath | ConvertFrom-Json
  if ($load.requestsCompleted -ne $load.requestsPlanned -or $load.errorRate -ne 0) {
    throw "La carga registró solicitudes fallidas: completadas $($load.requestsCompleted) de $($load.requestsPlanned), errorRate=$($load.errorRate)."
  }
  $durationSeconds = [Math]::Max(($end - $start).TotalSeconds, 0.001)
  $cpuDelta = [Math]::Max($final.cpuSeconds - $initial.cpuSeconds, 0)
  $cpuPercent = 100 * $cpuDelta / ($durationSeconds * $logicalProcessors)
  $os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
  $cpuName = (Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Name)
  $result = [ordered]@{
    measurement = $load
    machine = [ordered]@{
      os = if ($os) { $os.Caption } else { [Environment]::OSVersion.VersionString }
      cpuModel = if ($cpuName) { $cpuName } else { 'No disponible en este entorno' }
      logicalProcessors = $logicalProcessors
      physicalMemoryGB = if ($os) { [Math]::Round($os.TotalVisibleMemorySize / 1MB, 2) } else { $null }
    }
    backendResources = [ordered]@{
      backendNodeProcessCount = $final.processCount
      samplingDurationSeconds = [Math]::Round($durationSeconds, 4)
      cpuSecondsDelta = [Math]::Round($cpuDelta, 4)
      averageHostCpuPercentForBackendProcesses = [Math]::Round($cpuPercent, 2)
      initialSampledWorkingSetMB = [Math]::Round($initial.workingSetBytes / 1MB, 2)
      peakSampledWorkingSetMB = [Math]::Round($peakWorkingSet / 1MB, 2)
      peakWorkingSetGrowthMB = [Math]::Round([Math]::Max($peakWorkingSet - $initial.workingSetBytes, 0) / 1MB, 2)
      sampleIntervalMs = 10
      memorySampleCount = $sampleCount
    }
  }
  $json = $result | ConvertTo-Json -Depth 8
  Set-Content -LiteralPath $evidencePath -Value $json -Encoding utf8
  $json
}
finally {
  if ($backendProcessIds.Count -eq 0) {
    $backendProcessIds = @(Get-Process -Name node -ErrorAction SilentlyContinue |
      Where-Object { $baselineNodeIds -notcontains [int]$_.Id } |
      ForEach-Object { [int]$_.Id })
  }
  if ($backendProcessIds.Count -gt 0) {
    $backendProcessIds | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
  }
  if ($backendSupervisor -and -not $backendSupervisor.HasExited) {
    Stop-Process -Id $backendSupervisor.Id -Force -ErrorAction SilentlyContinue
  }
  foreach ($logPath in @($stdoutLog, $stderrLog)) {
    if ([System.IO.File]::Exists($logPath)) { [System.IO.File]::Delete($logPath) }
  }
}
