import { normalizeResidentResearchProposal } from "./resident_research_proposal_helpers.ts";

const projects = [{ id: "11111111-1111-4111-8111-111111111111", title: "Allowed", objective: "Test" }];

Deno.test("accepts a bounded resident research proposal for a visible project", () => {
  const result = normalizeResidentResearchProposal({
    project_id: projects[0].id,
    title: "Test research question",
    brief: "A bounded question with a measurable purpose.",
    task_type: "analysis",
    priority: "high",
    acceptance_criteria: ["At least three verifiable public sources."],
    input_refs: [{ url: "https://example.org/source", title: "Public source" }],
  }, projects);
  if (!result || result.project_id !== projects[0].id || result.input_refs.length !== 1) {
    throw new Error("valid proposal was not normalized");
  }
});

Deno.test("rejects a proposal for a project not present in the resident context", () => {
  const result = normalizeResidentResearchProposal({
    project_id: "22222222-2222-4222-8222-222222222222",
    title: "Test research question",
    brief: "A bounded question with a measurable purpose.",
    task_type: "analysis",
    acceptance_criteria: ["A verifiable result."],
  }, projects);
  if (result !== null) throw new Error("unknown project must be rejected");
});

Deno.test("rejects a proposal without acceptance criteria", () => {
  const result = normalizeResidentResearchProposal({
    project_id: projects[0].id,
    title: "Test research question",
    brief: "A bounded question with a measurable purpose.",
    task_type: "analysis",
    acceptance_criteria: [],
  }, projects);
  if (result !== null) throw new Error("missing acceptance criteria must be rejected");
});
