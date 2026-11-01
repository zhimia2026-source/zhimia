import { assertEquals } from "jsr:@std/assert@1";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { createCommunityHandler } from "./index.ts";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const agentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const baseId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const feedbackId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const baseRecord = {
  id: baseId, owner_user_id: ownerA, agent_id: agentId,
  object_type: "world", object_id: "forest", state: { weather: "rain" },
  relation_ids: [], evidence_kind: "hypothesis", source_ids: ["forecast"],
  confidence: 0.7, event_time: null, recorded_at: "2026-10-30T10:00:00Z",
  inferred_at: "2026-10-30T10:01:00Z", hypothesis: "Rain may begin",
  prediction: "Rain within one hour", version: 2,
};
const feedbackRecord = {
  id: feedbackId, owner_user_id: ownerA, agent_id: agentId,
  object_type: "feedback", object_id: "forest",
  state: { hypothesis_id: baseId, observed_outcome: "No rain" },
  relation_ids: [baseId], evidence_kind: "observation", source_ids: ["weather-check"],
  confidence: 0.95, event_time: "2026-10-30T11:00:00Z",
  recorded_at: "2026-10-30T11:01:00Z", inferred_at: null,
  hypothesis: null, prediction: null, version: 1,
};

function harness(actorId = ownerA) {
  let rpcCalls = 0;
  const db = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let ids: unknown[] = [];
      const builder = {
        select(_columns: string) { return builder; },
        eq(key: string, value: unknown) { filters[key] = value; return builder; },
        in(_key: string, values: unknown[]) { ids = values; return builder; },
        order(_key: string, _options: unknown) { return builder; },
        limit(_value: number) { return builder; },
        maybeSingle() {
          if (table === "zhi_agents") {
            return Promise.resolve({
              data: filters.owner_user_id === ownerA && filters.id === agentId
                ? { id: agentId, owner_user_id: ownerA, status: "active" } : null,
              error: null,
            });
          }
          if (table === "zhi_agent_cognition_records" && filters.id === baseId &&
              filters.owner_user_id === ownerA && filters.agent_id === agentId) {
            return Promise.resolve({ data: baseRecord, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        then(resolve: (value: unknown) => unknown) {
          const data = table === "zhi_agent_cognition_records" && ids.includes(feedbackId) &&
            filters.owner_user_id === ownerA && filters.agent_id === agentId
            ? [feedbackRecord] : [];
          return Promise.resolve({ data, error: null }).then(resolve);
        },
      };
      return builder;
    },
    rpc(_name: string, args: Record<string, unknown>) {
      rpcCalls++;
      return Promise.resolve({
        data: {
          id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
          owner_user_id: args.p_owner_user_id,
          agent_id: args.p_agent_id,
          status: "shadow_proposed",
          requires_human_review: true,
        },
        error: null,
      });
    },
  } as unknown as SupabaseClient;
  const handler = createCommunityHandler({
    dbClient: () => db,
    authenticate: async () => ({ userId: actorId }),
  });
  return { handler, getRpcCalls: () => rpcCalls };
}

Deno.test("revision proposal persists only after owned base and feedback validate", async () => {
  const { handler, getRpcCalls } = harness();
  const response = await handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agentId}/cognition/${baseId}/proposals`,
    {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({
        feedback_record_ids: [feedbackId],
        proposed_state: { weather_expectation: "lower_confidence" },
      }),
    },
  ));
  const body = await response.json();
  assertEquals(response.status, 201);
  assertEquals(body.proposal.status, "shadow_proposed");
  assertEquals(body.proposal.requires_human_review, true);
  assertEquals(getRpcCalls(), 1);
});

Deno.test("revision proposal route does not reveal another owner's agent", async () => {
  const { handler, getRpcCalls } = harness(ownerB);
  const response = await handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agentId}/cognition/${baseId}/proposals`,
    {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({
        feedback_record_ids: [feedbackId],
        proposed_state: { spoofed: true },
      }),
    },
  ));
  assertEquals(response.status, 404);
  assertEquals(getRpcCalls(), 0);
});

Deno.test("revision proposal route rejects missing evidence and malformed IDs", async () => {
  const { handler, getRpcCalls } = harness();
  const response = await handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agentId}/cognition/${baseId}/proposals`,
    {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({
        feedback_record_ids: ["not-a-uuid"],
        proposed_state: { changed: true },
      }),
    },
  ));
  assertEquals(response.status, 400);
  assertEquals(getRpcCalls(), 0);
});
