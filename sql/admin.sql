-- World of Dommes — admin access
-- Run in Supabase → SQL Editor

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS profiles_is_admin_idx
  ON public.profiles (is_admin)
  WHERE is_admin = true;

-- Make yourself the first admin. Change the username, then run this line.
-- UPDATE public.profiles SET is_admin = true WHERE username = 'YOUR_USERNAME';

SELECT 'admin column ready' AS status;
