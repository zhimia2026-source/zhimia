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
