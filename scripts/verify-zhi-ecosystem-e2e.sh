#!/usr/bin/env bash
# Controlled online E2E for the ZHI living ecosystem engine.
# The service-role key is read only from the local environment and is never printed.
set -euo pipefail
set +x

: "${SUPABASE_SERVICE_ROLE_KEY:?Set SUPABASE_SERVICE_ROLE_KEY in your local shell first}"
SUPABASE_URL="${SUPABASE_URL:-https://lvxmygrgqtmzqgailmyl.supabase.co}"
WORLD_ID="${WORLD_ID:-50b06c01-060d-49fa-8988-8f38c13406d7}"
MAX_CATCHUP_CALLS="${MAX_CATCHUP_CALLS:-32}"
BASE="${SUPABASE_URL%/}"
FUNCTION_URL="$BASE/functions/v1/zhi-ecosystem-engine"
REST_URL="$BASE/rest/v1"

command -v curl >/dev/null || { echo "curl is required" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

auth_headers=(-H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY")
state_url="$REST_URL/zhi_ecosystem_states?world_id=eq.$WORLD_ID&select=world_id,revision,world_time,state"
events_url="$REST_URL/zhi_ecosystem_events?world_id=eq.$WORLD_ID&select=id,state_revision,event_kind,source_kind,occurred_at,causal_chain&order=created_at.asc"
snapshots_url="$REST_URL/zhi_ecosystem_snapshots?world_id=eq.$WORLD_ID&select=id,revision,world_time"

get_state() {
  curl --silent --show-error --fail-with-body "${auth_headers[@]}" "$state_url" | jq -e '.[0]'
}
get_events() {
  curl --silent --show-error --fail-with-body "${auth_headers[@]}" "$events_url"
}
get_snapshots() {
  curl --silent --show-error --fail-with-body "${auth_headers[@]}" "$snapshots_url"
}
invoke_engine() {
  local target="$1"
  curl --silent --show-error --fail-with-body --request POST \
    "${auth_headers[@]}" \
    -H 'Content-Type: application/json' \
    --data "$(jq -nc --arg world "$WORLD_ID" --arg target "$target" '{world_id:$world,target_time:$target,max_hours:168}')" \
    "$FUNCTION_URL"
}

initial="$(get_state)"
initial_revision="$(jq -r '.revision' <<<"$initial")"
initial_world_time="$(jq -r '.world_time' <<<"$initial")"
initial_events="$(get_events)"
initial_event_count="$(jq 'length' <<<"$initial_events")"
initial_snapshots="$(get_snapshots)"
initial_snapshot_count="$(jq 'length' <<<"$initial_snapshots")"

# Freeze one target timestamp for the whole catch-up and idempotency test.
# A small safety offset avoids client clock skew being interpreted as future time.
target_time="$(date -u -d '5 seconds ago' +'%Y-%m-%dT%H:%M:%SZ')"
if [[ "$(date -u -d "$target_time" +%s)" -le "$(date -u -d "$initial_world_time" +%s)" ]]; then
  echo "Refusing test: target_time is not later than the stored world_time." >&2
  exit 2
fi

echo "Starting controlled tick: world=$WORLD_ID revision=$initial_revision target=$target_time"
completed=false
for ((i=1; i<=MAX_CATCHUP_CALLS; i++)); do
  response="$(invoke_engine "$target_time")"
  jq -e '.ok == true' >/dev/null <<<"$response" || {
    echo "Engine returned a non-success response:" >&2
    jq '{error,detail,reason}' <<<"$response" >&2
    exit 1
  }
  state="$(get_state)"
  world_time="$(jq -r '.world_time' <<<"$state")"
  if [[ "$(date -u -d "$world_time" +%s)" -ge "$(date -u -d "$target_time" +%s)" ]]; then
    completed=true
    break
  fi
  echo "Catch-up step $i completed; continuing toward fixed target."
done
if [[ "$completed" != true ]]; then
  echo "Catch-up limit reached; rerun the script to continue toward the same target policy." >&2
  exit 1
fi

state="$(get_state)"
revision="$(jq -r '.revision' <<<"$state")"
world_time="$(jq -r '.world_time' <<<"$state")"
events="$(get_events)"
snapshots="$(get_snapshots)"
event_count="$(jq 'length' <<<"$events")"
snapshot_count="$(jq 'length' <<<"$snapshots")"

jq -e '
  .state.engine_version == "0.3.1" and
  .state.engine.version == "0.3.1" and
  .state.simulation_status == "active_model" and
  .state.soil.status == "active_model" and
  .state.hydrology.status == "active_model" and
  .state.flora.status == "active_model" and
  .state.climate.weather.source == "world_generated_model" and
  ((.state.objects // {}) | length > 0) and
  ((.state.objects // {}) | to_entries | all(.value.lifecycle_status == "tracked_model"))
' >/dev/null <<<"$state" || {
  echo "Post-tick state invariants failed." >&2
  jq '{revision,world_time,state:{engine_version:.state.engine_version,engine:.state.engine,simulation_status:.state.simulation_status,soil:.state.soil,hydrology:.state.hydrology,flora:.state.flora,climate:.state.climate,objects:.state.objects}}' <<<"$state" >&2
  exit 1
}

if (( revision <= initial_revision )); then
  echo "Revision did not advance." >&2
  exit 1
fi
if (( event_count <= initial_event_count )); then
  echo "No ecosystem events were persisted." >&2
  exit 1
fi

# Ensure every event written by this run has a legal source and a causal chain.
jq -e --argjson rev "$initial_revision" '
  [.[] | select(.state_revision > $rev)] as $new |
  ($new | length > 0) and
  all($new[]; (.source_kind == "natural_process" or
               .source_kind == "environmental_event" or
               .source_kind == "scheduled_event" or
               .source_kind == "agent_action" or
               .source_kind == "system" or
               .source_kind == "material_process" or
               .source_kind == "biogeochemical_process" or
               .source_kind == "life_cycle_process") and
               (.causal_chain | type == "array" and length > 0)) and
  any($new[]; .event_kind == "ecosystem_tick_advanced")
' >/dev/null <<<"$events" || {
  echo "New event source/causal-chain invariants failed." >&2
  exit 1
}

# Same target must be a no-op after the world has reached that target.
retry_response="$(invoke_engine "$target_time")"
jq -e '.ok == true and .advanced == false and .reason == "world_clock_already_at_or_after_target"' >/dev/null <<<"$retry_response" || {
  echo "Same-target retry was not an idempotent no-op:" >&2
  jq . <<<"$retry_response" >&2
  exit 1
}
retry_state="$(get_state)"
retry_events="$(get_events)"
retry_snapshots="$(get_snapshots)"
retry_revision="$(jq -r '.revision' <<<"$retry_state")"
retry_event_count="$(jq 'length' <<<"$retry_events")"
retry_snapshot_count="$(jq 'length' <<<"$retry_snapshots")"
[[ "$retry_revision" == "$revision" ]] || { echo "Revision changed on retry." >&2; exit 1; }
[[ "$retry_event_count" == "$event_count" ]] || { echo "Events changed on retry." >&2; exit 1; }
[[ "$retry_snapshot_count" == "$snapshot_count" ]] || { echo "Snapshots changed on retry." >&2; exit 1; }

jq -n \
  --arg world_id "$WORLD_ID" \
  --arg target_time "$target_time" \
  --arg initial_world_time "$initial_world_time" \
  --arg final_world_time "$world_time" \
  --argjson initial_revision "$initial_revision" \
  --argjson final_revision "$revision" \
  --argjson initial_event_count "$initial_event_count" \
  --argjson final_event_count "$event_count" \
  --argjson initial_snapshot_count "$initial_snapshot_count" \
  --argjson final_snapshot_count "$snapshot_count" \
  '{ok:true,world_id:$world_id,target_time:$target_time,initial_world_time:$initial_world_time,final_world_time:$final_world_time,initial_revision:$initial_revision,final_revision:$final_revision,initial_event_count:$initial_event_count,final_event_count:$final_event_count,initial_snapshot_count:$initial_snapshot_count,final_snapshot_count:$final_snapshot_count,idempotent_retry:true}'
