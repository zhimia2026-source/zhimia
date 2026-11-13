export const RESEARCH_TASK_TRANSITIONS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  proposed: ["approved", "cancelled"],
  approved: ["cancelled"],
  assigned: ["in_progress", "blocked", "cancelled"],
  in_progress: ["review", "blocked", "cancelled"],
  review: ["done", "blocked", "cancelled"],
  blocked: ["cancelled"],
});

export function canTransitionResearchTask(from: string, to: string): boolean {
  return RESEARCH_TASK_TRANSITIONS[from]?.includes(to) ?? false;
}
