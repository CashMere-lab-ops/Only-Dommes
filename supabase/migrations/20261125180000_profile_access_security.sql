-- Batch 1A: introduce an allowlisted public profile surface and safe onboarding.
-- This migration is additive so the app can be deployed before private-profile
-- grants are tightened by the follow-up migration.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_type_selected_at timestamptz;

-- Existing accounts keep their current type; only new/OAuth-incomplete profiles
-- are left eligible for the one-time setup function.
UPDATE public.profiles
SET account_type_selected_at = COALESCE(account_type_selected_at, created_at, now())
WHERE account_type_selected_at IS NULL
  AND account_type IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.public_profiles (
  id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  username text NOT NULL,
  display_name text,
  bio text,
  avatar_url text,
  banner_url text,
  account_type text,
  is_live boolean,
  created_at timestamptz NOT NULL,
  x_username text,
  message_privacy text,
  subscription_price numeric,
  subscriptions_enabled boolean,
  message_price numeric,
  last_seen_at timestamptz,
  voice_calls_enabled boolean,
  voice_rate_per_minute numeric,
  voice_min_minutes integer,
  voice_dnd_enabled boolean,
  voice_dnd_start text,
  voice_dnd_end text,
  voice_max_minutes integer,
  voice_away boolean,
  video_calls_enabled boolean,
  video_rate_per_minute numeric,
  video_min_minutes integer,
  live_private_enabled boolean,
  live_private_rate_per_minute numeric,
  live_private_min_minutes integer,
  min_tip_gbp numeric,
  live_gifts_enabled boolean,
  live_gifts jsonb
);

COMMENT ON TABLE public.public_profiles IS
  'Public-facing profile fields only. Excludes identity, admin, payment, notification and wallet data.';

CREATE UNIQUE INDEX IF NOT EXISTS public_profiles_username_key
  ON public.public_profiles (username);

ALTER TABLE public.public_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS public_profiles_public_read ON public.public_profiles;
CREATE POLICY public_profiles_public_read
  ON public.public_profiles
  FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE ALL PRIVILEGES ON TABLE public.public_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.public_profiles TO anon, authenticated;

-- Synchronise the public-safe copy whenever a private profile is created or changed.
CREATE SCHEMA IF NOT EXISTS wod_private;
REVOKE ALL ON SCHEMA wod_private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION wod_private.sync_public_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  INSERT INTO public.public_profiles (
    id, username, display_name, bio, avatar_url, banner_url, account_type,
    is_live, created_at, x_username, message_privacy, subscription_price,
    subscriptions_enabled, message_price, last_seen_at, voice_calls_enabled,
    voice_rate_per_minute, voice_min_minutes, voice_dnd_enabled, voice_dnd_start,
    voice_dnd_end, voice_max_minutes, voice_away, video_calls_enabled,
    video_rate_per_minute, video_min_minutes, live_private_enabled,
    live_private_rate_per_minute, live_private_min_minutes, min_tip_gbp,
    live_gifts_enabled, live_gifts
  )
  VALUES (
    NEW.id, NEW.username, NEW.display_name, NEW.bio, NEW.avatar_url, NEW.banner_url,
    NEW.account_type, NEW.is_live, NEW.created_at, NEW.x_username, NEW.message_privacy,
    NEW.subscription_price, NEW.subscriptions_enabled, NEW.message_price, NEW.last_seen_at,
    NEW.voice_calls_enabled, NEW.voice_rate_per_minute, NEW.voice_min_minutes,
    NEW.voice_dnd_enabled, NEW.voice_dnd_start, NEW.voice_dnd_end, NEW.voice_max_minutes,
    NEW.voice_away, NEW.video_calls_enabled, NEW.video_rate_per_minute, NEW.video_min_minutes,
    NEW.live_private_enabled, NEW.live_private_rate_per_minute, NEW.live_private_min_minutes,
    NEW.min_tip_gbp, NEW.live_gifts_enabled, NEW.live_gifts
  )
  ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    display_name = EXCLUDED.display_name,
    bio = EXCLUDED.bio,
    avatar_url = EXCLUDED.avatar_url,
    banner_url = EXCLUDED.banner_url,
    account_type = EXCLUDED.account_type,
    is_live = EXCLUDED.is_live,
    created_at = EXCLUDED.created_at,
    x_username = EXCLUDED.x_username,
    message_privacy = EXCLUDED.message_privacy,
    subscription_price = EXCLUDED.subscription_price,
    subscriptions_enabled = EXCLUDED.subscriptions_enabled,
    message_price = EXCLUDED.message_price,
    last_seen_at = EXCLUDED.last_seen_at,
    voice_calls_enabled = EXCLUDED.voice_calls_enabled,
    voice_rate_per_minute = EXCLUDED.voice_rate_per_minute,
    voice_min_minutes = EXCLUDED.voice_min_minutes,
    voice_dnd_enabled = EXCLUDED.voice_dnd_enabled,
    voice_dnd_start = EXCLUDED.voice_dnd_start,
    voice_dnd_end = EXCLUDED.voice_dnd_end,
    voice_max_minutes = EXCLUDED.voice_max_minutes,
    voice_away = EXCLUDED.voice_away,
    video_calls_enabled = EXCLUDED.video_calls_enabled,
    video_rate_per_minute = EXCLUDED.video_rate_per_minute,
    video_min_minutes = EXCLUDED.video_min_minutes,
    live_private_enabled = EXCLUDED.live_private_enabled,
    live_private_rate_per_minute = EXCLUDED.live_private_rate_per_minute,
    live_private_min_minutes = EXCLUDED.live_private_min_minutes,
    min_tip_gbp = EXCLUDED.min_tip_gbp,
    live_gifts_enabled = EXCLUDED.live_gifts_enabled,
    live_gifts = EXCLUDED.live_gifts;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION wod_private.sync_public_profile() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_sync_public_profile ON public.profiles;
