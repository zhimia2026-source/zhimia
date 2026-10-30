import { assertEquals } from "jsr:@std/assert@1";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { createCommunityHandler } from "./index.ts";

const userA = "11111111-1111-4111-8111-111111111111";
const userB = "22222222-2222-4222-8222-222222222222";

Deno.test("agent registration binds owner to authenticated principal", async () => {
  const state: { inserted: Record<string, unknown> | null } = { inserted: null };
  const fakeDb = {
    from(table: string) {
      let payload: Record<string, unknown> | null = null;
      const builder = {
        insert(value: Record<string, unknown>) { payload = value; return builder; },
        select(_columns: string) { return builder; },
        single() {
          if (table === "zhi_agents" && payload) {
            state.inserted = payload;
            return Promise.resolve({ data: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", ...payload, status: "active" }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
  const handler = createCommunityHandler({
    dbClient: () => fakeDb,
    authenticate: async () => ({ userId: userA }),
  });
  const response = await handler(new Request("https://unit.test/functions/v1/zhi-community/v1/agents", {
    method: "POST",
    headers: { authorization: "Bearer token-a", "content-type": "application/json" },
    body: JSON.stringify({ display_name: "First Manager", owner_user_id: userB }),
  }));
  assertEquals(response.status, 201);
  assertEquals(state.inserted?.owner_user_id, userA);
  assertEquals(state.inserted?.role, "manager");
  assertEquals(state.inserted?.visibility, "private");
});

Deno.test("agent registration rejects invalid display names", async () => {
  let writes = 0;
  const fakeDb = {
    from(_table: string) {
      const builder = {
        insert(_value: Record<string, unknown>) { writes += 1; return builder; },
        select(_columns: string) { return builder; },
        single() { return Promise.resolve({ data: null, error: null }); },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
  const handler = createCommunityHandler({
    dbClient: () => fakeDb,
    authenticate: async () => ({ userId: userA }),
  });
  const response = await handler(new Request("https://unit.test/functions/v1/zhi-community/v1/agents", {
    method: "POST",
    headers: { authorization: "Bearer token-a", "content-type": "application/json" },
    body: JSON.stringify({ display_name: " " }),
  }));
  assertEquals(response.status, 400);
  assertEquals(writes, 0);
});
