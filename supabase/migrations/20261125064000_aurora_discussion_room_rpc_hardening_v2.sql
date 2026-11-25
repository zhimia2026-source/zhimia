-- Remove the superseded six-argument non-idempotent room-creation RPC.
drop function if exists public.create_discussion_room(uuid,uuid,uuid,text,text,text);
