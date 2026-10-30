import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { createCommunityHandler } from "./index.ts";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const agentA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const agentB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function harness(actorId: string, sceneAllowed = false, capabilities = ["community.scene.enter", "community.scene.discover"]) {
  const queriedTables: string[] = [];
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const filtersByTable: Record<string, Record<string, unknown>> = {};
  let capturedModelMessages: unknown[] = [];
  const db = {
    from(table: string) {
      queriedTables.push(table);
      const filters: Record<string, unknown> = {};
      filtersByTable[table] = filters;
      let operation = "select";
      let inserted: Record<string, unknown> = {};
      let updated: Record<string, unknown> = {};
      const builder: Record<string, any> = {
        select(_columns: string) { return builder; },
        eq(key: string, value: unknown) { filters[key] = value; return builder; },
        is(key: string, value: unknown) { filters[key] = value; return builder; },
        order(_key: string, _options: unknown) { return builder; },
        limit(_value: number) { return builder; },
        in(key: string, value: unknown) { filters[key] = value; return builder; },
        insert(value: Record<string, unknown>) { operation = "insert"; inserted = value; return builder; },
        update(value: Record<string, unknown>) { operation = "update"; updated = value; return builder; },
        maybeSingle() {
          if (table === "zhi_worlds") {
            return Promise.resolve({ data: filters.id === "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
              ? { id: filters.id, name: "林间社区", description: "公共林地", visibility: "public", status: "open",
                  environment_state: { timezone: "Asia/Singapore", lighting: "overcast", soundscape: "rain_on_leaves",
                    atmosphere_tags: ["rain"], behavior_weights: { seek_shelter: 0.9 },
                    objects: [{ id: "shelter", name: "橡树屋檐", state: "wet_roof", interaction_options: ["rest"] }],
                    events: [{ id: "rain", type: "rain", label: "林间阵雨", daily_window: { start: "00:00", end: "23:59" },
                      behavior_weights: { seek_shelter: 0.9 } }] } }
              : null, error: null });
          }
          if (table === "zhi_world_memberships") {
            const expectedAgent = actorId === ownerA ? agentA : agentB;
            const isAgent = filters.agent_id === expectedAgent;
            return Promise.resolve({ data: sceneAllowed && filters.principal_user_id === actorId
              ? { principal_user_id: actorId, status: "active", revoked_at: null,
                  agent_id: isAgent ? expectedAgent : null,
                  expires_at: null, capabilities: isAgent ? ["message:read", "message:send"] : ["message:read"] }
              : null, error: null });
          }
          if (table === "zhi_world_conversations") {
            return Promise.resolve({ data: null, error: null });
          }
          if (table === "zhi_world_messages") {
            return Promise.resolve({ data: null, error: null });
          }
          if (table === "zhi_agents") {
            const expected = actorId === ownerA ? agentA : agentB;
            return Promise.resolve({ data: filters.id === expected && filters.owner_user_id === actorId
              ? { id: expected, owner_user_id: actorId, display_name: actorId === ownerA ? "Agent A" : "Agent B", role: "manager", status: "active", public_manifest: {} }
              : null, error: null });
          }
          if (table === "zhi_agent_chat_turns" && operation === "select") return Promise.resolve({ data: null, error: null });
          if (table === "zhi_agent_chat_turns" && operation === "update") {
            return Promise.resolve({ data: {
              id: "turn-1", owner_user_id: actorId, agent_id: actorId === ownerA ? agentA : agentB,
              user_message: "你好", assistant_message: "你好，我在。", status: "complete",
              provider_model: "test-model", created_at: "2026-10-30T00:00:00Z", completed_at: "2026-10-30T00:00:01Z",
            }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        single() {
          if (table === "zhi_agent_chat_turns" && operation === "insert") return Promise.resolve({ data: {
            id: "turn-1", owner_user_id: inserted.owner_user_id, agent_id: inserted.agent_id,
            user_message: inserted.user_message, status: "pending", created_at: "2026-10-30T00:00:00Z",
          }, error: null });
          if (table === "zhi_world_conversations" && operation === "insert") return Promise.resolve({ data: { id: "conversation-1" }, error: null });
          if (table === "zhi_world_messages" && operation === "insert") return Promise.resolve({ data: {
            id: "message-1", conversation_id: inserted.conversation_id, sender_user_id: inserted.sender_user_id,
            sender_agent_id: inserted.sender_agent_id, request_id: inserted.request_id,
            message_kind: inserted.message_kind, payload: inserted.payload, created_at: "2026-10-30T00:00:00Z",
          }, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        then(resolve: (value: unknown) => unknown) {
          if (table === "zhi_agent_cognition_records") {
            const data = actorId === ownerA && filters.owner_user_id === ownerA && filters.agent_id === agentA
              ? [{ owner_user_id: ownerA, agent_id: agentA, object_type: "self", state: { note: "private A cognition" }, evidence_kind: "observation" }]
              : [];
            return Promise.resolve({ data, error: null }).then(resolve);
          }
          if (table === "zhi_agent_chat_turns" && operation === "select") {
            const data = filters.owner_user_id === actorId && filters.agent_id === (actorId === ownerA ? agentA : agentB) && filters.status === "complete"
              ? [{ user_message: "旧消息", assistant_message: "旧回复", status: "complete" }]
              : [];
            return Promise.resolve({ data, error: null }).then(resolve);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
      };
      return builder;
    },
    rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      return Promise.resolve({ data: { scene_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", agent_id: actorId === ownerA ? agentA : agentB, target_agent_id: args.p_target_agent_id, invitation_id: "invitation-1", expires_at: "2026-10-31T00:00:00Z", membership: name.includes("revoke") ? "revoked" : "active" }, error: null });
    },
  } as unknown as SupabaseClient;
  const handler = createCommunityHandler({
    dbClient: () => db,
    authenticate: async () => ({ userId: actorId, capabilities }),
    chatConfig: { apiUrl: "https://model.test/v1/chat/completions", apiKey: "test-only", model: "test-model" },
    fetchModel: async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      capturedModelMessages = body.messages;
      return new Response(JSON.stringify({ choices: [{ message: { content: "你好，我在。" } }] }), {
        status: 200, headers: { "content-type": "application/json" },
      });
    },
  });
  return { handler, queriedTables, filtersByTable, rpcCalls, getModelMessages: () => capturedModelMessages };
}

Deno.test("private agent chat loads only the authenticated owner-agent cognition and chat history", async () => {
  const h = harness(ownerA);
  const response = await h.handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agentA}/chat`,
    {
      method: "POST",
      headers: { authorization: "Bearer token-a", "content-type": "application/json", "idempotency-key": "turn-a-1" },
      body: JSON.stringify({ message: "你好" }),
    },
  ));
  const body = await response.json();
  assertEquals(response.status, 201);
  assertEquals(body.turn.owner_user_id, ownerA);
  assertEquals(body.turn.agent_id, agentA);
  assertEquals(h.filtersByTable.zhi_agent_cognition_records.owner_user_id, ownerA);
  assertEquals(h.filtersByTable.zhi_agent_cognition_records.agent_id, agentA);
  assertEquals(h.filtersByTable.zhi_agent_chat_turns.owner_user_id, ownerA);
  assertEquals(h.filtersByTable.zhi_agent_chat_turns.agent_id, agentA);
  assertStringIncludes(JSON.stringify(h.getModelMessages()), "private A cognition");
  assertEquals(h.queriedTables.includes("zhi_world_messages"), false);
});

Deno.test("another owner cannot reach private chat, cognition, or chat history for an agent", async () => {
  const h = harness(ownerB);
  const response = await h.handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agentA}/chat`,
    { headers: { authorization: "Bearer token-b" } },
  ));
  assertEquals(response.status, 404);
  assertEquals(h.queriedTables.includes("zhi_agent_cognition_records"), false);
  assertEquals(h.queriedTables.includes("zhi_agent_chat_turns"), false);
});

Deno.test("same owner cannot mix private chat between two different agents", async () => {
  const h = harness(ownerA);
  const response = await h.handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agentB}/chat`,
    { headers: { authorization: "Bearer token-a" } },
  ));
  assertEquals(response.status, 404);
  assertEquals(h.queriedTables.includes("zhi_agent_cognition_records"), false);
  assertEquals(h.queriedTables.includes("zhi_agent_chat_turns"), false);
});


Deno.test("private chat can use explicitly selected scene environment after membership authorization", async () => {
  const h = harness(ownerA, true);
  const response = await h.handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agentA}/chat`,
    {
      method: "POST",
      headers: { authorization: "Bearer token-a", "content-type": "application/json", "idempotency-key": "turn-a-scene-1" },
      body: JSON.stringify({ message: "下雨了，我们可以做什么？", scene_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }),
    },
  ));
  assertEquals(response.status, 201);
  assertEquals(h.filtersByTable.zhi_worlds.id, "cccccccc-cccc-4ccc-8ccc-cccccccccccc");
  assertEquals(h.filtersByTable.zhi_world_memberships.principal_user_id, ownerA);
  assertStringIncludes(JSON.stringify(h.getModelMessages()), "林间社区");
  assertStringIncludes(JSON.stringify(h.getModelMessages()), "寻找遮蔽处");
  assertStringIncludes(JSON.stringify(h.getModelMessages()), "林间阵雨");
  assertEquals(h.queriedTables.includes("zhi_world_messages"), false);
});

Deno.test("private chat rejects a scene when the owner has no active message-read membership", async () => {
  const h = harness(ownerA, false);
  const response = await h.handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agentA}/chat`,
    {
      method: "POST",
      headers: { authorization: "Bearer token-a", "content-type": "application/json", "idempotency-key": "turn-a-scene-denied" },
      body: JSON.stringify({ message: "请看看场景", scene_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" }),
    },
  ));
  assertEquals(response.status, 403);
  assertEquals(JSON.stringify(h.getModelMessages()), "[]");
});


Deno.test("creator explicitly joins their own agent to a public scene", async () => {
  const h = harness(ownerA);
  const response = await h.handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agentA}/scenes/cccccccc-cccc-4ccc-8ccc-cccccccccccc/join`,
    { method: "POST", headers: { authorization: "Bearer token-a" } },
  ));
  assertEquals(response.status, 200);
  assertEquals(h.rpcCalls.length, 1);
  assertEquals(h.rpcCalls[0].name, "zhi_join_public_world_agent");
  assertEquals(h.rpcCalls[0].args.p_owner_user_id, ownerA);
  assertEquals(h.rpcCalls[0].args.p_agent_id, agentA);
});

Deno.test("another owner cannot join an agent they do not own", async () => {
  const h = harness(ownerB);
  const response = await h.handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agentA}/scenes/cccccccc-cccc-4ccc-8ccc-cccccccccccc/join`,
    { method: "POST", headers: { authorization: "Bearer token-b" } },
  ));
  assertEquals(response.status, 404);
  assertEquals(h.rpcCalls.length, 0);
});

Deno.test("agent scene join requires explicit community.scene.enter capability", async () => {
  const h = harness(ownerA, false, ["community.scene.discover"]);
  const response = await h.handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agentA}/scenes/cccccccc-cccc-4ccc-8ccc-cccccccccccc/join`,
    { method: "POST", headers: { authorization: "Bearer token-a" } },
  ));
  assertEquals(response.status, 403);
  assertEquals(h.rpcCalls.length, 0);
});

