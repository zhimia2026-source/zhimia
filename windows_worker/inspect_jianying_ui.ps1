# Read-only Windows UI Automation inspection for Jianying Pro / CapCut.
# Does not click, type, launch, modify, or transmit anything.
$ErrorActionPreference = "Stop"
try {
  Add-Type -AssemblyName UIAutomationClient
  Add-Type -AssemblyName UIAutomationTypes
} catch {
  [pscustomobject]@{ status = "uia_unavailable"; error = $_.Exception.Message; mode = "read_only" } | ConvertTo-Json -Depth 4
  exit 0
}
$targets = @(Get-Process | Where-Object { $_.ProcessName -match "Jianying|CapCut" -and $_.MainWindowHandle -ne 0 })
if ($targets.Count -eq 0) {
  [pscustomobject]@{ status = "app_window_not_found"; hint = "Open Jianying Pro manually, then rerun inspect-ui."; mode = "read_only" } | ConvertTo-Json -Depth 4
  exit 0
}
$windows = @()
foreach ($proc in $targets) {
  try {
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($proc.MainWindowHandle)
    $items = New-Object System.Collections.Generic.List[object]
    $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
    $queue = New-Object System.Collections.Queue
    $queue.Enqueue(@($root, 0))
    while ($queue.Count -gt 0 -and $items.Count -lt 300) {
      $entry = $queue.Dequeue()
      $element = $entry[0]
      $depth = [int]$entry[1]
      try {
        $items.Add([pscustomobject]@{
          depth = $depth
          control_type = $element.Current.ControlType.ProgrammaticName
          name = $element.Current.Name
          automation_id = $element.Current.AutomationId
          class_name = $element.Current.ClassName
          is_enabled = $element.Current.IsEnabled
          is_offscreen = $element.Current.IsOffscreen
        })
      } catch {}
      if ($depth -lt 8) {
        $child = $walker.GetFirstChild($element)
        while ($null -ne $child -and $queue.Count -lt 1000) {
          $queue.Enqueue(@($child, $depth + 1))
          $child = $walker.GetNextSibling($child)
        }
      }
    }
    $windows += [pscustomobject]@{ process_name = $proc.ProcessName; process_id = $proc.Id; window_title = $proc.MainWindowTitle; controls = @($items) }
  } catch {
    $windows += [pscustomobject]@{ process_name = $proc.ProcessName; process_id = $proc.Id; error = $_.Exception.Message }
  }
}
[pscustomobject]@{
  status = "inspected"; mode = "read_only"; generated_at = (Get-Date).ToString("o")
  windows = $windows; limits = @{ max_controls_per_window = 300; max_depth = 8; no_interaction = $true }
} | ConvertTo-Json -Depth 8
