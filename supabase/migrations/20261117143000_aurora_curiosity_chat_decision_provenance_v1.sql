alter table public.zhi_observatory_interest_cues
  add column if not exists decision_source text,
  add column if not exists decision_turn_id uuid references public.zhi_agent_chat_turns(id) on delete set null;

alter table public.zhi_observatory_interest_cues
  drop constraint if exists zhi_observatory_interest_cues_decision_source_check;
alter table public.zhi_observatory_interest_cues
  add constraint zhi_observatory_interest_cues_decision_source_check
  check (decision_source is null or decision_source in ('resident_api_action','resident_chat_output'));
