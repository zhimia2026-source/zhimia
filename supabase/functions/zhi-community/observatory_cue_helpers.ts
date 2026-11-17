export type CueAction = "explore" | "defer" | "dismiss" | "complete";
export type CueStatus = "available" | "exploring" | "deferred" | "dismissed" | "completed" | "expired";

export function resolveCueTransition(action: string, status: string, nowMs: number) {
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
