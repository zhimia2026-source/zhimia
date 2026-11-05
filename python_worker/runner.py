"""Local supervised runner with per-agent workspaces and atomic result writes."""
from __future__ import annotations

import json
import os
from pathlib import Path
import tempfile
from typing import Any

from .contracts import JobRequest
from .handlers import HANDLERS


class WorkspaceError(RuntimeError):
    pass


def _workspace_path(root: Path, agent_id: str, workspace_id: str) -> Path:
    root = root.expanduser().resolve()
    agent_dir = root / agent_id
    agent_dir.mkdir(parents=True, exist_ok=True)
    resolved_agent_dir = agent_dir.resolve()
    if not resolved_agent_dir.is_relative_to(root):
        raise WorkspaceError("agent_workspace_path_escape")
    candidate = resolved_agent_dir / workspace_id
    if candidate.is_symlink():
        raise WorkspaceError("workspace_symlink_not_allowed")
    candidate.mkdir(parents=True, exist_ok=True)
    resolved = candidate.resolve()
    if not resolved.is_relative_to(root):
        raise WorkspaceError("workspace_path_escape")
    return resolved


def _atomic_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=".result-", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(payload, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp_name, path)
    except Exception:
        try:
            os.unlink(temp_name)
        except FileNotFoundError:
            pass
        raise


def run_job(raw_job: Any, workspace_root: str | Path) -> dict[str, Any]:
    job = JobRequest.parse(raw_job)
    handler = HANDLERS[job.task_type]
    workspace = _workspace_path(Path(workspace_root), job.agent_id, job.workspace_id)
    result = handler(job)
    envelope = {
        "task_id": job.task_id,
        "agent_id": job.agent_id,
        "workspace_id": job.workspace_id,
        "task_type": job.task_type,
        "result": result,
    }
    _atomic_json(workspace / "result.json", envelope)
    return envelope
