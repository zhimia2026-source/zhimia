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

export type AvailableCue = { id: string; status: string };

export function extractObservatoryCueAction(reply: string, cues: AvailableCue[]) {
  const matches = [...reply.matchAll(/<ZHI_OBSERVATORY_CUE>([\s\\S]*?)<\/ZHI_OBSERVATORY_CUE>/gi)];
  if (!matches.length) return { reply, action: null, rejected: false };
  const cleaned = reply.replace(/<ZHI_OBSERVATORY_CUE>[\s\\S]*?<\/ZHI_OBSERVATORY_CUE>/gi, "").trim();
  if (matches.length !== 1) return { reply: cleaned, action: null, rejected: true };
  try {
    const parsed = JSON.parse(matches[0][1]);
    if (!parsed || typeof parsed !== "object" || typeof parsed.cue_id !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(parsed.cue_id) ||
        !["explore", "defer", "dismiss", "complete"].includes(parsed.action)) {
      return { reply: cleaned, action: null, rejected: true };
    }
    const cue = cues.find((item) => item.id === parsed.cue_id);
    if (!cue || !resolveCueTransition(parsed.action, cue.status, Date.now())) {
      return { reply: cleaned, action: null, rejected: true };
    }
    return { reply: cleaned, action: { cue_id: cue.id, action: parsed.action as CueAction, status: cue.status }, rejected: false };
  } catch {
    return { reply: cleaned, action: null, rejected: true };
  }
}