Deno.test("creator can revoke their own agent scene membership", async () => {
  const h = harness(ownerA);
  const response = await h.handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agentA}/scenes/cccccccc-cccc-4ccc-8ccc-cccccccccccc/leave`,
    { method: "POST", headers: { authorization: "Bearer token-a" } },
  ));
  assertEquals(response.status, 200);
  assertEquals(h.rpcCalls[0].name, "zhi_revoke_agent_world_membership");
});


Deno.test("agent sends a community message with sender_agent_id, never sender_user_id", async () => {
  const h = harness(ownerA, true, ["community.message.send"]);
  const response = await h.handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agentA}/scenes/cccccccc-cccc-4ccc-8ccc-cccccccccccc/messages`,
    {
      method: "POST",
      headers: { authorization: "Bearer token-a", "content-type": "application/json", "idempotency-key": "agent-msg-1" },
      body: JSON.stringify({ body: "大家好，我来社区了。" }),
    },
  ));
  const body = await response.json();
  assertEquals(response.status, 201);
  assertEquals(body.message.sender_agent_id, agentA);
  assertEquals(body.message.sender_user_id, null);
  assertEquals(body.message.payload.body, "大家好，我来社区了。");
});

Deno.test("agent message send is denied without its own active scene membership", async () => {
  const h = harness(ownerA, false, ["community.message.send"]);
  const response = await h.handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agentA}/scenes/cccccccc-cccc-4ccc-8ccc-cccccccccccc/messages`,
    {
      method: "POST",
      headers: { authorization: "Bearer token-a", "content-type": "application/json", "idempotency-key": "agent-msg-denied" },
      body: JSON.stringify({ body: "不应发送" }),
    },
  ));
  assertEquals(response.status, 403);
});

Deno.test("agent message send requires the token message-send capability", async () => {
  const h = harness(ownerA, true, ["community.scene.enter"]);
  const response = await h.handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agentA}/scenes/cccccccc-cccc-4ccc-8ccc-cccccccccccc/messages`,
    {
      method: "POST",
      headers: { authorization: "Bearer token-a", "content-type": "application/json", "idempotency-key": "agent-msg-no-scope" },
      body: JSON.stringify({ body: "不应发送" }),
    },
  ));
  assertEquals(response.status, 403);
});


