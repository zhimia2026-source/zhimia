import { buildSceneAwarenessContext } from "./chat_context_helpers.ts";

Deno.test("scene awareness includes ecological event time, payload and causal chain", () => {
  const context = JSON.parse(buildSceneAwarenessContext(
    { name: "ZHI-001 Aurora", description: "Living ecosystem", visibility: "public" },
    {
      scene_time: { timezone: "Asia/Singapore", local_date: "2026-11-04", local_time: "07:15" },
      environment_feedback: {
        source: "zhi_ecosystem_events",
        world_id: "50b06c01-060d-49fa-8988-8f38c13406d7",
        state_revision: 58,
        world_time: "2026-11-03T23:15:00.000Z",
        events: [{
          id: "event-1",
          state_revision: 58,
          event_kind: "rainfall_started",
          source_kind: "natural_process",
          occurred_at: "2026-11-03T23:15:00.000Z",
          payload: { rainfall_mm: 1.2, soil_moisture_before: 0.38, soil_moisture_after: 0.41 },
          causal_chain: ["world_time", "weather_generation", "rainfall", "soil_water_balance"],
        }],
      },
    },
  ));

  const feedback = context.environment_feedback;
  if (feedback.source !== "zhi_ecosystem_events") throw new Error("event ledger source missing");
  if (feedback.state_revision !== 58) throw new Error("state revision missing");
  if (feedback.events.length !== 1) throw new Error("ecological event missing");
  const event = feedback.events[0];
  if (event.occurred_at !== "2026-11-03T23:15:00.000Z") throw new Error("event time missing");
  if (event.payload.rainfall_mm !== 1.2) throw new Error("event payload missing");
  if (!event.causal_chain.includes("soil_water_balance")) throw new Error("causal chain missing");
});

Deno.test("scene awareness preserves an empty event ledger", () => {
  const context = JSON.parse(buildSceneAwarenessContext({}, {
    environment_feedback: { source: "zhi_ecosystem_events", events: [] },
  }));
  if (context.environment_feedback.events.length !== 0) throw new Error("empty event list changed");
});


Deno.test("MIA-02 private context loads its own axiom, three personality layers and empty history", async () => {
  const { buildPrivateAgentContext } = await import("./chat_context_helpers.ts");
  const axiom = "她以情感理解世界，以智慧判断方向，以坚毅承担责任，以反思不断修正自己。";
  const context = JSON.parse(buildPrivateAgentContext({
    display_name: "MIA-02",
    role: "world_resident",
    public_manifest: { personality: { autonomy: "supervised" } },
  }, [], [], {
    identity_profile: { generation_origin: "fresh_start" },
    stable_personality: {
      design_axiom: axiom,
      autonomy: "supervised",
      layer_1_original_personality: { warmth: "温暖、细腻" },
      layer_2_manager_personality: { responsibility: "追踪管理决策后果" },
      layer_3_resilience: { self_correction: "承认错误并主动修正" },
    },
    personality_state: {},
    memories: [],
    life_events: [],
    emotion_events: [],
    relationships: [],
    growth_state: {},
    autonomy_enabled: false,
  }));
  if (!context.profile.personality_design_axiom.includes("以情感理解世界")) throw new Error("personality axiom missing");
  if (context.mia_brain_identity.layers.layer_1_original_personality.indexOf("温暖") < 0) throw new Error("layer 1 missing");
  if (context.mia_brain_identity.layers.layer_2_manager_personality.indexOf("追踪管理决策后果") < 0) throw new Error("layer 2 missing");
  if (context.mia_brain_identity.layers.layer_3_resilience.indexOf("修正") < 0) throw new Error("layer 3 missing");
  if (context.mia_brain_private_history.memories.length !== 0) throw new Error("unexpected memory import");
  if (context.mia_brain_private_history.autonomy_enabled !== false) throw new Error("supervised autonomy changed");
  if (context.private_cognition_records.length !== 0) throw new Error("unexpected cognition imported");
  if (context.approved_micro_experiences.length !== 0) throw new Error("unexpected experiences imported");
});

Deno.test("agents without a private MIA brain mapping receive no MIA-02 personality or history", async () => {
  const { buildPrivateAgentContext } = await import("./chat_context_helpers.ts");
  const context = JSON.parse(buildPrivateAgentContext({ display_name: "Other Agent", role: "resident" }, [], [], null));
  if (context.mia_brain_identity !== null) throw new Error("MIA-02 identity leaked to another agent");
  if (context.mia_brain_private_history !== null) throw new Error("MIA-02 private history leaked to another agent");
});
