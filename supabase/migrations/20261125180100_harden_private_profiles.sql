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
