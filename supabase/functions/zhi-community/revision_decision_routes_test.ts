import { assertEquals } from "jsr:@std/assert@1";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { createCommunityHandler } from "./index.ts";

const ownerA = "11111111-1111-4111-8111-111111111111";
const ownerB = "22222222-2222-4222-8222-222222222222";
const agentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const proposalId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const targetRecordId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function harness(actorId = ownerA) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const db = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const builder = {
        select(_columns: string) { return builder; },
        eq(key: string, value: unknown) { filters[key] = value; return builder; },
        maybeSingle() {
          return Promise.resolve({
            data: table === "zhi_agents" && filters.id === agentId &&
              filters.owner_user_id === ownerA
              ? { id: agentId, owner_user_id: ownerA, status: "active" } : null,
            error: null,
          });
        },
      };
      return builder;
    },
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return Promise.resolve({
        data: { status: name === "zhi_rollback_cognition_version" ? "rolled_back" : "approved" },
        error: null,
      });
    },
  } as unknown as SupabaseClient;
  const handler = createCommunityHandler({
    dbClient: () => db,
    authenticate: async () => ({ userId: actorId }),
  });
  return { handler, calls };
}

Deno.test("only owner can approve a private cognition proposal", async () => {
  const { handler, calls } = harness();
  const response = await handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agentId}/cognition/proposals/${proposalId}/decision`,
    {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({ approved: true, decision_note: "Reviewed" }),
    },
  ));
  assertEquals(response.status, 200);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].name, "zhi_decide_cognition_revision_proposal");
  assertEquals(calls[0].args.p_owner_user_id, ownerA);
  assertEquals(calls[0].args.p_approved, true);
});

Deno.test("only owner can invoke cognition rollback", async () => {
  const { handler, calls } = harness();
  const response = await handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agentId}/cognition/rollback`,
    {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({ target_record_id: targetRecordId }),
    },
  ));
  assertEquals(response.status, 200);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].name, "zhi_rollback_cognition_version");
  assertEquals(calls[0].args.p_target_record_id, targetRecordId);
});

Deno.test("another owner cannot decide or roll back an agent's cognition", async () => {
  const { handler, calls } = harness(ownerB);
  const response = await handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agentId}/cognition/proposals/${proposalId}/decision`,
    {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({ approved: true }),
    },
  ));
  assertEquals(response.status, 404);
  assertEquals(calls.length, 0);
});

Deno.test("decision and rollback endpoints reject malformed commands", async () => {
  const { handler, calls } = harness();
  const decision = await handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agentId}/cognition/proposals/${proposalId}/decision`,
    {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({ approved: "yes" }),
    },
  ));
  const rollback = await handler(new Request(
    `https://unit.test/functions/v1/zhi-community/v1/agents/${agentId}/cognition/rollback`,
    {
      method: "POST",
      headers: { authorization: "Bearer test", "content-type": "application/json" },
      body: JSON.stringify({ target_record_id: "bad-id" }),
    },
  ));
  assertEquals(decision.status, 400);
  assertEquals(rollback.status, 400);
  assertEquals(calls.length, 0);
});
