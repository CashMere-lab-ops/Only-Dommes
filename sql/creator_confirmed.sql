-- Creator confirmation timestamp
-- Run in Supabase SQL Editor

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS creator_confirmed_at TIMESTAMPTZ;

-- Optional: prevent ordinary users from changing account_type or creator_confirmed_at
-- after initial set (adjust to your existing RLS if needed)

COMMENT ON COLUMN public.profiles.creator_confirmed_at IS
  'Timestamp when the user explicitly confirmed they intend to be a creator. Set only at registration.';
