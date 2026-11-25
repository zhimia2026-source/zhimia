# AURORA Video Studio V0.1

This is the first safe local-first layer for resident-directed video production.

## What is implemented

- Strict resident edit-plan validation.
- Workspace-relative media paths only; absolute paths and path traversal are rejected.
- Allowlisted media extensions, frame rates, aspect ratios, resolutions, tracks and clip roles.
- Deterministic edit-decision-list (EDL) compilation.
- Missing files and workspace escapes fail closed.
- Standard-library only; no new service or model API fees.

## What is NOT implemented yet

- No CapCut desktop control.
- No screen capture, mouse or keyboard automation.
- No media download, FFmpeg render, subtitle generation or MP4 export.
- An EDL is not a CapCut project file and must not be represented as a finished video.

The next production phase is a Windows-only local adapter, tested against the user's installed CapCut version. It must begin in observe/preview mode, use Windows UI Automation where possible, and require explicit confirmation before export, overwrite, publish, or external upload.

## Local test

```powershell
python -m unittest discover -s tests -p 'test_video_studio.py' -v
```

## Plan shape

Assets are workspace-relative, for example `assets/shot-01.mp4`. Each clip refers to an asset ID and defines source in/out points and timeline position. Resident-authored plans are data only; arbitrary code and shell commands are never accepted.
