# Read-only discovery for Jianying Pro on Windows.
# Does not launch, control, modify, or transmit anything.
$ErrorActionPreference = "SilentlyContinue"
$results = @()
$uninstallRoots = @(
  "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
  "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
  "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
)
foreach ($root in $uninstallRoots) {
  Get-ItemProperty $root | Where-Object {
    $_.DisplayName -match "剪映|CapCut"
  } | ForEach-Object {
    $exe = $null
    if ($_.InstallLocation) {
      $candidate = Join-Path $_.InstallLocation "JianyingPro.exe"
      if (Test-Path $candidate) { $exe = $candidate }
      if (-not $exe) {
        $candidate = Join-Path $_.InstallLocation "CapCut.exe"
        if (Test-Path $candidate) { $exe = $candidate }
      }
    }
    $fileVersion = $null
    if ($exe) { $fileVersion = (Get-Item $exe).VersionInfo.FileVersion }
    $results += [pscustomobject]@{
      DisplayName = $_.DisplayName
      DisplayVersion = $_.DisplayVersion
      InstallLocation = $_.InstallLocation
      Executable = $exe
      ExecutableVersion = $fileVersion
      Publisher = $_.Publisher
    }
  }
}
$processes = Get-Process | Where-Object { $_.ProcessName -match "Jianying|CapCut" } | ForEach-Object {
  [pscustomobject]@{ ProcessName = $_.ProcessName; Id = $_.Id; MainWindowTitle = $_.MainWindowTitle }
}
[pscustomobject]@{
  DetectedAt = (Get-Date).ToString("o")
  ComputerName = $env:COMPUTERNAME
  OS = (Get-CimInstance Win32_OperatingSystem).Caption
  Installations = $results
  RunningProcesses = @($processes)
  Mode = "read_only_diagnostic"
} | ConvertTo-Json -Depth 6