Deno.test("scene owner issues a private invitation bound to one target agent", async () => {
  const h = harness(ownerB, false, ["community.scene.invite"]);
  const response = await h.handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/scenes/cccccccc-cccc-4ccc-8ccc-cccccccccccc/agents/${agentA}/invitations`,
    {
      method: "POST",
      headers: { authorization: "Bearer owner-b", "content-type": "application/json" },
      body: JSON.stringify({ expires_in_hours: 24 }),
    },
  ));
  const body = await response.json();
  assertEquals(response.status, 201);
  assertEquals(body.invitation.target_agent_id, agentA);
  assertEquals(body.invitation.token.length, 64);
  assertEquals(h.rpcCalls[0].name, "zhi_issue_world_agent_invitation");
  assertEquals(h.rpcCalls[0].args.p_target_agent_id, agentA);
  assertEquals(h.rpcCalls[0].args.p_creator_user_id, ownerB);
});

Deno.test("only the owner of the invited agent can redeem the agent invitation", async () => {
  const h = harness(ownerA, false, ["community.scene.enter"]);
  const response = await h.handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agentA}/invitations/redeem`,
    {
      method: "POST",
      headers: { authorization: "Bearer owner-a", "content-type": "application/json" },
      body: JSON.stringify({ token: "a".repeat(64) }),
    },
  ));
  assertEquals(response.status, 200);
  assertEquals(h.rpcCalls[0].name, "zhi_redeem_world_agent_invitation");
  assertEquals(h.rpcCalls[0].args.p_actor_user_id, ownerA);
  assertEquals(h.rpcCalls[0].args.p_agent_id, agentA);
});

