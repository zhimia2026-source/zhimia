import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildResearchInvitationContext, buildResearchInvitationGuidance } from "./research_invitation_helpers.ts";

Deno.test("only requested residents receive voluntary invitation context", () => {
  const tasks = [{
    id: "task-1", task_key: "PIPE-03", title: "Engineering limits",
    task_type: "analysis", priority: "high", status: "approved",
    assigned_agent_id: "agent-1", acceptance_criteria: ["evidence"],
  }];
  const context = buildResearchInvitationContext({
    agentId: "agent-1", residentName: "Elon", participationStatus: "requested", tasks,
  });
  assertEquals(context.includes("PIPE-03"), true);
  assertEquals(context.includes('"participation_is_not_consent":true'), true);
  assertEquals(buildResearchInvitationContext({
    agentId: "agent-1", residentName: "Elon", participationStatus: "declined", tasks,
  }), "");
});

Deno.test("does not expose tasks assigned to another resident or inactive tasks", () => {
  const context = buildResearchInvitationContext({
    agentId: "agent-1", residentName: "Resident", participationStatus: "requested",
    tasks: [
      { id: "other", task_key: "PIPE-02", title: "Other", task_type: "analysis", priority: "normal", status: "assigned", assigned_agent_id: "agent-2" },
      { id: "blocked", task_key: "PIPE-04", title: "Blocked", task_type: "analysis", priority: "normal", status: "blocked" },
    ],
  });
  assertEquals(context, "");
  assertEquals(buildResearchInvitationGuidance(""), "");
});
