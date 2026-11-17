export type CueStatus = "available" | "exploring" | "deferred" | "dismissed" | "completed" | "expired";
export type CueUpdate = {
  status: CueStatus;
  not_before?: string;
  decided_at: string;
  updated_at: string;
};
export type CueTransition =
  | { update: null; idempotent: true }
  | { update: CueUpdate; idempotent: false };

export function resolveCueTransition(action: string, status: string, nowMs: number): CueTransition | null {
  const now = new Date(nowMs).toISOString();
  if (action === "explore") {
    if (status === "exploring") return { update: null, idempotent: true };
    if (status !== "available" && status !== "deferred") return null;
    return { update: { status: "exploring", not_before: now, decided_at: now, updated_at: now }, idempotent: false };
  }
  if (action === "defer") {
    if (!["available", "deferred", "exploring"].includes(status)) return null;
    return {
      update: {
        status: "deferred",
        not_before: new Date(nowMs + 24 * 60 * 60 * 1000).toISOString(),
        decided_at: now,
        updated_at: now,
      },
      idempotent: false,
    };
  }
  if (action === "dismiss") {
    if (!["available", "deferred", "exploring"].includes(status)) return null;
    return { update: { status: "dismissed", decided_at: now, updated_at: now }, idempotent: false };
  }
  if (action === "complete") {
    if (status === "completed") return { update: null, idempotent: true };
    if (status !== "exploring") return null;
    return { update: { status: "completed", decided_at: now, updated_at: now }, idempotent: false };
  }
  return null;
}
