export type ResidentResearchProjectOption = {
  id: string;
  title: string;
  objective: string;
};

export type ResidentResearchProposal = {
  project_id: string;
  title: string;
  brief: string;
  task_type: "research" | "analysis" | "synthesis" | "fact_check" | "peer_review" | "decision_memo";
  priority: "low" | "normal" | "high";
  acceptance_criteria: string[];
  input_refs: Array<{ url: string; title: string }>;
};

const TASK_TYPES = new Set([
  "research", "analysis", "synthesis", "fact_check", "peer_review", "decision_memo",
]);
const PRIORITIES = new Set(["low", "normal", "high"]);

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function normalizeResidentResearchProposal(
  raw: unknown,
  allowedProjects: ResidentResearchProjectOption[],
): ResidentResearchProposal | null {
  let value: unknown = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const projectId = cleanText(item.project_id, 36);
  if (!allowedProjects.some((project) => project.id === projectId)) return null;

  const title = cleanText(item.title, 180);
  const brief = cleanText(item.brief, 5000);
  const taskType = cleanText(item.task_type, 30);
  const requestedPriority = cleanText(item.priority, 20);
  if (title.length < 3 || brief.length < 10 || !TASK_TYPES.has(taskType)) return null;

  const criteria = Array.isArray(item.acceptance_criteria)
    ? item.acceptance_criteria
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim().slice(0, 300))
      .filter(Boolean)
      .slice(0, 8)
    : [];
  if (!criteria.length) return null;

  const inputRefs = Array.isArray(item.input_refs)
    ? item.input_refs.slice(0, 12).flatMap((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      const ref = entry as Record<string, unknown>;
      const url = cleanText(ref.url, 1000);
      const refTitle = cleanText(ref.title, 180);
      if (!/^https:\/\//i.test(url) || !refTitle) return [];
      return [{ url, title: refTitle }];
    })
    : [];

  return {
    project_id: projectId,
    title,
    brief,
    task_type: taskType as ResidentResearchProposal["task_type"],
    priority: PRIORITIES.has(requestedPriority)
      ? requestedPriority as ResidentResearchProposal["priority"]
      : "normal",
    acceptance_criteria: criteria,
    input_refs: inputRefs,
  };
}
