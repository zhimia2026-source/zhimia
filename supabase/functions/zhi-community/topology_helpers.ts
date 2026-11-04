export type TopologyNode = {
  id: string;
  world_id: string;
  node_type: string;
  status: string;
  visibility: string;
  entry_policy: string;
};

export type TopologyEntranceEdge = {
  world_id: string;
  from_node_id: string;
  to_node_id: string;
  relation: string;
  directed: boolean;
  access_policy: string;
  status: string;
  source_kind: string;
};

export type TopologyPreflightInput = {
  world_id: string;
  root_node_id: string;
  public_region_ids: string[];
  nodes: TopologyNode[];
  edges: TopologyEntranceEdge[];
};

export type TopologyPreflightResult =
  | { ok: true; root_node_id: string; reachable_region_ids: string[] }
  | { ok: false; issues: string[] };

const OPEN_TOPOLOGY_POLICIES = new Set(["inherit", "open"]);

/**
 * Audits a proposed logical world-entry topology without writing to a database.
 * Entrance edges are modeled navigation relationships, never physical evidence.
 * Only creator-selected public regions may be included in public_region_ids.
 */
export function validateAuroraTopologyProposal(
  input: TopologyPreflightInput,
): TopologyPreflightResult {
  const issues: string[] = [];
  if (!input.world_id || !input.root_node_id) {
    return { ok: false, issues: ["world_and_root_required"] };
  }
  if (!Array.isArray(input.public_region_ids) || input.public_region_ids.length === 0) {
    return { ok: false, issues: ["public_region_list_required"] };
  }
  if (new Set(input.public_region_ids).size !== input.public_region_ids.length) {
    issues.push("duplicate_public_region_id");
  }

  const worldNodes = input.nodes.filter((node) => node.world_id === input.world_id);
  const root = worldNodes.find((node) => node.id === input.root_node_id);
  if (!root || root.status !== "active" || root.node_type !== "world") {
    issues.push("active_world_root_required");
  } else {
    if (root.visibility !== "public") issues.push("world_root_not_public");
    if (!OPEN_TOPOLOGY_POLICIES.has(root.entry_policy)) issues.push("world_root_not_open");
  }

  const byId = new Map(worldNodes.map((node) => [node.id, node]));
  for (const regionId of input.public_region_ids) {
    const region = byId.get(regionId);
    if (!region || region.status !== "active" || region.node_type !== "region") {
      issues.push(`public_region_unavailable:${regionId}`);
      continue;
    }
    if (region.visibility !== "public") {
      issues.push(`public_region_not_public:${regionId}`);
      continue;
    }
    if (!OPEN_TOPOLOGY_POLICIES.has(region.entry_policy)) {
      issues.push(`public_region_not_open:${regionId}`);
      continue;
    }
    const entrances = input.edges.filter((edge) =>
      edge.world_id === input.world_id &&
      edge.status === "active" &&
      edge.from_node_id === input.root_node_id &&
      edge.to_node_id === regionId &&
      edge.relation === "entrance_to"
    );
    if (
      entrances.length !== 1 ||
      entrances[0].directed !== false ||
      !OPEN_TOPOLOGY_POLICIES.has(entrances[0].access_policy) ||
      entrances[0].source_kind !== "modeled_inference"
    ) {
      issues.push(`exactly_one_modeled_open_entrance_required:${regionId}`);
    }
  }

  if (issues.length) return { ok: false, issues };
  return {
    ok: true,
    root_node_id: input.root_node_id,
    reachable_region_ids: [...input.public_region_ids],
  };
}