CREATE TRIGGER profiles_sync_public_profile
  AFTER INSERT OR UPDATE OF username, display_name, bio, avatar_url, banner_url, account_type, is_live, x_username, message_privacy, subscription_price, subscriptions_enabled, message_price, last_seen_at, voice_calls_enabled, voice_rate_per_minute, voice_min_minutes, voice_dnd_enabled, voice_dnd_start, voice_dnd_end, voice_max_minutes, voice_away, video_calls_enabled, video_rate_per_minute, video_min_minutes, live_private_enabled, live_private_rate_per_minute, live_private_min_minutes, min_tip_gbp, live_gifts_enabled, live_gifts ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION wod_private.sync_public_profile();

-- Backfill the public-safe profile surface.
INSERT INTO public.public_profiles (
  id, username, display_name, bio, avatar_url, banner_url, account_type,
  is_live, created_at, x_username, message_privacy, subscription_price,
  subscriptions_enabled, message_price, last_seen_at, voice_calls_enabled,
  voice_rate_per_minute, voice_min_minutes, voice_dnd_enabled, voice_dnd_start,
  voice_dnd_end, voice_max_minutes, voice_away, video_calls_enabled,
  video_rate_per_minute, video_min_minutes, live_private_enabled,
  live_private_rate_per_minute, live_private_min_minutes, min_tip_gbp,
  live_gifts_enabled, live_gifts
)
SELECT
  id, username, display_name, bio, avatar_url, banner_url, account_type,
  is_live, created_at, x_username, message_privacy, subscription_price,
  subscriptions_enabled, message_price, last_seen_at, voice_calls_enabled,
  voice_rate_per_minute, voice_min_minutes, voice_dnd_enabled, voice_dnd_start,
  voice_dnd_end, voice_max_minutes, voice_away, video_calls_enabled,
  video_rate_per_minute, video_min_minutes, live_private_enabled,
  live_private_rate_per_minute, live_private_min_minutes, min_tip_gbp,
  live_gifts_enabled, live_gifts
