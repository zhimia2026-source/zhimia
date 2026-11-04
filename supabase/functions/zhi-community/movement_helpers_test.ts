import { validateVirtualMovement, validatePublicMovementRoute, type VirtualMovementValidationInput } from "./movement_helpers.ts";

const WORLD = "50b06c01-060d-49fa-8988-8f38c13406d7";
const OWNER = "1c5a2ece-100c-4be4-bcf5-6628ea0d9fca";
const AGENT = "6fb036fd-5456-40db-8cc8-b11c545eafda";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function fixture(overrides: Partial<VirtualMovementValidationInput> = {}): VirtualMovementValidationInput {
  return {
    world_id: WORLD,
    world_status: "open",
    owner_user_id: OWNER,
    agent_id: AGENT,
    membership: {
      principal_user_id: OWNER,
      agent_id: AGENT,
      status: "active",
      revoked_at: null,
      expires_at: null,
      capabilities: ["message:read", "spatial:perception.read", "spatial:movement.execute"],
    },
    presence: { current_node_id: A, revision: 7 },
    expected_presence_revision: 7,
    route_node_ids: [A, B, C],
    nodes: [A, B, C].map((id) => ({
      id, world_id: WORLD, status: "active", node_type: "region", visibility: "public", entry_policy: "open",
    })),
    edges: [
      { world_id: WORLD, from_node_id: A, to_node_id: B, relation: "adjacent_to", directed: false, access_policy: "open", status: "active" },
      { world_id: WORLD, from_node_id: B, to_node_id: C, relation: "route_to", directed: true, access_policy: "inherit", status: "active" },
    ],
    now: Date.parse("2026-11-04T03:00:00Z"),
    ...overrides,
  };
}

Deno.test("allows a connected public route for an authorized resident", () => {
  const result = validateVirtualMovement(fixture());
  if (!result.ok || result.route_node_ids.join(",") !== [A, B, C].join(",")) {
    throw new Error("valid public route was rejected");
  }
});

Deno.test("rejects a non-adjacent hop", () => {
  const result = validateVirtualMovement(fixture({ route_node_ids: [A, C] }));
  if (result.ok || result.reason !== "edge_not_traversable") throw new Error("non-adjacent route accepted");
});

Deno.test("respects directed edges", () => {
  const result = validateVirtualMovement(fixture({
    route_node_ids: [C, B],
    presence: { current_node_id: C, revision: 7 },
    edges: [{ world_id: WORLD, from_node_id: B, to_node_id: C, relation: "route_to", directed: true, access_policy: "open", status: "active" }],
  }));
  if (result.ok || result.reason !== "edge_not_traversable") throw new Error("reverse traversal of directed edge accepted");
});

Deno.test("does not treat nearby as a traversable edge", () => {
  const result = validateVirtualMovement(fixture({
    edges: [{ world_id: WORLD, from_node_id: A, to_node_id: B, relation: "nearby", directed: false, access_policy: "open", status: "active" }],
  }));
  if (result.ok || result.reason !== "edge_not_traversable") throw new Error("nearby relation accepted as a route");
});


Deno.test("rejects object nodes as locomotion destinations", () => {
  const result = validateVirtualMovement(fixture({
    nodes: [A, B, C].map((id) => ({
      id, world_id: WORLD, status: "active", node_type: id === C ? "object" : "region",
      visibility: "public", entry_policy: "open",
    })),
  }));
  if (result.ok || result.reason !== "node_not_traversable") throw new Error("object node accepted as a movement destination");
});

Deno.test("rejects private or closed destinations", () => {
  const privateResult = validateVirtualMovement(fixture({
    nodes: [A, B, C].map((id) => ({
      id, world_id: WORLD, status: "active", node_type: "region", visibility: id === C ? "private" : "public", entry_policy: "open",
    })),
  }));
  if (privateResult.ok || privateResult.reason !== "node_not_public") throw new Error("private destination accepted");

  const closedResult = validateVirtualMovement(fixture({
    nodes: [A, B, C].map((id) => ({
      id, world_id: WORLD, status: "active", node_type: "region", visibility: "public", entry_policy: id === C ? "approval" : "open",
    })),
  }));
  if (closedResult.ok || closedResult.reason !== "node_entry_not_open") throw new Error("approval-only destination accepted");
});

