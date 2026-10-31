import { assertEquals } from "jsr:@std/assert@1";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { createCommunityHandler } from "./index.ts";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";

function makeHarness() {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const fakeDb = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return { data: { scene: { id: "scene-created" }, membership: "owner" }, error: null };
    },
  } as unknown as SupabaseClient;
  const handler = createCommunityHandler({
    dbClient: () => fakeDb,
    authenticate: async (_db, req) => {
      const bearer = req.headers.get("authorization");
      if (bearer === "Bearer token-a") return { userId: userA };
      if (bearer === "Bearer token-b") return { userId: userB };
      return null;
    },
  });
  return { handler, rpcCalls };
}

Deno.test("HTTP scene creation binds creator to authenticated principal, not request body", async () => {
  const { handler, rpcCalls } = makeHarness();
  const response = await handler(new Request("https://unit.test/functions/v1/zhi-community/v1/scenes", {
    method: "POST",
    headers: { authorization: "Bearer token-a", "content-type": "application/json" },
    body: JSON.stringify({
      name: "A's private test scene",
      visibility: "private",
      creator_user_id: userB,
      owner_user_id: userB,
    }),
  }));
  assertEquals(response.status, 201);
  assertEquals(rpcCalls.length, 1);
  assertEquals(rpcCalls[0].name, "zhi_create_world_with_owner");
  assertEquals(rpcCalls[0].args.p_creator_user_id, userA);
  assertEquals(rpcCalls[0].args.p_visibility, "private");
});

Deno.test("two authenticated HTTP requests are scoped to their own principals", async () => {
  const { handler, rpcCalls } = makeHarness();
  for (const [token, expectedUser] of [["token-a", userA], ["token-b", userB]]) {
    const response = await handler(new Request("https://unit.test/functions/v1/zhi-community/v1/scenes", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ name: "test scene", visibility: "public", user_id: userA }),
    }));
    assertEquals(response.status, 201);
    assertEquals(rpcCalls.at(-1)?.args.p_creator_user_id, expectedUser);
  }
});

Deno.test("HTTP requests with invalid credentials are rejected before database access", async () => {
  let databaseCalls = 0;
  const fakeDb = {
    rpc: async () => {
      databaseCalls += 1;
      return { data: null, error: null };
    },
  } as unknown as SupabaseClient;
  const handler = createCommunityHandler({
    dbClient: () => fakeDb,
    authenticate: async () => null,
  });
  const response = await handler(new Request("https://unit.test/functions/v1/zhi-community/v1/scenes", {
    method: "POST",
    headers: { authorization: "Bearer invalid", "content-type": "application/json" },
    body: JSON.stringify({ name: "should not exist", visibility: "public" }),
  }));
  assertEquals(response.status, 401);
  assertEquals(databaseCalls, 0);
});


const agentA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const agentB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function makeCognitionHarness() {
  const inserted: Array<Record<string, unknown>> = [];
  const queries: Array<{ table: string; filters: Record<string, unknown>; operation: string }> = [];
  let principal = userA;
  const fakeDb = {
    from(table: string) {
      const query = { table, filters: {} as Record<string, unknown>, operation: "select", payload: null as Record<string, unknown> | null };
      queries.push(query);
      const builder = {
        select(_columns: string) { return builder; },
        eq(key: string, value: unknown) { query.filters[key] = value; return builder; },
        order(_key: string, _options: unknown) { return builder; },
        limit(_count: number) { return Promise.resolve({ data: inserted.filter(x => x.owner_user_id === query.filters.owner_user_id && x.agent_id === query.filters.agent_id), error: null }); },
        maybeSingle() {
          if (table === "zhi_agents") {
            const id = query.filters.id;
            const owner = query.filters.owner_user_id;
            const actualOwner = id === agentA ? userA : id === agentB ? userB : null;
            return Promise.resolve({ data: actualOwner === owner ? { id, owner_user_id: actualOwner, status: "active" } : null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        insert(payload: Record<string, unknown>) { query.operation = "insert"; query.payload = payload; return builder; },
        single() {
          if (table === "zhi_agent_cognition_records" && query.payload) {
            inserted.push(query.payload);
            return Promise.resolve({ data: query.payload, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
  const handler = createCommunityHandler({
    dbClient: () => fakeDb,
    authenticate: async (_db, req) => {
      const bearer = req.headers.get("authorization");
      if (bearer === "Bearer token-a") { principal = userA; return { userId: userA }; }
      if (bearer === "Bearer token-b") { principal = userB; return { userId: userB }; }
      return null;
    },
  });
  return { handler, inserted, queries, getPrincipal: () => principal };
}

Deno.test("private cognition POST binds owner and agent to authenticated principal, ignoring spoofed body fields", async () => {
  const { handler, inserted, queries } = makeCognitionHarness();
  const response = await handler(new Request(`https://unit.test/functions/v1/zhi-community/v1/agents/${agentA}/cognition`, {
    method: "POST",
    headers: { authorization: "Bearer token-a", "content-type": "application/json" },
    body: JSON.stringify({
      owner_user_id: userB, agent_id: agentB, object_type: "self", object_id: "identity",
      state: { role: "manager" }, evidence_kind: "observation", source_ids: ["source-1"], confidence: 0.9,
    }),
  }));
  assertEquals(response.status, 201);
  assertEquals(inserted.length, 1);
  assertEquals(inserted[0].owner_user_id, userA);
  assertEquals(inserted[0].agent_id, agentA);
  assertEquals(queries[0].filters.owner_user_id, userA);
});

Deno.test("private cognition GET scopes query by both authenticated owner and requested agent", async () => {
  const { handler, queries } = makeCognitionHarness();
  const response = await handler(new Request(`https://unit.test/functions/v1/zhi-community/v1/agents/${agentA}/cognition`, {
    headers: { authorization: "Bearer token-a" },
  }));
  assertEquals(response.status, 200);
  const read = queries.find(x => x.table === "zhi_agent_cognition_records");
  assertEquals(read?.filters.owner_user_id, userA);
  assertEquals(read?.filters.agent_id, agentA);
});

Deno.test("private cognition rejects an agent owned by another principal", async () => {
  const { handler, queries } = makeCognitionHarness();
  const response = await handler(new Request(`https://unit.test/functions/v1/zhi-community/v1/agents/${agentA}/cognition`, {
    headers: { authorization: "Bearer token-b" },
  }));
  assertEquals(response.status, 404);
  assertEquals(queries.some(x => x.table === "zhi_agent_cognition_records"), false);
});

Deno.test("private cognition rejects invalid MOU evidence before insert", async () => {
  const { handler, inserted } = makeCognitionHarness();
  const response = await handler(new Request(`https://unit.test/functions/v1/zhi-community/v1/agents/${agentA}/cognition`, {
    method: "POST",
    headers: { authorization: "Bearer token-a", "content-type": "application/json" },
    body: JSON.stringify({
      object_type: "self", object_id: "identity", state: {},
      evidence_kind: "unknown", confidence: 0.8,
    }),
  }));
  assertEquals(response.status, 400);
  assertEquals(inserted.length, 0);
});
