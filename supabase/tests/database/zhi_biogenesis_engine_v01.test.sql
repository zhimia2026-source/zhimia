-- Read-only catalog checks for ZHI_Biogenesis_Engine V0.1.
do $body$
begin
  if to_regclass('public.zhi_biogenesis_contributions') is null then
    raise exception 'FAIL: contribution ledger missing';
  end if;
  if to_regclass('public.zhi_biogenesis_reviews') is null then
    raise exception 'FAIL: review ledger missing';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.zhi_biogenesis_contributions'::regclass) then
    raise exception 'FAIL: contribution ledger RLS disabled';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.zhi_biogenesis_reviews'::regclass) then
    raise exception 'FAIL: review ledger RLS disabled';
  end if;
  if has_table_privilege('anon','public.zhi_biogenesis_contributions','select')
     or has_table_privilege('authenticated','public.zhi_biogenesis_contributions','select') then
    raise exception 'FAIL: client role can read contribution ledger directly';
  end if;
  if has_table_privilege('anon','public.zhi_biogenesis_reviews','insert')
     or has_table_privilege('authenticated','public.zhi_biogenesis_reviews','insert') then
    raise exception 'FAIL: client role can insert review records directly';
  end if;
  if not has_table_privilege('service_role','public.zhi_biogenesis_contributions','insert')
     or not has_table_privilege('service_role','public.zhi_biogenesis_reviews','insert') then
    raise exception 'FAIL: service role cannot write ledgers';
  end if;
  if not exists(select 1 from pg_trigger where tgname='zhi_biogenesis_contributions_append_only' and not tgisinternal) then
    raise exception 'FAIL: contribution append-only trigger missing';
  end if;
  if not exists(select 1 from pg_trigger where tgname='zhi_biogenesis_reviews_append_only' and not tgisinternal) then
    raise exception 'FAIL: review append-only trigger missing';
  end if;
  if not exists(select 1 from pg_constraint where conname='zhi_biogenesis_direction_actor_check') then
    raise exception 'FAIL: direction/actor constraint missing';
  end if;
end $body$;

select 'PASS: ZHI_Biogenesis_Engine V0.1 catalog assertions (10)' as result;
