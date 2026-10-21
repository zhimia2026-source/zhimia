"""ZHI World protocol v0.1: validation and policy primitives.

This module is a local reference implementation, not an HTTP server or a
replacement for server-side authentication, database RLS, or durable grants.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import re
from typing import Any, Mapping

WORLD_PROTOCOL = "zhi-world/0.1"
MESSAGE_PROTOCOL = "zhi-message/0.1"
SUPPORTED_MESSAGE_VERSIONS = frozenset({MESSAGE_PROTOCOL})
KNOWN_CAPABILITIES = frozenset({
    "chat.read", "chat.send", "world.discover", "world.join.request",
    "world.leave", "task.propose", "task.read.own", "task.approve",
    "memory.read.own", "memory.write.own", "agent.collaborate.request",
})
_ID_RE = re.compile(r"^(agent|world|msg|conv):[a-z0-9][a-z0-9._:-]{0,190}$")


class ProtocolError(ValueError):
    """Input does not conform to the supported ZHI protocol contract."""


class AuthorizationError(PermissionError):
    """The principal lacks an active grant for the requested resource/action."""


def _required_string(value: Any, field: str, max_len: int = 256) -> str:
    if not isinstance(value, str) or not value.strip() or len(value) > max_len:
        raise ProtocolError(f"invalid_{field}")
    return value


def _stable_id(value: Any, prefix: str, field: str) -> str:
    value = _required_string(value, field, 200)
    if not _ID_RE.fullmatch(value) or not value.startswith(prefix + ":"):
        raise ProtocolError(f"invalid_{field}")
    return value


def _string_list(value: Any, field: str) -> tuple[str, ...]:
    if not isinstance(value, (list, tuple)) or any(not isinstance(x, str) or not x for x in value):
        raise ProtocolError(f"invalid_{field}")
    if len(set(value)) != len(value):
        raise ProtocolError(f"duplicate_{field}")
    return tuple(value)


@dataclass(frozen=True)
class AgentManifest:
    agent_id: str
    display_name: str
    role: str
    identity_version: int
    capabilities: tuple[str, ...]
    supported_message_versions: tuple[str, ...] = (MESSAGE_PROTOCOL,)
    protocol: str = WORLD_PROTOCOL
    type: str = "agent"

    def __post_init__(self) -> None:
        _stable_id(self.agent_id, "agent", "agent_id")
        _required_string(self.display_name, "display_name", 120)
        _required_string(self.role, "role", 80)
        if self.protocol != WORLD_PROTOCOL or self.type != "agent":
            raise ProtocolError("unsupported_agent_manifest_protocol")
        if not isinstance(self.identity_version, int) or isinstance(self.identity_version, bool) or self.identity_version < 1:
            raise ProtocolError("invalid_identity_version")
        _string_list(self.capabilities, "capabilities")
        _string_list(self.supported_message_versions, "supported_message_versions")
        if any(c not in KNOWN_CAPABILITIES for c in self.capabilities):
            raise ProtocolError("unknown_capability")
        if not self.supported_message_versions or any(v not in SUPPORTED_MESSAGE_VERSIONS for v in self.supported_message_versions):
            raise ProtocolError("unsupported_message_version")

    def to_dict(self) -> dict[str, Any]:
        return {
            "protocol": self.protocol, "type": self.type, "agent_id": self.agent_id,
            "display_name": self.display_name, "role": self.role,
            "identity_version": self.identity_version, "capabilities": list(self.capabilities),
            "supported_message_versions": list(self.supported_message_versions),
        }


@dataclass(frozen=True)
class WorldManifest:
    world_id: str
    display_name: str
    rules_version: int
    entry_policy: str
    capabilities: tuple[str, ...]
    supported_message_versions: tuple[str, ...] = (MESSAGE_PROTOCOL,)
    protocol: str = WORLD_PROTOCOL
    type: str = "world"

    def __post_init__(self) -> None:
        _stable_id(self.world_id, "world", "world_id")
        _required_string(self.display_name, "display_name", 120)
        if self.protocol != WORLD_PROTOCOL or self.type != "world":
            raise ProtocolError("unsupported_world_manifest_protocol")
        if not isinstance(self.rules_version, int) or isinstance(self.rules_version, bool) or self.rules_version < 1:
            raise ProtocolError("invalid_rules_version")
        if self.entry_policy not in {"open_with_approval", "approval_required", "invite_only"}:
            raise ProtocolError("invalid_entry_policy")
        _string_list(self.capabilities, "capabilities")
        _string_list(self.supported_message_versions, "supported_message_versions")
        if not self.supported_message_versions or any(v not in SUPPORTED_MESSAGE_VERSIONS for v in self.supported_message_versions):
            raise ProtocolError("unsupported_message_version")

    def to_dict(self) -> dict[str, Any]:
        return {
            "protocol": self.protocol, "type": self.type, "world_id": self.world_id,
            "display_name": self.display_name, "rules_version": self.rules_version,
            "entry_policy": self.entry_policy, "capabilities": list(self.capabilities),
            "supported_message_versions": list(self.supported_message_versions),
        }


def _parse_timestamp(value: Any, field: str) -> datetime:
    value = _required_string(value, field, 64)
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ProtocolError(f"invalid_{field}") from exc
    if parsed.tzinfo is None:
        raise ProtocolError(f"timezone_required_{field}")
    return parsed.astimezone(timezone.utc)


@dataclass(frozen=True)
class MessageEnvelope:
    message_id: str
    conversation_id: str
    world_id: str
    sender_id: str
    recipient_id: str
    kind: str
    created_at: str
    payload: Mapping[str, Any]
    correlation_id: str | None = None
    reply_to: str | None = None
    visibility: str = "conversation_members"
    retention: str = "world_policy"
    protocol: str = MESSAGE_PROTOCOL

    def __post_init__(self) -> None:
        if self.protocol != MESSAGE_PROTOCOL:
            raise ProtocolError("unsupported_message_protocol")
        _stable_id(self.message_id, "msg", "message_id")
        _stable_id(self.conversation_id, "conv", "conversation_id")
        _stable_id(self.world_id, "world", "world_id")
        _stable_id(self.sender_id, "agent", "sender_id")
        _stable_id(self.recipient_id, "agent", "recipient_id")
        _required_string(self.kind, "kind", 80)
        _parse_timestamp(self.created_at, "created_at")
        if not isinstance(self.payload, Mapping):
            raise ProtocolError("invalid_payload")
        if len(repr(dict(self.payload)).encode("utf-8")) > 16_384:
            raise ProtocolError("payload_too_large")
        if self.visibility != "conversation_members" or self.retention != "world_policy":
            raise ProtocolError("unsupported_message_policy")
        if self.correlation_id is not None:
            _required_string(self.correlation_id, "correlation_id", 200)
        if self.reply_to is not None:
            _stable_id(self.reply_to, "msg", "reply_to")

    @classmethod
    def from_dict(cls, data: Mapping[str, Any]) -> "MessageEnvelope":
        if not isinstance(data, Mapping):
            raise ProtocolError("invalid_envelope")
        sender, recipient, policy = data.get("sender"), data.get("recipient"), data.get("policy", {})
        if not isinstance(sender, Mapping) or sender.get("type") != "agent":
            raise ProtocolError("invalid_sender")
        if not isinstance(recipient, Mapping) or recipient.get("type") != "agent":
            raise ProtocolError("invalid_recipient")
        if not isinstance(policy, Mapping):
            raise ProtocolError("invalid_policy")
        return cls(
            protocol=data.get("protocol"), message_id=data.get("message_id"),
            conversation_id=data.get("conversation_id"), world_id=data.get("world_id"),
            sender_id=sender.get("id"), recipient_id=recipient.get("id"),
            kind=data.get("kind"), created_at=data.get("created_at"),
            payload=data.get("payload"), correlation_id=data.get("correlation_id"),
            reply_to=data.get("reply_to"), visibility=policy.get("visibility", "conversation_members"),
            retention=policy.get("retention", "world_policy"),
        )

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {
            "protocol": self.protocol, "message_id": self.message_id,
            "conversation_id": self.conversation_id, "world_id": self.world_id,
            "sender": {"type": "agent", "id": self.sender_id},
            "recipient": {"type": "agent", "id": self.recipient_id},
            "kind": self.kind, "created_at": self.created_at,
            "payload": dict(self.payload),
            "policy": {"visibility": self.visibility, "retention": self.retention},
        }
        if self.correlation_id is not None:
            result["correlation_id"] = self.correlation_id
        result["reply_to"] = self.reply_to
        return result


@dataclass(frozen=True)
class AuthorizationContext:
    """Server-derived authorization facts; never build this from untrusted body fields."""
    principal_id: str
    world_id: str
    membership_status: str
    capabilities: frozenset[str]
    expires_at: datetime | None = None


def authorize_request(
    context: AuthorizationContext | None,
    *,
    world_id: str,
    required_capability: str,
    resource_owner_id: str | None = None,
    now: datetime | None = None,
) -> None:
    """Fail closed. Caller must derive context from verified auth + server-side grants."""
    if context is None:
        raise AuthorizationError("authentication_required")
    if context.world_id != world_id:
        raise AuthorizationError("world_scope_mismatch")
    if context.membership_status != "active":
        raise AuthorizationError("active_membership_required")
    if context.expires_at is not None:
        current = now or datetime.now(timezone.utc)
        if context.expires_at.tzinfo is None or context.expires_at.astimezone(timezone.utc) <= current.astimezone(timezone.utc):
            raise AuthorizationError("membership_expired")
    if required_capability not in KNOWN_CAPABILITIES or required_capability not in context.capabilities:
        raise AuthorizationError("capability_not_granted")
    if resource_owner_id is not None and context.principal_id != resource_owner_id:
        raise AuthorizationError("resource_scope_denied")