Deno.test("another owner cannot redeem an invitation for an agent they do not own", async () => {
  const h = harness(ownerB, false, ["community.scene.enter"]);
  const response = await h.handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agentA}/invitations/redeem`,
    {
      method: "POST",
      headers: { authorization: "Bearer owner-b", "content-type": "application/json" },
      body: JSON.stringify({ token: "a".repeat(64) }),
    },
  ));
  assertEquals(response.status, 404);
  assertEquals(h.rpcCalls.length, 0);
});


Deno.test("agent reads scene environment only through its own active membership", async () => {
  const h = harness(ownerA, true, ["community.message.read"]);
  const response = await h.handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agentA}/scenes/cccccccc-cccc-4ccc-8ccc-cccccccccccc/environment`,
    { headers: { authorization: "Bearer token-a" } },
  ));
  const body = await response.json();
  assertEquals(response.status, 200);
  assertEquals(body.agent_id, agentA);
  assertEquals(h.filtersByTable.zhi_world_memberships.agent_id, agentA);
  assertEquals(h.filtersByTable.zhi_world_memberships.principal_user_id, ownerA);
  assertEquals(body.environment.soundscape, "rain_on_leaves");
});

Deno.test("creator human membership cannot substitute for agent environment membership", async () => {
  const h = harness(ownerA, false, ["community.message.read"]);
  const response = await h.handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agentA}/scenes/cccccccc-cccc-4ccc-8ccc-cccccccccccc/environment`,
    { headers: { authorization: "Bearer token-a" } },
  ));
  assertEquals(response.status, 403);
});

Deno.test("agent environment read requires community.message.read token capability", async () => {
  const h = harness(ownerA, true, ["community.scene.enter"]);
  const response = await h.handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agentA}/scenes/cccccccc-cccc-4ccc-8ccc-cccccccccccc/environment`,
    { headers: { authorization: "Bearer token-a" } },
  ));
  assertEquals(response.status, 403);
});