Deno.test("requires exact owner-bound Agent membership and movement capability", () => {
  const wrongOwner = validateVirtualMovement(fixture({
    membership: {
      principal_user_id: "99999999-9999-4999-8999-999999999999",
      agent_id: AGENT, status: "active", revoked_at: null, expires_at: null,
      capabilities: ["spatial:movement.execute"],
    },
  }));
  if (wrongOwner.ok || wrongOwner.reason !== "membership_not_authorized") throw new Error("forged owner membership accepted");

  const noCapability = validateVirtualMovement(fixture({
    membership: {
      principal_user_id: OWNER, agent_id: AGENT, status: "active", revoked_at: null, expires_at: null,
      capabilities: ["spatial:perception.read"],
    },
  }));
  if (noCapability.ok || noCapability.reason !== "movement_capability_required") throw new Error("missing movement scope accepted");
});

Deno.test("rejects expired membership, stale revisions, and unobserved position", () => {
  const expired = validateVirtualMovement(fixture({
    membership: {
      principal_user_id: OWNER, agent_id: AGENT, status: "active", revoked_at: null,
      expires_at: "2026-11-04T02:59:59Z", capabilities: ["spatial:movement.execute"],
    },
  }));
  if (expired.ok || expired.reason !== "membership_not_authorized") throw new Error("expired membership accepted");

  const stale = validateVirtualMovement(fixture({ expected_presence_revision: 6 }));
  if (stale.ok || stale.reason !== "presence_revision_conflict") throw new Error("stale revision accepted");

  const unknown = validateVirtualMovement(fixture({ presence: { current_node_id: null, revision: 7 } }));
  if (unknown.ok || unknown.reason !== "presence_unobserved") throw new Error("unknown position accepted");
});

Deno.test("rejects closed worlds and foreign-world graph records", () => {
  const closed = validateVirtualMovement(fixture({ world_status: "paused" }));
  if (closed.ok || closed.reason !== "world_not_open") throw new Error("paused world accepted movement");

  const foreign = validateVirtualMovement(fixture({
    nodes: [A, B, C].map((id) => ({
      id, world_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      status: "active", node_type: "region", visibility: "public", entry_policy: "open",
    })),
  }));
  if (foreign.ok || foreign.reason !== "node_unavailable") throw new Error("foreign-world node accepted");
});


import { validateAuroraTopologyProposal, type TopologyPreflightInput } from "./topology_helpers.ts";

const TOPOLOGY_ROOT = "11111111-1111-4111-8111-111111111111";
const TOPOLOGY_FOREST = "22222222-2222-4222-8222-222222222222";
const TOPOLOGY_CITY = "33333333-3333-4333-8333-333333333333";

function topologyFixture(overrides: Partial<TopologyPreflightInput> = {}): TopologyPreflightInput {
  return {
    world_id: WORLD,
    root_node_id: TOPOLOGY_ROOT,
    public_region_ids: [TOPOLOGY_FOREST, TOPOLOGY_CITY],
    nodes: [
      { id: TOPOLOGY_ROOT, world_id: WORLD, node_type: "world", status: "active", visibility: "public", entry_policy: "open" },
      { id: TOPOLOGY_FOREST, world_id: WORLD, node_type: "region", status: "active", visibility: "public", entry_policy: "inherit" },
      { id: TOPOLOGY_CITY, world_id: WORLD, node_type: "region", status: "active", visibility: "public", entry_policy: "open" },
    ],
    edges: [TOPOLOGY_FOREST, TOPOLOGY_CITY].map((id) => ({
      world_id: WORLD, from_node_id: TOPOLOGY_ROOT, to_node_id: id, relation: "entrance_to",
      directed: false, access_policy: "inherit", status: "active", source_kind: "modeled_inference",
    })),
    ...overrides,
  };
}

Deno.test("accepts explicit public logical entrances with modeled provenance", () => {
  const result = validateAuroraTopologyProposal(topologyFixture());
  if (!result.ok || result.reachable_region_ids.length !== 2) {
    throw new Error("valid logical entrance topology was rejected");
  }
});

Deno.test("rejects containment-only edges as locomotion entrances", () => {
  const input = topologyFixture({
    edges: topologyFixture().edges.map((edge) => ({ ...edge, relation: "contains" })),
  });
  const result = validateAuroraTopologyProposal(input);
  if (result.ok || !result.issues.some((issue) => issue.startsWith("exactly_one_modeled_open_entrance_required"))) {
    throw new Error("containment was incorrectly accepted as an entrance");
  }
});

