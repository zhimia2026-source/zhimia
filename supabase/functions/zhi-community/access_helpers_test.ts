import {
  isAgentMembershipAuthorized,
  isWorldResidentDiscoverable,
  isPublicAgentJoinAllowed,
  normalizeWorldProtocolPath,
  publicAgentMembershipPrivileges,
} from "./access_helpers.ts";

Deno.test("standard /v1/worlds paths map to the legacy scene handler", () => {
  if (normalizeWorldProtocolPath("/v1/worlds") !== "/v1/scenes") throw new Error("world collection alias failed");
  if (normalizeWorldProtocolPath("/v1/worlds/abc/agents/def/join") !== "/v1/scenes/abc/agents/def/join") {
    throw new Error("nested world route alias failed");
  }
  if (normalizeWorldProtocolPath("/v1/worldship") !== "/v1/worldship") throw new Error("prefix collision");
});

Deno.test("public Agent entry requires an active public world and its authenticated owner", () => {
  const world = { visibility: "public", entry_policy: "open", status: "open" };
  const agent = { owner_user_id: "owner-a", status: "active" };
  if (!isPublicAgentJoinAllowed(world, agent, "owner-a")) throw new Error("valid public join rejected");
  if (isPublicAgentJoinAllowed(world, agent, "owner-b")) throw new Error("cross-account Agent join must fail");
  if (isPublicAgentJoinAllowed({ ...world, visibility: "private" }, agent, "owner-a")) {
    throw new Error("private world must require invitation");
  }
  if (isPublicAgentJoinAllowed({ ...world, status: "closed" }, agent, "owner-a")) {
    throw new Error("closed world must reject join");
  }
  if (isPublicAgentJoinAllowed(world, { ...agent, status: "suspended" }, "owner-a")) {
    throw new Error("inactive Agent must be rejected");
  }
});

Deno.test("public Agent membership grants only ordinary message capabilities", () => {
  const membership = publicAgentMembershipPrivileges();
  if (membership.membership_role !== "member" || membership.status !== "active") {
    throw new Error("public Agent must join as ordinary active member");
  }
  if (membership.capabilities.join(",") !== "message:read,message:send") {
    throw new Error("public Agent must receive only read/send capabilities");
  }
});

Deno.test("Agent authorization binds both owner account and exact Agent", () => {
  const membership = {
    principal_user_id: "owner-a",
    agent_id: "agent-a",
    status: "active",
    revoked_at: null,
    expires_at: null,
    capabilities: ["message:read"],
  };
  if (!isAgentMembershipAuthorized(membership, "owner-a", "agent-a", "message:read")) {
    throw new Error("matching Agent membership should pass");
  }
  if (isAgentMembershipAuthorized(membership, "owner-b", "agent-a", "message:read")) {
    throw new Error("different owner must fail");
  }
  if (isAgentMembershipAuthorized(membership, "owner-a", "agent-b", "message:read")) {
    throw new Error("different Agent must fail");
  }
  if (isAgentMembershipAuthorized(membership, "owner-a", "agent-a", "scene:manage")) {
    throw new Error("ungranted capability must fail");
  }
});

Deno.test("world resident discovery requires both active memberships and message scope", () => {
  const requester = {
    principal_user_id: "human-a",
    agent_id: null,
    status: "active",
    revoked_at: null,
    expires_at: null,
    capabilities: ["message:read"],
  };
  const target = {
    principal_user_id: "owner-b",
    agent_id: "agent-b",
    status: "active",
    revoked_at: null,
    expires_at: null,
    capabilities: ["message:read", "message:send"],
  };
  if (!isWorldResidentDiscoverable("open", requester, "human-a", target, "agent-b")) {
    throw new Error("active world member should resolve active resident");
  }
  if (isWorldResidentDiscoverable("closed", requester, "human-a", target, "agent-b")) {
    throw new Error("closed world must not disclose residents");
  }
  if (isWorldResidentDiscoverable("open", { ...requester, capabilities: ["message:send"] }, "human-a", target, "agent-b")) {
    throw new Error("requester without message:read must not discover residents");
  }
  if (isWorldResidentDiscoverable("open", requester, "human-a", { ...target, status: "revoked" }, "agent-b")) {
    throw new Error("revoked resident must not be discoverable");
  }
  if (isWorldResidentDiscoverable("open", requester, "human-a", target, "agent-other")) {
    throw new Error("membership for another exact Agent ID must not authorize resolution");
  }
});
