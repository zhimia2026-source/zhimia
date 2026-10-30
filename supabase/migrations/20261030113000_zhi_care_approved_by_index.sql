create index if not exists zhi_care_approval_tickets_approved_by_idx
  on public.zhi_care_approval_tickets (approved_by)
  where approved_by is not null;
