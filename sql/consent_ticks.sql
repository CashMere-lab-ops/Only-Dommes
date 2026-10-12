alter table profiles
  add column if not exists age_confirmed_at timestamptz,
  add column if not exists terms_accepted_at timestamptz;
