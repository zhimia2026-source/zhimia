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
