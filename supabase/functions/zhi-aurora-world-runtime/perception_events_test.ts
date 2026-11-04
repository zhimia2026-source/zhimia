import { buildUnifiedEnvironmentEvents } from "./perception_events.ts";

Deno.test("MIA peer perception merges ecosystem, public spatial and own runtime events",()=>{
 const events=buildUnifiedEnvironmentEvents(
  [{id:"eco",state_revision:5,event_kind:"rain_started",source_kind:"world_generated_model",
    occurred_at:"2026-11-04T03:00:00Z",payload:{rain:true},causal_chain:[{stage:"weather"}]}],
  [{id:"spatial",event_type:"environment_response",environment_revision:2,
    occurred_at:"2026-11-04T02:00:00Z",perception_delta:{humidity_delta:3},metadata:{source:"world_event"},
    from_node_id:null,to_node_id:null}],
  [{sequence:9,event_type:"rest",position:{x:1,y:2},payload:{duration:4},
    occurred_at:"2026-11-04T01:00:00Z"}],
  [{id:"federated-move",event_type:"location_changed",from_node_id:"root",to_node_id:"forest",
    occurred_at:"2026-11-04T03:30:00Z",perception_delta:{presence_revision:1,physical_observation:false},
    metadata:{source:"zhi_federated_movement_commit"}}]
 );
 if(events.length!==4 || events[0].stream_type!=="runtime" || events[1].stream_type!=="spatial" || events[2].stream_type!=="ecosystem" || events[3].stream_type!=="federated_spatial")
  throw new Error("MIA peer event timeline is not chronological");
 if((events[2].causal_chain as unknown[]).length!==1 || events[0].event_id!=="mia-runtime:9" || events[3].event_id!=="federated-move" || events[3].revision!==1)
  throw new Error("causal chain or runtime identity was not preserved");
});
