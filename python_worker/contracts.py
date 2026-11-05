"""Strict, bounded job contract for the supervised Python worker."""
from __future__ import annotations

from dataclasses import dataclass
import json
import re
from typing import Any

IDENTIFIER = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$")
TASK_TYPES = {"healthcheck", "aurora_ecosystem_report"}
MAX_INPUT_BYTES = 128_000
MAX_EVENTS = 1_000
MAX_TIMEOUT_SECONDS = 30


class JobValidationError(ValueError):
    """Raised when a job violates the worker contract."""


@dataclass(frozen=True)
class ExecutionLimits:
    timeout_seconds: int = 10
    max_input_bytes: int = MAX_INPUT_BYTES
    max_events: int = MAX_EVENTS

    @classmethod
    def parse(cls, raw: Any) -> "ExecutionLimits":
        if raw is None:
            return cls()
        if not isinstance(raw, dict):
            raise JobValidationError("execution_limits_must_be_object")
        values = {
            "timeout_seconds": raw.get("timeout_seconds", 10),
            "max_input_bytes": raw.get("max_input_bytes", MAX_INPUT_BYTES),
            "max_events": raw.get("max_events", MAX_EVENTS),
        }
        bounds = {
            "timeout_seconds": (1, MAX_TIMEOUT_SECONDS),
            "max_input_bytes": (1, MAX_INPUT_BYTES),
            "max_events": (1, MAX_EVENTS),
        }
        for key, (minimum, maximum) in bounds.items():
            value = values[key]
            if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
                raise JobValidationError(f"invalid_execution_limit:{key}")
        return cls(**values)


@dataclass(frozen=True)
class JobRequest:
    agent_id: str
    task_id: str
    workspace_id: str
    task_type: str
    input: dict[str, Any]
    permission_scope: tuple[str, ...]
    limits: ExecutionLimits

    @classmethod
    def parse(cls, raw: Any) -> "JobRequest":
        if not isinstance(raw, dict):
            raise JobValidationError("job_must_be_object")
        identifiers = {}
        for key in ("agent_id", "task_id", "workspace_id"):
            value = raw.get(key)
            if not isinstance(value, str) or not IDENTIFIER.fullmatch(value):
                raise JobValidationError(f"invalid_{key}")
            identifiers[key] = value
        task_type = raw.get("task_type")
        if task_type not in TASK_TYPES:
            raise JobValidationError("task_type_not_allowlisted")
        payload = raw.get("input", {})
        if not isinstance(payload, dict):
            raise JobValidationError("input_must_be_object")
        encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        limits = ExecutionLimits.parse(raw.get("execution_limits"))
        if len(encoded) > limits.max_input_bytes:
            raise JobValidationError("input_too_large")
        scopes = raw.get("permission_scope", [])
        if not isinstance(scopes, list) or any(not isinstance(x, str) for x in scopes):
            raise JobValidationError("permission_scope_must_be_string_list")
        scope_set = set(scopes)
        if len(scope_set) != len(scopes):
            raise JobValidationError("duplicate_permission_scope")
        required = {"aurora.events.read"} if task_type == "aurora_ecosystem_report" else set()
        if not required.issubset(scope_set):
            raise JobValidationError("required_permission_missing")
        if scope_set - {"aurora.events.read"}:
            raise JobValidationError("permission_scope_not_allowlisted")
        return cls(**identifiers, task_type=task_type, input=payload,
                   permission_scope=tuple(sorted(scope_set)), limits=limits)
