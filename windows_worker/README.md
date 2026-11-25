# AURORA Video Studio — Windows bootstrap

## Current scope: read-only

The local worker supports installed Jianying Pro / CapCut version detection, accessibility (UI Automation) inspection of an already-open editor window, supported-media inventory, and edit-plan validation / EDL compilation.

It does **not** click, type, launch Jianying, alter a project, render, export, upload, or modify source media. UIA inspection only reads accessibility metadata and is bounded to 300 controls and depth 8 per window.

## Requirements

- Windows 10/11
- Python 3.10+
- Repository checkout of the deployed main branch

No third-party Python packages or cloud API keys are required.

## Run from the repository root (PowerShell)

1. Identify the installed build:

```powershell
python windows_worker/aurora_video_worker.py diagnose
```

2. Manually open Jianying Pro, then inspect its exposed UI controls:

```powershell
python windows_worker/aurora_video_worker.py inspect-ui
```

3. Optional media inventory:

```powershell
python windows_worker/aurora_video_worker.py scan-assets --workspace "$HOME\Videos\AURORA_Workspace"
```

To save the UIA report:

```powershell
python windows_worker/aurora_video_worker.py inspect-ui | Out-File -Encoding utf8 "$HOME\Desktop\aurora-jianying-uia.json"
```

Review reports before sharing; they may include local paths, window titles, project names, and control labels. Remove private information first.

## Safety boundary

- No network listener or remote command execution.
- No arbitrary resident-supplied shell or Python code.
- No mouse/keyboard actions or UI control patterns.
- No source media or project files are modified.
- No export, overwrite, publish, or upload.
- A UIA snapshot is diagnostic evidence only, not proof that controls can be safely automated.
- A version-specific adapter will only be designed after reviewing the installed build and observed accessibility tree.
