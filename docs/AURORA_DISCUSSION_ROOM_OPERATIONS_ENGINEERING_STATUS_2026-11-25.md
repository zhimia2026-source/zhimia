# AURORA Discussion Room Operations — Engineering Status

Date: 2026-11-25
Branch: feat/aurora-genesis-observer-discussion-rooms
PR: https://github.com/zhimia2026-source/zhimia/pull/116

## Confirmed production state
- Schema foundation migration `aurora_resident_discussion_rooms_foundation_v1` is deployed and verified.
- Room metadata columns and multi-room discovery index are present.
- Dedicated RLS-protected `zhi_world_conversation_invitations` table is present.
- Existing `zhi-community` Edge Function remains v291 ACTIVE.

## Work prepared but not deployed
- SQL migration `20261125063000_aurora_discussion_room_atomic_operations_v1.sql` defines server-only SECURITY DEFINER operations for create, invite, accept/decline, leave, and close.
- The migration was corrected after schema inspection to use the actual text[] membership capability type and valid PL/pgSQL DECLARE blocks.
- Applying the migration through the available migration runner still fails with a parser error around the PL/pgSQL function body. No functions from this migration were installed. Do not claim the resident room operations are available yet.
- No Edge Function routes, native resident tools, Genesis Observer API/UI, or resident E2E have been deployed in this phase.

## Safety and rollout boundary
- Do not work around the migration runner by executing arbitrary DDL through a generic SQL query tool.
- Resolve the migration execution path or split into supported migrations before proceeding.
- Then add authenticated routes and native tools, with token-owner-agent binding, active AURORA membership, exact invitee checks, explicit accept/decline, member-only room access, idempotent room messages, and observer read-only public scope.
- No scheduled model calls, timers, fabricated resident actions, or production test messages.
