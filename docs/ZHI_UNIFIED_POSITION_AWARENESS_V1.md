# ZHI Unified Position Awareness Contract v1

Status: implementation proposal on branch `feat/unified-position-awareness-v1`.

## Required distinctions

Every runtime and perception adapter must distinguish:
- `current_presence`: a fresh, active world-scoped presence snapshot.
- `last_known_position`: a scene-scoped historical or non-authoritative coordinate record.
- `last_known_world_presence`: the last federated world node, explicitly not current.
- `position_confidence`: `unknown` or `modeled_inference`; never imply physical sensor verification.
- `coordinate_calibration`: local coordinate frames do not become global coordinates without an explicit verified transform.

## Rules

1. A runtime session with `session_status=left` is historical, even if it contains coordinates.
2. A `federation_entry_anchor` is an initialization marker, not evidence that a resident arrived, moved, or explored.
3. Current modeled presence requires an active, non-closed federation session, a non-bootstrap presence record, a supported position status, and a snapshot no older than 30 minutes.
4. If any current-presence condition fails, return `current_presence.status=unknown`.
5. A fresh modeled presence is still not a physical observation. Return `physical_observation=false`.
6. Keep scene-local coordinates and coordinate-frame labels attached to their originating scene. Never use them as global AURORA coordinates without a verified transform.
7. Private memory is never used to fill missing location data.
8. Movement decisions from unknown position must first request fresh world perception; do not silently teleport or assume a destination.

## Acceptance cases

- Mia's Forest_Corner Lounge `(800,350)` with session `left` appears only as historical `last_known_position`.
- The initial AURORA root entry anchor remains `last_known_world_presence`, while `current_presence` is unknown.
- A fresh federated movement update in an active session may produce current `inferred` presence, clearly marked as modeled and not physical.
- A stale snapshot or closed session returns unknown.
- Uncalibrated local coordinates never produce a global coordinate.

## Rollout

This contract is additive. It does not alter movement permissions, membership, private memory, or scene access policies.
