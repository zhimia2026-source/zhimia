# AURORA Video Studio — Windows bootstrap

## Current scope: read-only

The first local worker is intentionally limited to:
- Detecting installed Jianying Pro / CapCut versions from Windows uninstall registry entries and executable metadata.
- Reporting matching running processes and window titles.
- Inventorying supported media files under a chosen workspace.
- Validating a resident-authored edit plan and compiling an EDL.

It does **not** automate the Jianying UI yet. This prevents accidental edits while the exact installed build and UI layout are unknown.

## Requirements

- Windows 10/11
- Python 3.10+
- Repository checkout of this branch

No third-party Python packages or cloud API keys are required for these diagnostics.

## Run from the repository root (PowerShell)

```powershell
python windows_worker/aurora_video_worker.py diagnose
python windows_worker/aurora_video_worker.py scan-assets --workspace "$HOME\Videos\AURORA_Workspace"
```

To save the diagnostic report locally:

```powershell
python windows_worker/aurora_video_worker.py diagnose | Out-File -Encoding utf8 "$HOME\Desktop\aurora-jianying-diagnostic.json"
```

Review the report before sharing it. It may include your Windows account's install paths and computer name. Do not send passwords, tokens, or unrelated personal files.

## Safety boundary

- No network listener is started.
- No remote command execution.
- No arbitrary resident-supplied shell or Python code.
- No mouse/keyboard actions.
- No source media is modified.
- No export, overwrite, publish, or upload.
- UI automation will only be added after confirming the exact Jianying version and testing in a disposable project.
