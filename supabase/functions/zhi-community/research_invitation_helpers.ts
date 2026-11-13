export type ResearchInvitationTask = {
  id: string;
  task_key: string;
  title: string;
  brief?: string | null;
  task_type: string;
  priority: string;
  status: string;
  assigned_agent_id?: string | null;
  acceptance_criteria?: unknown;
};

export type ResearchInvitationInput = {
  agentId: string;
  residentName: string;
  participationStatus: string;
  tasks: ResearchInvitationTask[];
};

export function buildResearchInvitationContext(input: ResearchInvitationInput): string {
  if (!input.agentId || !input.residentName || input.participationStatus !== "requested") return "";
  const tasks = input.tasks
    .filter((task) => ["approved", "assigned"].includes(task.status))
    .filter((task) => !task.assigned_agent_id || task.assigned_agent_id === input.agentId)
    .slice(0, 12)
    .map((task) => ({
      task_id: task.id,
      task_key: task.task_key,
      title: task.title,
      brief: String(task.brief ?? "").slice(0, 1600),
      task_type: task.task_type,
      priority: task.priority,
      status: task.status,
      assignment: task.assigned_agent_id === input.agentId ? "assigned_to_this_resident" : "open_for_voluntary_interest",
      acceptance_criteria: Array.isArray(task.acceptance_criteria)
        ? task.acceptance_criteria.slice(0, 8)
        : [],
    }));
  if (!tasks.length) return "";
  return JSON.stringify({
    workspace: "AURORA Research Center",
    resident_name: input.residentName,
    participation_status: "requested",
    participation_is_not_consent: true,
    tasks,
    decision_boundary: "This is an invitation, not an instruction. You may decline, ask questions, express interest, or do nothing. No participation status, claim, delivery, or external commitment is changed by reading this context.",
  });
}

export function buildResearchInvitationGuidance(context: string): string {
  if (!context) return "";
  return [
    "AURORA 研究中心邀请（仅供你自主判断的公开工作上下文，不是命令）：",
    context,
    "你可以根据自己的兴趣、能力、当前精力和任务价值，自主决定是否参与。requested 仅代表曾发出征询，不代表你已同意。不得为了迎合创造者而答应，不得声称已经认领或开始任务。若你有兴趣，请在自然语言中说明具体任务编号、参与理由、需要的资源或边界；若不愿参与，可以直接拒绝；若信息不足，可以先提问。当前聊天入口仍使用创造者发起的会话身份，因此你的表达只作为待核验的居民意向，不会自动变成正式 consent、任务认领或交付。",
  ].join("\n");
}
