"""AURORA Video Studio local Windows diagnostic worker (safe bootstrap)."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
from typing import Any

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
from video_studio.planner import compile_edit_decision_list


def _parse_powershell_json(script_name: str) -> dict[str, Any]:
    if os.name != "nt":
        return {"status": "unsupported_os", "platform": platform.platform()}
    script = Path(__file__).with_name(script_name)
    try:
        completed = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", str(script)],
            capture_output=True, text=True, timeout=30, check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"status": "diagnostic_failed", "error": type(exc).__name__}
    if completed.returncode != 0:
        return {"status": "diagnostic_failed", "return_code": completed.returncode, "stderr": completed.stderr[-1000:]}
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError:
        return {"status": "invalid_diagnostic_output", "stdout_tail": completed.stdout[-1000:]}
    return payload if isinstance(payload, dict) else {"status": "invalid_diagnostic_shape"}


def discover_jianying() -> dict[str, Any]:
    payload = _parse_powershell_json("detect_jianying.ps1")
    if payload.get("status") in {"unsupported_os", "diagnostic_failed", "invalid_diagnostic_output", "invalid_diagnostic_shape"}:
        return payload
    installs = payload.get("Installations", [])
    return {
        "status": "detected" if installs else "not_found",
        "diagnostic": payload,
        "next_step": "open_jianying_then_run_inspect_ui" if installs else "install_or_locate_jianying_pro",
    }


def inspect_jianying_ui() -> dict[str, Any]:
    """Read the accessibility tree of an already-open editor; never interacts with it."""
    payload = _parse_powershell_json("inspect_jianying_ui.ps1")
    if payload.get("status") == "inspected":
        payload["next_step"] = "review_control_tree_before_designing_version_specific_adapter"
    return payload


def scan_workspace(workspace: Path) -> dict[str, Any]:
    root = workspace.expanduser().resolve()
    if not root.exists():
        raise FileNotFoundError(f"workspace_not_found:{root}")
    extensions = {".mp4", ".mov", ".m4v", ".mkv", ".webm", ".mp3", ".wav", ".m4a", ".aac", ".png", ".jpg", ".jpeg", ".webp"}
    items = []
    for path in sorted(root.rglob("*")):
        if path.is_file() and path.suffix.lower() in extensions:
            resolved = path.resolve()
            if not resolved.is_relative_to(root):
                continue
            stat = resolved.stat()
            items.append({"relative_path": resolved.relative_to(root).as_posix(), "extension": resolved.suffix.lower(), "size_bytes": stat.st_size})
    return {"workspace": str(root), "asset_count": len(items), "assets": items}


def main() -> int:
    parser = argparse.ArgumentParser(description="AURORA Video Studio read-only Windows worker")
    parser.add_argument("command", choices=("diagnose", "inspect-ui", "scan-assets", "validate-plan"))
    parser.add_argument("--workspace", type=Path, default=Path.home() / "Videos" / "AURORA_Workspace")
    parser.add_argument("--plan", type=Path)
    args = parser.parse_args()
    if args.command == "diagnose":
        result = discover_jianying()
    elif args.command == "inspect-ui":
        result = inspect_jianying_ui()
    elif args.command == "scan-assets":
        result = scan_workspace(args.workspace)
    else:
        if not args.plan:
            parser.error("validate-plan requires --plan")
        raw = json.loads(args.plan.read_text(encoding="utf-8"))
        result = compile_edit_decision_list(raw, args.workspace)
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
