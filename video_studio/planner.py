"""Deterministic edit-plan compiler; does not operate the desktop UI."""
from __future__ import annotations

from pathlib import Path
from typing import Any
import json

from .contracts import VideoPlan, VideoPlanError


def compile_edit_decision_list(raw: Any, workspace: str | Path) -> dict[str, Any]:
    plan = VideoPlan.parse(raw)
    root = Path(workspace).expanduser().resolve()
    resolved_assets: list[dict[str, str]] = []
    for asset in plan.assets:
        candidate = (root / asset.path).resolve()
        if not candidate.is_relative_to(root):
            raise VideoPlanError("asset_path_escape")
        if not candidate.is_file():
            raise VideoPlanError(f"asset_file_missing:{asset.asset_id}")
        resolved_assets.append({
            "asset_id": asset.asset_id,
            "workspace_path": str(candidate),
            "media_type": asset.media_type,
        })

    timeline = []
    for clip in sorted(plan.clips, key=lambda c: (c.timeline_start, c.track)):
        timeline.append({
            "asset_id": clip.asset_id,
            "timeline_start": clip.timeline_start,
            "source_start": clip.source_start,
            "source_end": clip.source_end,
            "duration": round(clip.source_end - clip.source_start, 3),
            "track": clip.track,
            "role": clip.role,
        })
    return {
        "schema": "aurora-video-edit-decision-list/v1",
        "project": {
            "project_id": plan.project_id,
            "title": plan.title,
            "aspect_ratio": plan.aspect_ratio,
            "fps": plan.fps,
            "resolution": plan.resolution,
        },
        "assets": resolved_assets,
        "timeline": timeline,
        "capcut": {
            "integration_status": "not_connected",
            "next_step": "local_desktop_adapter_required",
            "note": "This EDL is a validated plan, not a CapCut project or rendered video.",
        },
    }


def write_edit_decision_list(raw: Any, workspace: str | Path) -> Path:
    root = Path(workspace).expanduser().resolve()
    root.mkdir(parents=True, exist_ok=True)
    payload = compile_edit_decision_list(raw, root)
    output = root / "edit-decision-list.json"
    temp = root / ".edit-decision-list.tmp"
    temp.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp.replace(output)
    return output