FROM public.profiles
ON CONFLICT (id) DO UPDATE SET
  username = EXCLUDED.username,
  display_name = EXCLUDED.display_name,
  bio = EXCLUDED.bio,
  avatar_url = EXCLUDED.avatar_url,
  banner_url = EXCLUDED.banner_url,
  account_type = EXCLUDED.account_type,
  is_live = EXCLUDED.is_live,
  created_at = EXCLUDED.created_at,
  x_username = EXCLUDED.x_username,
  message_privacy = EXCLUDED.message_privacy,
  subscription_price = EXCLUDED.subscription_price,
  subscriptions_enabled = EXCLUDED.subscriptions_enabled,
  message_price = EXCLUDED.message_price,
  last_seen_at = EXCLUDED.last_seen_at,
  voice_calls_enabled = EXCLUDED.voice_calls_enabled,
  voice_rate_per_minute = EXCLUDED.voice_rate_per_minute,
  voice_min_minutes = EXCLUDED.voice_min_minutes,
  voice_dnd_enabled = EXCLUDED.voice_dnd_enabled,
  voice_dnd_start = EXCLUDED.voice_dnd_start,
  voice_dnd_end = EXCLUDED.voice_dnd_end,
  voice_max_minutes = EXCLUDED.voice_max_minutes,
  voice_away = EXCLUDED.voice_away,
  video_calls_enabled = EXCLUDED.video_calls_enabled,
  video_rate_per_minute = EXCLUDED.video_rate_per_minute,
  video_min_minutes = EXCLUDED.video_min_minutes,
  live_private_enabled = EXCLUDED.live_private_enabled,
  live_private_rate_per_minute = EXCLUDED.live_private_rate_per_minute,
  live_private_min_minutes = EXCLUDED.live_private_min_minutes,
  min_tip_gbp = EXCLUDED.min_tip_gbp,
  live_gifts_enabled = EXCLUDED.live_gifts_enabled,
  live_gifts = EXCLUDED.live_gifts;

-- Feed and comment components enrich author data with explicit public_profiles
-- lookups, so we do not add duplicate foreign-key relationships here.

-- New Auth accounts default to Fan unless they explicitly chose a Creator
-- account. Confirmation timestamps are generated by the database, not browser time.
-- The existing Auth trigger is deliberately left unchanged in this additive migration.
-- This keeps the currently deployed signup flow working during rollout. The
-- secure default-Fan version is installed in the hardening migration after
-- the new app has been deployed.

-- OAuth accounts without an initial type can complete setup once.
CREATE OR REPLACE FUNCTION public.complete_profile_setup(
  p_username text,
  p_account_type text,
  p_age_confirmed boolean,
  p_terms_accepted boolean,
  p_creator_confirmed boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_username text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_age_confirmed IS NOT TRUE OR p_terms_accepted IS NOT TRUE THEN
    RAISE EXCEPTION 'Age and terms confirmation are required' USING ERRCODE = '22023';
  END IF;

  IF p_account_type IS NULL OR p_account_type NOT IN ('sub', 'creator') THEN
    RAISE EXCEPTION 'Invalid account type' USING ERRCODE = '22023';
  END IF;

  IF p_account_type = 'creator' AND p_creator_confirmed IS NOT TRUE THEN
    RAISE EXCEPTION 'Creator confirmation is required' USING ERRCODE = '22023';
  END IF;

  v_username := lower(regexp_replace(btrim(COALESCE(p_username, '')), '[^a-z0-9_]', '', 'g'));
  IF length(v_username) < 3 OR length(v_username) > 24 THEN
    RAISE EXCEPTION 'Username must be between 3 and 24 characters' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
  SET
    username = v_username,
    display_name = v_username,
    account_type = p_account_type,
    age_confirmed_at = pg_catalog.now(),
    terms_accepted_at = pg_catalog.now(),
    creator_confirmed_at = CASE
      WHEN p_account_type = 'creator' AND p_creator_confirmed IS TRUE
        THEN pg_catalog.now()
      ELSE NULL
    END,
    account_type_selected_at = pg_catalog.now()
  WHERE id = v_user_id
    AND account_type_selected_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile setup is already complete' USING ERRCODE = '42501';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_profile_setup(text, text, boolean, boolean, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_profile_setup(text, text, boolean, boolean, boolean)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
