import { assertEquals } from "jsr:@std/assert@1";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { createCommunityHandler } from "./index.ts";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const sceneA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const sceneB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const expiredScene = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

Deno.test("my scenes lists only unexpired active memberships owned by the authenticated user", async () => {
  const queries: string[] = [];
  const filters: Record<string, Record<string, unknown>> = {};
  const db = {
    from(table: string) {
      queries.push(table);
      const where: Record<string, unknown> = {};
      filters[table] = where;
      const builder: Record<string, any> = {
        select(_columns: string) { return builder; },
        eq(key: string, value: unknown) { where[key] = value; return builder; },
        is(key: string, value: unknown) { where[key] = value; return builder; },
        order(_key: string, _options: unknown) { return builder; },
        limit(_value: number) { return builder; },
        in(key: string, value: string[]) { where[key] = value; return builder; },
        then(resolve: (value: unknown) => unknown) {
          if (table === "zhi_world_memberships") {
            const rows = [
              { world_id: sceneA, principal_user_id: ownerA, membership_role: "owner", capabilities: ["scene:manage"], expires_at: null },
              { world_id: expiredScene, principal_user_id: ownerA, membership_role: "member", capabilities: ["message:read"], expires_at: "2000-01-01T00:00:00Z" },
              { world_id: sceneB, principal_user_id: ownerB, membership_role: "owner", capabilities: ["scene:manage"], expires_at: null },
            ].filter(row => row.principal_user_id === where.principal_user_id &&
              row.expires_at === null || row.principal_user_id === where.principal_user_id);
            return Promise.resolve({ data: rows, error: null }).then(resolve);
          }
          if (table === "zhi_worlds") {
            const ids = where.id as string[];
            const rows = [
              { id: sceneA, name: "A 私人场景", visibility: "private", status: "open" },
              { id: sceneB, name: "B 私人场景", visibility: "private", status: "open" },
              { id: expiredScene, name: "过期场景", visibility: "private", status: "open" },
            ].filter(row => ids.includes(row.id) && row.status === where.status);
            return Promise.resolve({ data: rows, error: null }).then(resolve);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
  const handler = createCommunityHandler({
    dbClient: () => db,
    authenticate: async () => ({ userId: ownerA }),
  });
  const response = await handler(new Request("https://unit.test/functions/v1/zhi-community/v1/scenes/mine", {
    headers: { authorization: "Bearer owner-a" },
  }));
  const body = await response.json();
  assertEquals(response.status, 200);
  assertEquals(body.items.length, 1);
  assertEquals(body.items[0].id, sceneA);
  assertEquals(body.items[0].membership_role, "owner");
  assertEquals(body.items[0].capabilities, ["scene:manage"]);
  assertEquals(filters.zhi_world_memberships.principal_user_id, ownerA);
  assertEquals(queries.includes("zhi_agent_chat_turns"), false);
});
