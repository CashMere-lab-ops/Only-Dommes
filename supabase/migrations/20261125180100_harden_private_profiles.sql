-- Re-declare the setup routine with schema-qualified auth.uid().
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

-- Replace the Auth trigger so new accounts always begin as an incomplete
-- Fan profile. The app then calls complete_profile_setup() after authentication.
-- raw_user_meta_data is user-editable and is used only for display inputs.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_meta jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_username text;
BEGIN
  v_username := lower(COALESCE(
    NULLIF(btrim(v_meta ->> 'username'), ''),
    NULLIF(split_part(COALESCE(NEW.email, ''), '@', 1), ''),
    'user_' || substr(NEW.id::text, 1, 8)
  ));
  v_username := regexp_replace(v_username, '[^a-z0-9_]', '', 'g');
  IF length(v_username) < 3 THEN
    v_username := 'user_' || substr(NEW.id::text, 1, 8);
  END IF;

  INSERT INTO public.profiles (
    id, username, display_name, account_type, account_type_selected_at
  )
  VALUES (
    NEW.id,
    v_username,
    COALESCE(NULLIF(btrim(v_meta ->> 'display_name'), ''), v_username),
    'sub',
    NULL
  );

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- Batch 1B: close direct access to protected profile records.
-- Apply only after the application has moved public lookups to public_profiles
-- and signup/setup no longer performs direct profile upserts.

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

-- Self-service pages can read their own full row; other users can only read
-- the allowlisted public_profiles surface.
GRANT SELECT ON TABLE public.profiles TO authenticated;

-- Only ordinary profile/preferences fields are directly editable by the owner.
-- Account type, confirmation timestamps, admin flags, balances and payment
-- identifiers stay server-controlled.
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

NOTIFY pgrst, 'reload schema';
