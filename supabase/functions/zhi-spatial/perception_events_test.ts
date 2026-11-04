import { buildUnifiedEnvironmentEvents } from "./perception_events.ts";

Deno.test("unifies ecosystem and agent-scoped spatial events chronologically", () => {
  const events = buildUnifiedEnvironmentEvents([
    { id:"eco-2",state_revision:8,event_kind:"rain_started",source_kind:"world_generated_model",
      occurred_at:"2026-11-04T02:00:00Z",payload:{rain:true},causal_chain:[{stage:"weather_cycle"}] },
  ],[
    { id:"spatial-1",event_type:"location_changed",environment_revision:3,
      occurred_at:"2026-11-04T01:00:00Z",perception_delta:{movement_mode:"virtual"},
      metadata:{source:"modeled_virtual_movement",causal_chain:[{stage:"creator_approval"},{stage:"presence_commit"}]},
      from_node_id:"from",to_node_id:"to",affected_object_ids:[] },
  ]);
  if(events.length!==2 || events[0].stream_type!=="spatial" || events[1].stream_type!=="ecosystem")
    throw new Error("events were not unified in chronological order");
  if(events[0].causal_chain.length!==2 || (events[1].causal_chain[0] as {stage?:string}).stage!=="weather_cycle")
    throw new Error("causal chain was not preserved");
  if(events[1].revision!==8 || events[1].payload.rain!==true)
    throw new Error("ecosystem revision or payload was lost");
});

Deno.test("does not invent missing spatial causal chains or accept malformed timestamps", () => {
  const events = buildUnifiedEnvironmentEvents([],[
    { id:"valid",event_type:"entered_proximity",environment_revision:null,
      occurred_at:"2026-11-04T01:00:00Z",perception_delta:{},metadata:{},
      from_node_id:null,to_node_id:null,affected_object_ids:[] },
    { id:"invalid",event_type:"unknown",environment_revision:null,
      occurred_at:"not-a-time",perception_delta:{},metadata:{},
      from_node_id:null,to_node_id:null,affected_object_ids:[] },
  ]);
  if(events.length!==1 || events[0].causal_chain.length!==0)
    throw new Error("missing causal chain must remain empty and invalid time must be dropped");
});
