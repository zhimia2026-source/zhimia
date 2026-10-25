create table if not exists public.zhi_personal_access_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check (char_length(token_hash) = 64),
  label text not null default '个人令牌' check (char_length(label) between 1 and 100),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz
);
create index if not exists zhi_personal_access_tokens_user_id_idx on public.zhi_personal_access_tokens(user_id);
alter table public.zhi_personal_access_tokens enable row level security;
revoke all on public.zhi_personal_access_tokens from public, anon, authenticated;
grant select, insert, update, delete on table public.zhi_personal_access_tokens to service_role;
comment on table public.zhi_personal_access_tokens is 'Stores SHA-256 hashes of per-person bearer tokens only; raw tokens are shown once at issuance and never persisted.';
