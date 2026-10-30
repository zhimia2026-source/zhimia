alter table public.zhi_care_events
  drop constraint if exists zhi_care_events_event_type_check;

alter table public.zhi_care_events
  add constraint zhi_care_events_event_type_check check (
    event_type = any (array[
      'created','evidence_added','state_transition','action_proposed','action_approved',
      'action_rejected','feedback_recorded','conflict_detected','paused','terminated',
      'approval_requested','approval_granted','approval_expired','approval_invalidated'
    ]::text[])
  );
