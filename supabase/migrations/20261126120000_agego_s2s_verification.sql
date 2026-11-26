-- AgeGO S2S verification: pending attempts are private and only server-role code may access them.
alter table public.profiles
  add column if not exists age_verified_at timestamptz;

create table if not exists public.agego_verification_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nonce_hash text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'verified', 'failed', 'expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  failure_code text,
  agego_site text not null
);

create index if not exists agego_verification_attempts_user_created_idx
  on public.agego_verification_attempts (user_id, created_at desc);

alter table public.agego_verification_attempts enable row level security;
revoke all on public.agego_verification_attempts from anon, authenticated, public;
grant all on public.agego_verification_attempts to service_role;

comment on column public.profiles.age_verified_at is
  'Set only by trusted server-side AgeGO S2S verification after signature and token validation.';
comment on table public.agego_verification_attempts is
  'Private server-only AgeGO S2S attempts; nonce values are stored as SHA-256 hashes.';
