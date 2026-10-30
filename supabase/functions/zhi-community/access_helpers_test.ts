import { assertEquals } from "jsr:@std/assert@1";
import {
  isMembershipAuthorized,
  isAgentMembershipAuthorized,
  privilegesForPublicRejoin,
  type MembershipAuthorizationRecord,
} from "./access_helpers.ts";

const active: MembershipAuthorizationRecord = {
  principal_user_id: "user-a", status: "active", revoked_at: null, agent_id: null,
  expires_at: "2099-01-01T00:00:00.000Z", capabilities: ["message:read", "message:send"],
};

Deno.test("allows matching active user with required capability", () => {
  assertEquals(isMembershipAuthorized(active, "user-a", "message:read", Date.parse("2026-01-01T00:00:00Z")), true);
});

Deno.test("denies cross-account membership access", () => {
  assertEquals(isMembershipAuthorized(active, "user-b", "message:read", Date.parse("2026-01-01T00:00:00Z")), false);
});

Deno.test("denies expired, revoked, inactive, or agent memberships", () => {
  const now = Date.parse("2026-01-01T00:00:00Z");
  assertEquals(isMembershipAuthorized({ ...active, expires_at: "2025-12-31T23:59:59Z" }, "user-a", "message:read", now), false);
  assertEquals(isMembershipAuthorized({ ...active, revoked_at: "2025-12-01T00:00:00Z" }, "user-a", "message:read", now), false);
  assertEquals(isMembershipAuthorized({ ...active, status: "revoked" }, "user-a", "message:read", now), false);
  assertEquals(isMembershipAuthorized({ ...active, agent_id: "agent-1" }, "user-a", "message:read", now), false);
});

Deno.test("denies missing capability and missing membership", () => {
  assertEquals(isMembershipAuthorized({ ...active, capabilities: ["message:read"] }, "user-a", "message:send"), false);
  assertEquals(isMembershipAuthorized(null, "user-a", "message:read"), false);
});

Deno.test("fails closed when membership expiry is malformed", () => {
  assertEquals(isMembershipAuthorized(
    { ...active, expires_at: "not-a-date" }, "user-a", "message:read",
  ), false);
});

Deno.test("public rejoin downgrades revoked or expired moderators to ordinary members", () => {
  assertEquals(privilegesForPublicRejoin("moderator", ["scene:manage", "message:send", "message:read"]), {
    membership_role: "member",
    capabilities: ["message:send", "message:read"],
  });
});

Deno.test("public rejoin never restores arbitrary elevated capabilities to members", () => {
  assertEquals(privilegesForPublicRejoin("member", ["scene:manage", "message:send"]), {
    membership_role: "member",
    capabilities: ["message:send", "message:read"],
  });
});

Deno.test("public rejoin preserves creator ownership", () => {
  assertEquals(privilegesForPublicRejoin("owner", ["scene:manage", "message:send", "message:read"]), {
    membership_role: "owner",
    capabilities: ["scene:manage", "message:send", "message:read"],
  });
});


Deno.test("agent membership requires exact owner, agent, status, expiry and capability", () => {
  const agentMembership: MembershipAuthorizationRecord = {
    principal_user_id: "owner-a", agent_id: "agent-a", status: "active", revoked_at: null,
    expires_at: "2099-01-01T00:00:00.000Z", capabilities: ["message:read", "message:send"],
  };
  const now = Date.parse("2026-01-01T00:00:00Z");
  assertEquals(isAgentMembershipAuthorized(agentMembership, "owner-a", "agent-a", "message:read", now), true);
  assertEquals(isAgentMembershipAuthorized(agentMembership, "owner-b", "agent-a", "message:read", now), false);
  assertEquals(isAgentMembershipAuthorized(agentMembership, "owner-a", "agent-b", "message:read", now), false);
  assertEquals(isAgentMembershipAuthorized({ ...agentMembership, agent_id: null }, "owner-a", "agent-a", "message:read", now), false);
  assertEquals(isAgentMembershipAuthorized({ ...agentMembership, status: "revoked" }, "owner-a", "agent-a", "message:read", now), false);
  assertEquals(isAgentMembershipAuthorized({ ...agentMembership, revoked_at: "2025-12-01T00:00:00Z" }, "owner-a", "agent-a", "message:read", now), false);
  assertEquals(isAgentMembershipAuthorized({ ...agentMembership, expires_at: "2025-12-31T00:00:00Z" }, "owner-a", "agent-a", "message:read", now), false);
  assertEquals(isAgentMembershipAuthorized(agentMembership, "owner-a", "agent-a", "tool.execute", now), false);
});
