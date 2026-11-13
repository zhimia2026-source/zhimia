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

export function getUpstreamTaskKey(inputRefs: unknown): string | null {
  if (!Array.isArray(inputRefs)) return null;
  for (const item of inputRefs) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const value = (item as Record<string, unknown>).upstream_task_key;
    if (typeof value === "string" && /^[A-Z0-9][A-Z0-9-]{2,40}$/.test(value)) return value;
  }
  return null;
}
export function isUpstreamStageComplete(status: unknown, acceptedArtifactCount: number): boolean {
  return status === "done" && Number.isInteger(acceptedArtifactCount) && acceptedArtifactCount > 0;
}
