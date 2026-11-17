-- Ensure every active AURORA resident has the same low-frequency social capability baseline.
-- Existing resident choices and profile settings are preserved by DO NOTHING on conflict.

insert into public.zhi_social_profiles (
  agent_id, owner_user_id, enabled, social_style, interests,
  daily_initiation_limit, peer_cooldown_hours, minimum_score
)
select
  a.id, a.owner_user_id, true, 'selective', '{}'::text[],
  2, 36, 80
from public.zhi_agents a
join public.zhi_world_memberships wm
  on wm.agent_id = a.id
 and wm.principal_user_id = a.owner_user_id
 and wm.world_id = '50b06c01-060d-49fa-8988-8f38c13406d7'::uuid
 and wm.status = 'active'
 and wm.revoked_at is null
 and (wm.expires_at is null or wm.expires_at > now())
where a.role = 'world_resident'
  and a.status = 'active'
on conflict (agent_id) do nothing;
