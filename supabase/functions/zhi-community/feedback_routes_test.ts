import { assertEquals } from "jsr:@std/assert@1";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { createCommunityHandler } from "./index.ts";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const agentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const hypothesisId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const hypothesis = {
  id: hypothesisId, owner_user_id: ownerA, agent_id: agentId,
  object_type: "world", object_id: "weather", state: { sky: "cloudy" },
  relation_ids: [], evidence_kind: "hypothesis", source_ids: ["obs-1"],
  confidence: 0.7, event_time: null, recorded_at: "2026-10-30T05:00:00.000Z",
  inferred_at: "2026-10-30T05:01:00.000Z", hypothesis: "Rain may begin",
  prediction: "Rain within one hour", version: 1,
};

function harness(actorId = ownerA) {
  const inserted: Record<string, unknown>[] = [];
  const lookups: Array<{ table: string; filters: Record<string, unknown> }> = [];
  const db = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const query = { table, filters, payload: null as Record<string, unknown> | null };
      lookups.push(query);
      const builder = {
        select(_columns: string) { return builder; },
        eq(key: string, value: unknown) { filters[key] = value; return builder; },
        maybeSingle() {
          if (table === "zhi_agents") {
            return Promise.resolve({
              data: filters.owner_user_id === ownerA && filters.id === agentId
                ? { id: agentId, owner_user_id: ownerA, status: "active" } : null,
              error: null,
            });
          }
          if (table === "zhi_agent_cognition_records") {
            return Promise.resolve({
              data: filters.id === hypothesisId && filters.owner_user_id === ownerA &&
                filters.agent_id === agentId ? hypothesis : null,
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
        insert(payload: Record<string, unknown>) { query.payload = payload; return builder; },
        single() {
          if (!query.payload) return Promise.resolve({ data: null, error: null });
          inserted.push(query.payload);
          return Promise.resolve({ data: query.payload, error: null });
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
  const handler = createCommunityHandler({
    dbClient: () => db,
    authenticate: async () => ({ userId: actorId }),
  });
  return { handler, inserted, lookups };
}

Deno.test("feedback endpoint appends an observation linked to the owned hypothesis", async () => {
  const { handler, inserted } = harness();
  const response = await handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agentId}/cognition/${hypothesisId}/feedback`,
    {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({
        source_id: "weather-observation-2",
        event_time: "2026-10-30T05:30:00.000Z",
        observed_outcome: "No rain occurred within one hour",
        confidence: 0.95,
      }),
    },
  ));
  assertEquals(response.status, 201);
  assertEquals(inserted.length, 1);
  assertEquals(inserted[0].owner_user_id, ownerA);
  assertEquals(inserted[0].agent_id, agentId);
  assertEquals(inserted[0].object_type, "feedback");
  assertEquals(inserted[0].evidence_kind, "observation");
  assertEquals((inserted[0].state as Record<string, unknown>).hypothesis_id, hypothesisId);
  assertEquals(inserted[0].source_ids, ["weather-observation-2"]);
});

Deno.test("feedback endpoint does not reveal another owner's hypothesis", async () => {
  const { handler, inserted } = harness(ownerB);
  const response = await handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agentId}/cognition/${hypothesisId}/feedback`,
    {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({
        source_id: "source-2", event_time: "2026-10-30T05:30:00.000Z",
        observed_outcome: "Observed", confidence: 0.8,
      }),
    },
  ));
  assertEquals(response.status, 404);
  assertEquals(inserted.length, 0);
});

Deno.test("feedback endpoint rejects missing or invalid evidence without inserting", async () => {
  const { handler, inserted } = harness();
  const response = await handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agentId}/cognition/${hypothesisId}/feedback`,
    {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({
        source_id: "source-2", event_time: "not-a-time",
        observed_outcome: "Observed", confidence: 1.5,
      }),
    },
  ));
  assertEquals(response.status, 400);
  assertEquals(inserted.length, 0);
});
