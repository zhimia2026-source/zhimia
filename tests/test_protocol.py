import unittest
from datetime import datetime, timedelta, timezone

from zhi_protocol import (
    AgentManifest, AuthorizationContext, AuthorizationError, MessageEnvelope,
    ProtocolError, WorldManifest, authorize_request,
)


class ManifestTests(unittest.TestCase):
    def test_agent_manifest_round_trip_shape_excludes_private_fields(self):
        manifest = AgentManifest(
            agent_id="agent:zhi:manager", display_name="ZHI Manager", role="manager",
            identity_version=1, capabilities=("chat.send", "task.propose"),
        )
        payload = manifest.to_dict()
        self.assertEqual(payload["agent_id"], "agent:zhi:manager")
        self.assertNotIn("memory", payload)
        self.assertNotIn("prompt", payload)

    def test_unknown_capability_is_rejected(self):
        with self.assertRaisesRegex(ProtocolError, "unknown_capability"):
            AgentManifest("agent:zhi:a", "A", "helper", 1, ("memory.read.all",))

    def test_unknown_protocol_version_is_rejected(self):
        with self.assertRaisesRegex(ProtocolError, "unsupported_world_manifest_protocol"):
            WorldManifest("world:zhi:home", "Home", 1, "approval_required", (), protocol="zhi-world/9.0")


class MessageTests(unittest.TestCase):
    def test_valid_envelope_parses_and_serializes(self):
        envelope = MessageEnvelope.from_dict({
            "protocol": "zhi-message/0.1", "message_id": "msg:one",
            "conversation_id": "conv:main", "world_id": "world:zhi:home",
            "sender": {"type": "agent", "id": "agent:zhi:a"},
            "recipient": {"type": "agent", "id": "agent:zhi:b"},
            "kind": "chat.message", "created_at": "2026-10-22T00:00:00Z",
            "payload": {"text": "hello"},
        })
        self.assertEqual(envelope.to_dict()["sender"]["id"], "agent:zhi:a")

    def test_client_cannot_set_unsafe_visibility_policy(self):
        with self.assertRaisesRegex(ProtocolError, "unsupported_message_policy"):
            MessageEnvelope("msg:one", "conv:main", "world:zhi:home", "agent:zhi:a",
                            "agent:zhi:b", "chat.message", "2026-10-22T00:00:00Z", {},
                            visibility="public")

    def test_naive_timestamp_is_rejected(self):
        with self.assertRaisesRegex(ProtocolError, "timezone_required_created_at"):
            MessageEnvelope("msg:one", "conv:main", "world:zhi:home", "agent:zhi:a",
                            "agent:zhi:b", "chat.message", "2026-10-22T00:00:00", {})


class AuthorizationTests(unittest.TestCase):
    def setUp(self):
        self.context = AuthorizationContext(
            principal_id="agent:zhi:a", world_id="world:zhi:home", membership_status="active",
            capabilities=frozenset({"chat.send", "memory.read.own"}),
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
        )

    def test_authorized_action_passes(self):
        authorize_request(self.context, world_id="world:zhi:home", required_capability="chat.send")

    def test_missing_auth_fails_closed(self):
        with self.assertRaisesRegex(AuthorizationError, "authentication_required"):
            authorize_request(None, world_id="world:zhi:home", required_capability="chat.send")

    def test_wrong_world_fails(self):
        with self.assertRaisesRegex(AuthorizationError, "world_scope_mismatch"):
            authorize_request(self.context, world_id="world:other:private", required_capability="chat.send")

    def test_inactive_membership_fails(self):
        ctx = AuthorizationContext("agent:zhi:a", "world:zhi:home", "revoked", frozenset({"chat.send"}))
        with self.assertRaisesRegex(AuthorizationError, "active_membership_required"):
            authorize_request(ctx, world_id="world:zhi:home", required_capability="chat.send")

    def test_sender_permission_does_not_grant_history_read(self):
        with self.assertRaisesRegex(AuthorizationError, "capability_not_granted"):
            authorize_request(self.context, world_id="world:zhi:home", required_capability="chat.read")

    def test_private_resource_scope_is_enforced(self):
        with self.assertRaisesRegex(AuthorizationError, "resource_scope_denied"):
            authorize_request(self.context, world_id="world:zhi:home", required_capability="memory.read.own",
                              resource_owner_id="agent:zhi:b")

    def test_expired_membership_fails(self):
        ctx = AuthorizationContext("agent:zhi:a", "world:zhi:home", "active", frozenset({"chat.send"}),
                                   expires_at=datetime.now(timezone.utc) - timedelta(seconds=1))
        with self.assertRaisesRegex(AuthorizationError, "membership_expired"):
            authorize_request(ctx, world_id="world:zhi:home", required_capability="chat.send")


if __name__ == "__main__":
    unittest.main()
