"""Read-only MIA to Aurora perception adapter."""
from __future__ import annotations
import json, os, urllib.error, urllib.parse, urllib.request
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Callable

DEFAULT_SUPABASE_URL = "https://lvxmygrgqtmzqgailmyl.supabase.co"
AURORA_WORLD_ID = "50b06c01-060d-49fa-8988-8f38c13406d7"
MIA_AGENT_ID = "34833ba9-2be7-4a55-9b52-62c402f759b5"

class AuroraPerceptionError(RuntimeError):
    pass

@dataclass(frozen=True)
class AuroraConfig:
    pat: str
    anon_key: str
    supabase_url: str = DEFAULT_SUPABASE_URL
    agent_id: str = MIA_AGENT_ID
    world_id: str = AURORA_WORLD_ID
    timeout_seconds: float = 15.0

    @classmethod
    def from_env(cls):
        pat = os.environ.get("ZHI_MIA_PAT", "").strip()
        anon = os.environ.get("ZHI_SUPABASE_ANON_KEY", "").strip()
        if not pat: raise AuroraPerceptionError("missing_env: ZHI_MIA_PAT")
        if not anon: raise AuroraPerceptionError("missing_env: ZHI_SUPABASE_ANON_KEY")
        return cls(pat, anon,
            os.environ.get("ZHI_SUPABASE_URL", DEFAULT_SUPABASE_URL).rstrip("/"),
            os.environ.get("ZHI_MIA_AGENT_ID", MIA_AGENT_ID),
            os.environ.get("ZHI_AURORA_WORLD_ID", AURORA_WORLD_ID))

def _time(value):
    if not isinstance(value, str) or not value: raise AuroraPerceptionError("invalid_event_timestamp")
    try: return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc: raise AuroraPerceptionError("invalid_event_timestamp") from exc

def normalize_events(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    result = []
    for item in events:
        if not isinstance(item, dict): continue
        event_id, occurred = item.get("event_id"), item.get("occurred_at")
        if not isinstance(event_id, str) or not event_id: continue
        _time(occurred)
        chain, payload = item.get("causal_chain", []), item.get("payload", {})
        if not isinstance(chain, list): raise AuroraPerceptionError("invalid_causal_chain")
        if not isinstance(payload, dict): raise AuroraPerceptionError("invalid_event_payload")
        result.append({
            "stream_type": item.get("stream_type", "unknown"),
            "event_id": event_id, "event_kind": item.get("event_kind", "unknown"),
            "source_kind": item.get("source_kind", "unknown"),
            "revision": item.get("revision"), "occurred_at": occurred,
            "payload": payload, "causal_chain": chain,
            "epistemic_status": "modeled_world_event" if item.get("stream_type") == "ecosystem" else "recorded_spatial_event"
        })
    result.sort(key=lambda e: _time(e["occurred_at"]))
    return result

def build_cognition_input(response: dict[str, Any]) -> dict[str, Any]:
    agent, world = response.get("agent") or {}, response.get("world") or {}
    if agent.get("id") != MIA_AGENT_ID or world.get("id") != AURORA_WORLD_ID:
        raise AuroraPerceptionError("agent_or_world_identity_mismatch")
    feedback = response.get("environment_feedback")
    if not isinstance(feedback, dict): raise AuroraPerceptionError("missing_environment_feedback")
    contract = feedback.get("event_stream_contract") or {}
    if "zhi_ecosystem_events" not in contract.get("includes", []):
        raise AuroraPerceptionError("ecosystem_event_stream_not_confirmed")
    events = feedback.get("events")
    if not isinstance(events, list): raise AuroraPerceptionError("missing_unified_event_stream")
    timeline = normalize_events(events)
    revisions = [e["revision"] for e in timeline if isinstance(e["revision"], int)]
    return {
        "agent_id": agent["id"], "world_id": world["id"], "world_name": world.get("name"),
        "source": feedback.get("source), "stream_contract": contract,
        "event_count": len(timeline), "revision_range": {
            "min": min(revisions) if revisions else None, "max": max(revisions) if revisions else None},
        "timeline_oldest_to_newest": timeline,
        "epistemic_rules": [
            "Ecosystem events are persisted outputs of Aurora's simulated ecological model, not physical sensor measurements.",
            "Preserve timestamps, revisions, payloads and causal chains when reasoning.",
            "Do not claim personal presence, direct sensory observation, or action merely because an event exists.",
            "Treat missing events, unknown locations and absent evidence as unknown; do not invent experience.",
            "This is shared world context, not MIA's private memory."
        ],
        "private_memory": {"included": False, "owner": "MIA_runtime_only"}
    }

def build_cognition_prompt(packet):
    return ("AURORA WORLD PERCEPTION (read-only shared environment context). "
        "Use the chronological timeline to understand what changed, when, and the recorded causal stages. "
        "Distinguish modeled outputs from direct observation. Do not invent location, sensory experience, "
        "memory, or action. Private memory remains in MIA's own runtime.\n" +
        json.dumps(packet, ensure_ascii=False, separators=(",", ":")))

class AuroraPerceptionClient:
    def __init__(self, config: AuroraConfig, opener: Callable[..., Any] = urllib.request.urlopen):
        if not config.pat or not config.anon_key: raise AuroraPerceptionError("missing_auth_configuration")
        self.config, self.opener = config, opener

    def fetch(self):
        query = urllib.parse.urlencode({"world_id": self.config.world_id})
        url = (f"{self.config.supabase_url}/functions/v1/zhi-spatial/"
               f"v1/agents/{self.config.agent_id}/perception?{query}")
        request = urllib.request.Request(url, headers={
            "Authorization": f"Bearer {self.config.pat}", "apikey": self.config.anon_key,
            "Accept": "application/json"})
        try:
            with self.opener(request, timeout=self.config.timeout_seconds) as result:
                status, raw = getattr(result, "status", 200), result.read()
        except urllib.error.HTTPError as exc:
            raise AuroraPerceptionError(f"perception_http_error:{exc.code}") from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise AuroraPerceptionError("perception_transport_error") from exc
        if status < 200 or status >= 300: raise AuroraPerceptionError(f"perception_http_error:{status}")
        try: response = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise AuroraPerceptionError("invalid_perception_response") from exc
        if not isinstance(response, dict): raise AuroraPerceptionError("invalid_perception_response")
        return build_cognition_input(response)

    def fetch_prompt(self):
        return build_cognition_prompt(self.fetch())
