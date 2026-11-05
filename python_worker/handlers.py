"""Built-in, reviewed task handlers. No user-supplied Python is executed."""
from __future__ import annotations

from collections import Counter
from typing import Any

from .contracts import JobRequest, JobValidationError, MAX_EVENTS


def healthcheck(job: JobRequest) -> dict[str, Any]:
    return {"status": "ok", "agent_id": job.agent_id, "worker": "zhi-python-worker-v1"}


def aurora_ecosystem_report(job: JobRequest) -> dict[str, Any]:
    events = job.input.get("events", [])
    if not isinstance(events, list):
        raise JobValidationError("events_must_be_list")
    if len(events) > min(job.limits.max_events, MAX_EVENTS):
        raise JobValidationError("event_limit_exceeded")
    kinds: Counter[str] = Counter()
    causal_links = 0
    timestamps: list[str] = []
    for event in events:
        if not isinstance(event, dict):
            raise JobValidationError("event_must_be_object")
        kind = event.get("event_kind")
        if not isinstance(kind, str) or not kind or len(kind) > 100:
            raise JobValidationError("event_kind_invalid")
        kinds[kind] += 1
        occurred_at = event.get("occurred_at")
        if isinstance(occurred_at, str) and occurred_at:
            timestamps.append(occurred_at[:64])
        chain = event.get("causal_chain", [])
        if chain is not None and not isinstance(chain, (list, dict, str)):
            raise JobValidationError("causal_chain_invalid")
        if chain:
            causal_links += 1
    return {
        "status": "completed",
        "report_type": "aurora_ecosystem_event_summary",
        "agent_id": job.agent_id,
        "event_count": len(events),
        "event_kinds": dict(sorted(kinds.items())),
        "events_with_causal_chain": causal_links,
        "time_range": {
            "first_observed": min(timestamps) if timestamps else None,
            "last_observed": max(timestamps) if timestamps else None,
        },
        "data_source": "caller_supplied_environment_feedback_events",
        "limitations": ["Summary only; no direct database access or inferred events."],
    }


HANDLERS = {
    "healthcheck": healthcheck,
    "aurora_ecosystem_report": aurora_ecosystem_report,
}
