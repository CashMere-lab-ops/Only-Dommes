-- Batch 1: protect private profiles and expose a safe public profile copy.
-- This migration is intentionally additive: public profile reads move to
-- public_profiles while private profile reads remain available to the owner.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_type_selected_at timestamptz;

-- Existing accounts already have an account type recorded. Mark those as
-- completed so the new first-time setup flow does not interrupt existing users.
UPDATE public.profiles
SET account_type_selected_at = COALESCE(account_type_selected_at, created_at, now())
WHERE account_type_selected_at IS NULL;

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
  'Public-facing profile fields only. Private profile, identity, payment, admin and wallet fields remain in public.profiles.';

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

-- Keep the public copy synchronised without allowing browser clients to write to it.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.sync_public_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
BEGIN
  INSERT INTO public.public_profiles (
    id,
    username,
    display_name,
    bio,
    avatar_url,
    banner_url,
    account_type,
    is_live,
    created_at,
    x_username,
    message_privacy,
    subscription_price,
    subscriptions_enabled,
    message_price,
    last_seen_at,
    voice_calls_enabled,
    voice_rate_per_minute,
    voice_min_minutes,
    voice_dnd_enabled,
    voice_dnd_start,
    voice_dnd_end,
    voice_max_minutes,
    voice_away,
    video_calls_enabled,
    video_rate_per_minute,
    video_min_minutes,
    live_private_enabled,
    live_private_rate_per_minute,
    live_private_min_minutes,
    min_tip_gbp,
    live_gifts_enabled,
    live_gifts
  )
  VALUES (
    NEW.id,
    NEW.username,
    NEW.display_name,
    NEW.bio,
    NEW.avatar_url,
    NEW.banner_url,
    NEW.account_type,
    NEW.is_live,
    NEW.created_at,
    NEW.x_username,
    NEW.message_privacy,
    NEW.subscription_price,
    NEW.subscriptions_enabled,
    NEW.message_price,
    NEW.last_seen_at,
    NEW.voice_calls_enabled,
    NEW.voice_rate_per_minute,
    NEW.voice_min_minutes,
    NEW.voice_dnd_enabled,
    NEW.voice_dnd_start,
    NEW.voice_dnd_end,
    NEW.voice_max_minutes,
    NEW.voice_away,
    NEW.video_calls_enabled,
    NEW.video_rate_per_minute,
    NEW.video_min_minutes,
    NEW.live_private_enabled,
    NEW.live_private_rate_per_minute,
    NEW.live_private_min_minutes,
    NEW.min_tip_gbp,
    NEW.live_gifts_enabled,
    NEW.live_gifts
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

REVOKE ALL ON FUNCTION private.sync_public_profile() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_sync_public_profile ON public.profiles;
CREATE TRIGGER profiles_sync_public_profile
  AFTER INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_public_profile();

-- Backfill existing public profile cards.
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

-- Preserve PostgREST embeds for feed posts and comments, but point them at
-- the public-only table instead of the private profiles table.
ALTER TABLE public.posts
  ADD CONSTRAINT posts_creator_public_profile_fkey
  FOREIGN KEY (creator_id) REFERENCES public.public_profiles(id)
  ON DELETE CASCADE NOT VALID;
ALTER TABLE public.posts
  VALIDATE CONSTRAINT posts_creator_public_profile_fkey;

ALTER TABLE public.post_comments
  ADD CONSTRAINT post_comments_user_public_profile_fkey
  FOREIGN KEY (user_id) REFERENCES public.public_profiles(id)
  ON DELETE CASCADE NOT VALID;
ALTER TABLE public.post_comments
  VALIDATE CONSTRAINT post_comments_user_public_profile_fkey;

-- The client may read its own full profile, but anonymous visitors may not
-- query the private table at all.
DROP POLICY IF EXISTS "Anyone can view profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY profiles_select_own
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = id);

CREATE POLICY profiles_update_own
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);

REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;

-- Users may edit profile settings, but not account type, identity assertions,
-- admin flags, wallet balances, payment identifiers or system timestamps.
GRANT UPDATE (
  display_name,
  bio,
  avatar_url,
  banner_url,
  x_username,
  is_live,
  subscription_price,
  subscriptions_enabled,
  message_privacy,
  notification_prefs,
  last_seen_at,
  message_price,
  auto_reply_enabled,
  auto_reply_message,
  auto_reply_tip_enabled,
  auto_reply_tip_message,
  auto_reply_unlock_enabled,
  auto_reply_unlock_message,
  voice_calls_enabled,
  voice_rate_per_minute,
  voice_min_minutes,
  voice_dnd_enabled,
  voice_dnd_start,
  voice_dnd_end,
  voice_max_minutes,
  voice_away,
  currency_display,
  earnings_goal_gbp,
  live_private_enabled,
  live_private_rate_per_minute,
  live_private_min_minutes,
  min_tip_gbp,
  live_gifts_enabled,
  live_gifts,
  video_calls_enabled,
  video_rate_per_minute,
  video_min_minutes
) ON TABLE public.profiles TO authenticated;

-- Auth-created profile records are created by the trigger, not direct browser upserts.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_username text;
  v_account_type text;
  v_now timestamptz := pg_catalog.now();
  v_date_of_birth date;
BEGIN
  v_account_type := CASE
    WHEN v_meta ->> 'account_type' = 'creator' THEN 'creator'
    ELSE 'sub'
  END;

  v_username := lower(COALESCE(
    NULLIF(btrim(v_meta ->> 'username'), ''),
    NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    'user_' || substr(NEW.id::text, 1, 8)
  ));
  v_username := regexp_replace(v_username, '[^a-z0-9_]', '', 'g');
  IF length(v_username) < 3 THEN
    v_username := 'user_' || substr(NEW.id::text, 1, 8);
  END IF;

  IF COALESCE(v_meta ->> 'date_of_birth', '') ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN
    BEGIN
      v_date_of_birth := (v_meta ->> 'date_of_birth')::date;
    EXCEPTION WHEN OTHERS THEN
      v_date_of_birth := NULL;
    END;
  END IF;

  INSERT INTO public.profiles (
    id, username, display_name, account_type, date_of_birth,
    age_confirmed_at, terms_accepted_at, creator_confirmed_at,
    account_type_selected_at
  )
  VALUES (
    NEW.id,
    v_username,
    COALESCE(NULLIF(btrim(v_meta ->> 'display_name'), ''), v_username),
    v_account_type,
    v_date_of_birth,
    CASE WHEN v_meta ->> 'age_confirmed' = 'true' THEN v_now ELSE NULL END,
    CASE WHEN v_meta ->> 'terms_accepted' = 'true' THEN v_now ELSE NULL END,
    CASE
      WHEN v_account_type = 'creator' AND v_meta ->> 'creator_confirmed' = 'true'
        THEN v_now
      ELSE NULL
    END,
    CASE WHEN v_meta ->> 'account_type' IN ('sub', 'creator') THEN v_now ELSE NULL END
  );

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- One-time first-profile setup for OAuth accounts that do not yet have a
-- selected account type. The function only updates the authenticated user's
-- own incomplete profile and cannot be used to change an established type.
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

  IF p_account_type NOT IN ('sub', 'creator') THEN
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