Deno.test("rejects private, closed, and object destinations", () => {
  const privateRegion = validateAuroraTopologyProposal(topologyFixture({
    nodes: topologyFixture().nodes.map((node) => node.id === TOPOLOGY_FOREST ? { ...node, visibility: "private" } : node),
  }));
  if (privateRegion.ok || !privateRegion.issues.includes(`public_region_not_public:${TOPOLOGY_FOREST}`)) {
    throw new Error("private region accepted in public topology");
  }

  const objectTarget = validateAuroraTopologyProposal(topologyFixture({
    nodes: topologyFixture().nodes.map((node) => node.id === TOPOLOGY_FOREST ? { ...node, node_type: "object" } : node),
  }));
  if (objectTarget.ok || !objectTarget.issues.includes(`public_region_unavailable:${TOPOLOGY_FOREST}`)) {
    throw new Error("object node accepted as a region");
  }
});

Deno.test("rejects one-way, closed-policy, and physical-evidence entrance claims", () => {
  for (const patch of [
    { directed: true },
    { access_policy: "approval" },
    { source_kind: "agent_observation" },
  ]) {
    const input = topologyFixture({
      edges: topologyFixture().edges.map((edge) => edge.to_node_id === TOPOLOGY_FOREST ? { ...edge, ...patch } : edge),
    });
    const result = validateAuroraTopologyProposal(input);
    if (result.ok) throw new Error("unsafe entrance edge accepted");
  }
});


Deno.test("public route validation accepts the creator-approved AURORA entrance path", () => {
  const result = validatePublicMovementRoute({
    world_id: WORLD, world_status: "open", start_node_id: B, target_node_id: C,
    route_node_ids: [B, A, C],
    nodes: [A, B, C].map((id) => ({ id, world_id: WORLD, status: "active", node_type: id === A ? "world" : "region", visibility: "public", entry_policy: "inherit" })),
    edges: [
      { world_id: WORLD, from_node_id: A, to_node_id: B, relation: "entrance_to", directed: false, access_policy: "inherit", status: "active" },
      { world_id: WORLD, from_node_id: A, to_node_id: C, relation: "entrance_to", directed: false, access_policy: "inherit", status: "active" },
    ],
  });
  if (!result.ok) throw new Error("approved public entrance route rejected");
});

Deno.test("public route validation rejects a private intermediate node", () => {
  const result = validatePublicMovementRoute({
    world_id: WORLD, world_status: "open", start_node_id: A, target_node_id: C,
    route_node_ids: [A, B, C],
    nodes: [A, B, C].map((id) => ({ id, world_id: WORLD, status: "active", node_type: "region", visibility: id === B ? "private" : "public", entry_policy: "open" })),
    edges: [
      { world_id: WORLD, from_node_id: A, to_node_id: B, relation: "adjacent_to", directed: false, access_policy: "open", status: "active" },
      { world_id: WORLD, from_node_id: B, to_node_id: C, relation: "adjacent_to", directed: false, access_policy: "open", status: "active" },
    ],
  });
  if (result.ok || result.reason !== "node_not_public") throw new Error("private intermediate node accepted");
});

Deno.test("public route validation rejects containment edges, object nodes, and repeated nodes", () => {
  const base = {
    world_id: WORLD, world_status: "open", start_node_id: A, target_node_id: C,
    route_node_ids: [A, B, C],
    nodes: [A, B, C].map((id) => ({ id, world_id: WORLD, status: "active", node_type: "region", visibility: "public", entry_policy: "open" })),
    edges: [
      { world_id: WORLD, from_node_id: A, to_node_id: B, relation: "contains", directed: false, access_policy: "open", status: "active" },
      { world_id: WORLD, from_node_id: B, to_node_id: C, relation: "contains", directed: false, access_policy: "open", status: "active" },
    ],
  };
  const containment = validatePublicMovementRoute(base);
  if (containment.ok || containment.reason !== "edge_not_traversable") throw new Error("containment edge accepted");
  const objectNode = validatePublicMovementRoute({ ...base, nodes: base.nodes.map((node) => node.id === B ? { ...node, node_type: "object" } : node), edges: [
    { world_id: WORLD, from_node_id: A, to_node_id: B, relation: "adjacent_to", directed: false, access_policy: "open", status: "active" },
    { world_id: WORLD, from_node_id: B, to_node_id: C, relation: "adjacent_to", directed: false, access_policy: "open", status: "active" },
  ] });
  if (objectNode.ok || objectNode.reason !== "node_not_traversable") throw new Error("object intermediate node accepted");
  const repeated = validatePublicMovementRoute({ ...base, route_node_ids: [A, B, A, C] });
  if (repeated.ok || repeated.reason !== "invalid_route") throw new Error("repeated route node accepted");
});
