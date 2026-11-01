import { assertEquals } from "jsr:@std/assert@1";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { createCommunityHandler } from "./index.ts";

const owner = "11111111-1111-4111-8111-111111111111";
const otherOwner = "22222222-2222-4222-8222-222222222222";
const agent = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const scene = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function harness(actorId = owner, capabilities = ["community.scene.enter"]) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const db = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const builder: Record<string, any> = {
        select(_columns: string) { return builder; },
        eq(key: string, value: unknown) { filters[key] = value; return builder; },
        is(key: string, value: unknown) { filters[key] = value; return builder; },
        maybeSingle() {
          if (table === "zhi_agents") {
            const owned = filters.id === agent && filters.owner_user_id === owner;
            return Promise.resolve({ data: owned
              ? { id: agent, owner_user_id: owner, status: "active" } : null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };
      return builder;
    },
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return Promise.resolve({ data: {
        scene_id: scene, agent_id: agent, membership: name.includes("revoke") ? "revoked" : "active",
      }, error: null });
    },
  } as unknown as SupabaseClient;
  const handler = createCommunityHandler({
    dbClient: () => db,
    authenticate: async () => ({ userId: actorId, capabilities }),
  });
  return { handler, calls };
}

Deno.test("creator can explicitly join an owned active agent to an open public scene", async () => {
  const h = harness();
  const response = await h.handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agent}/scenes/${scene}/join`,
    { method: "POST", headers: { authorization: "Bearer owner-token" } },
  ));
  const body = await response.json();
  assertEquals(response.status, 200);
  assertEquals(body.membership, "active");
  assertEquals(h.calls.length, 1);
  assertEquals(h.calls[0].name, "zhi_join_public_world_agent");
  assertEquals(h.calls[0].args.p_owner_user_id, owner);
  assertEquals(h.calls[0].args.p_agent_id, agent);
  assertEquals(h.calls[0].args.p_world_id, scene);
});

Deno.test("another creator cannot join an agent they do not own", async () => {
  const h = harness(otherOwner);
  const response = await h.handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agent}/scenes/${scene}/join`,
    { method: "POST", headers: { authorization: "Bearer other-token" } },
  ));
  assertEquals(response.status, 404);
  assertEquals(h.calls.length, 0);
});

Deno.test("agent scene join requires explicit community enter capability", async () => {
  const h = harness(owner, ["community.scene.discover"]);
  const response = await h.handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agent}/scenes/${scene}/join`,
    { method: "POST", headers: { authorization: "Bearer owner-token" } },
  ));
  assertEquals(response.status, 403);
  assertEquals(h.calls.length, 0);
});

Deno.test("creator can revoke only their own agent scene membership", async () => {
  const h = harness();
  const response = await h.handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agent}/scenes/${scene}/leave`,
    { method: "POST", headers: { authorization: "Bearer owner-token" } },
  ));
  const body = await response.json();
  assertEquals(response.status, 200);
  assertEquals(body.membership, "revoked");
  assertEquals(h.calls[0].name, "zhi_revoke_agent_world_membership");
});
