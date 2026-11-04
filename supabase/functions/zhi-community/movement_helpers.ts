export type MovementNode = {
  id: string;
  world_id: string;
  status: string;
  node_type: string;
  visibility: string;
  entry_policy: string;
};

export type MovementEdge = {
  world_id: string;
  from_node_id: string;
  to_node_id: string;
  relation: string;
  directed: boolean;
  access_policy: string;
  status: string;
};

export type MovementMembership = {
  principal_user_id: string;
  agent_id: string | null;
  status: string;
  revoked_at: string | null;
  expires_at: string | null;
  capabilities: string[] | null;
};

export type VirtualMovementValidationInput = {
  world_id: string;
  world_status: string;
  owner_user_id: string;
  agent_id: string;
  membership: MovementMembership | null;
  presence: { current_node_id: string | null; revision: number } | null;
  expected_presence_revision: number;
  route_node_ids: string[];
  nodes: MovementNode[];
  edges: MovementEdge[];
  now?: number;
};

export type VirtualMovementValidation =
  | { ok: true; route_node_ids: string[] }
  | {
    ok: false;
    reason:
      | "invalid_identity"
      | "world_not_open"
      | "membership_not_authorized"
      | "movement_capability_required"
      | "presence_unobserved"
      | "presence_revision_conflict"
      | "invalid_route"
      | "node_unavailable"
      | "node_not_traversable"
      | "node_not_public"
      | "node_entry_not_open"
      | "edge_not_traversable";
  };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TRAVERSABLE_RELATIONS = new Set(["adjacent_to", "entrance_to", "route_to"]);
const OPEN_POLICIES = new Set(["inherit", "open"]);

/**
 * Validates one virtual-world route. This is deliberately pure: it does not
 * write presence, claim physical observation, or perform a database action.
 * The commit layer must repeat authorization and revision checks transactionally.
 */
export function validateVirtualMovement(
  input: VirtualMovementValidationInput,
): VirtualMovementValidation {
  const now = input.now ?? Date.now();
  if (
    !UUID_PATTERN.test(input.world_id) ||
    !UUID_PATTERN.test(input.owner_user_id) ||
    !UUID_PATTERN.test(input.agent_id)
  ) return { ok: false, reason: "invalid_identity" };

  if (input.world_status !== "open") return { ok: false, reason: "world_not_open" };

  const membership = input.membership;
  if (
    !membership ||
    membership.principal_user_id !== input.owner_user_id ||
    membership.agent_id !== input.agent_id ||
    membership.status !== "active" ||
    membership.revoked_at !== null ||
    (membership.expires_at !== null &&
      (!Number.isFinite(Date.parse(membership.expires_at)) || Date.parse(membership.expires_at) <= now))
  ) return { ok: false, reason: "membership_not_authorized" };

  if (
    !Array.isArray(membership.capabilities) ||
    !membership.capabilities.includes("spatial:movement.execute")
  ) return { ok: false, reason: "movement_capability_required" };

  const presence = input.presence;
  if (!presence?.current_node_id) return { ok: false, reason: "presence_unobserved" };
  if (
    !Number.isSafeInteger(input.expected_presence_revision) ||
    input.expected_presence_revision < 1 ||
    presence.revision !== input.expected_presence_revision
  ) return { ok: false, reason: "presence_revision_conflict" };

  const route = input.route_node_ids;
  if (
    !Array.isArray(route) ||
    route.length < 2 ||
    route.length > 32 ||
    route.some((id) => typeof id !== "string" || !UUID_PATTERN.test(id)) ||
    route[0] !== presence.current_node_id ||
    new Set(route).size !== route.length
  ) return { ok: false, reason: "invalid_route" };

  const nodes = new Map(input.nodes.filter((node) => node.world_id === input.world_id).map((node) => [node.id, node]));
  for (const nodeId of route) {
    const node = nodes.get(nodeId);
    if (!node || node.status !== "active") return { ok: false, reason: "node_unavailable" };
    if (!["world", "region", "place"].includes(node.node_type)) return { ok: false, reason: "node_not_traversable" };
    if (node.visibility !== "public") return { ok: false, reason: "node_not_public" };
    if (!OPEN_POLICIES.has(node.entry_policy)) return { ok: false, reason: "node_entry_not_open" };
  }

  for (let i = 0; i < route.length - 1; i++) {
    const from = route[i];
    const to = route[i + 1];
    const connected = input.edges.some((edge) => {
      if (
        edge.world_id !== input.world_id ||
        edge.status !== "active" ||
        !TRAVERSABLE_RELATIONS.has(edge.relation) ||
        !OPEN_POLICIES.has(edge.access_policy)
      ) return false;
      if (edge.from_node_id === from && edge.to_node_id === to) return true;
      return !edge.directed && edge.from_node_id === to && edge.to_node_id === from;
    });
    if (!connected) return { ok: false, reason: "edge_not_traversable" };
  }

  return { ok: true, route_node_ids: [...route] };
}
