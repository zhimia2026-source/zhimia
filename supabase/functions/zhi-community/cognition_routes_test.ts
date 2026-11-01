import { assertEquals } from "jsr:@std/assert@1";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { createCommunityHandler } from "./index.ts";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const agentA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const agentB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const records = [
  { id: "c1111111-1111-4111-8111-111111111111", owner_user_id: ownerA, agent_id: agentA, object_type: "self", object_id: "identity-a", state: { name: "A" }, evidence_kind: "observation", source_ids: ["a"], confidence: 1, version: 1, change_note: "owner A note" },
  { id: "c2222222-2222-4222-8222-222222222222", owner_user_id: ownerB, agent_id: agentB, object_type: "self", object_id: "identity-b", state: { name: "B" }, evidence_kind: "observation", source_ids: ["b"], confidence: 1, version: 1, change_note: "owner B note" },
];

function harness(actorId: string) {
  const queriedTables: string[] = [];
  const filtersByTable: Record<string, Record<string, unknown>> = {};
  const db = {
    from(table: string) {
      queriedTables.push(table);
      const filters: Record<string, unknown> = {};
      filtersByTable[table] = filters;
      const builder = {
        select(_columns: string) { return builder; },
        eq(key: string, value: unknown) { filters[key] = value; return builder; },
        order(_key: string, _options: unknown) { return builder; },
        limit(_value: number) { return builder; },
        maybeSingle() {
          if (table !== "zhi_agents") return Promise.resolve({ data: null, error: null });
          const ownedAgent = actorId === ownerA
            ? { id: agentA, owner_user_id: ownerA, status: "active" }
            : { id: agentB, owner_user_id: ownerB, status: "active" };
          return Promise.resolve({
            data: filters.id === ownedAgent.id && filters.owner_user_id === actorId ? ownedAgent : null,
            error: null,
          });
        },
        then(resolve: (value: unknown) => unknown) {
          const data = table === "zhi_agent_cognition_records"
            ? records.filter((record) => record.owner_user_id === filters.owner_user_id &&
              record.agent_id === filters.agent_id)
            : [];
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
  const handler = createCommunityHandler({
    dbClient: () => db,
    authenticate: async () => ({ userId: actorId }),
  });
  return { handler, queriedTables, filtersByTable };
}

Deno.test("cognition list returns only records for the authenticated owner and owned agent", async () => {
  const { handler, filtersByTable } = harness(ownerA);
  const response = await handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agentA}/cognition`,
    { headers: { authorization: "Bearer token-a" } },
  ));
  const body = await response.json();
  assertEquals(response.status, 200);
  assertEquals(body.items.length, 1);
  assertEquals(body.items[0].owner_user_id, ownerA);
  assertEquals(body.items[0].change_note, "owner A note");
  assertEquals(filtersByTable.zhi_agent_cognition_records.owner_user_id, ownerA);
  assertEquals(filtersByTable.zhi_agent_cognition_records.agent_id, agentA);
});

Deno.test("cognition list cannot discover another owner's agent or records", async () => {
  const { handler, queriedTables } = harness(ownerB);
  const response = await handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agentA}/cognition`,
    { headers: { authorization: "Bearer token-b" } },
  ));
  assertEquals(response.status, 404);
  assertEquals(queriedTables.includes("zhi_agent_cognition_records"), false);
});

Deno.test("owner B can read only owner B's separate cognition partition", async () => {
  const { handler } = harness(ownerB);
  const response = await handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agentB}/cognition`,
    { headers: { authorization: "Bearer token-b" } },
  ));
  const body = await response.json();
  assertEquals(response.status, 200);
  assertEquals(body.items.length, 1);
  assertEquals(body.items[0].owner_user_id, ownerB);
  assertEquals(body.items[0].state.name, "B");
  assertEquals(body.items.some((item: Record<string, unknown>) => item.owner_user_id === ownerA), false);
});
