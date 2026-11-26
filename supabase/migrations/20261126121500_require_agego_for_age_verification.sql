-- Remove client-supplied age checkbox as a source of verified age.
-- Age confirmation is granted only by the trusted AgeGO callback route.
create or replace function public.complete_profile_setup(
  p_username text,
  p_account_type text,
  p_age_confirmed boolean,
  p_terms_accepted boolean,
  p_creator_confirmed boolean default false
)
returns void
language plpgsql
security definer
set search_path to 'pg_catalog'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_username text;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- p_age_confirmed remains in the signature for compatibility but is never
  -- treated as proof of age. The AgeGO S2S callback sets age_verified_at.
  if p_terms_accepted is not true then
    raise exception 'Terms confirmation is required' using errcode = '22023';
  end if;

  if p_account_type is null or p_account_type not in ('sub', 'creator') then
    raise exception 'Invalid account type' using errcode = '22023';
  end if;

  if p_account_type = 'creator' and p_creator_confirmed is not true then
    raise exception 'Creator confirmation is required' using errcode = '22023';
  end if;

  v_username := lower(regexp_replace(btrim(coalesce(p_username, '')), '[^a-z0-9_]', '', 'g'));
  if length(v_username) < 3 or length(v_username) > 24 then
    raise exception 'Username must be between 3 and 24 characters' using errcode = '22023';
  end if;

  update public.profiles
  set
    username = v_username,
    display_name = v_username,
    account_type = p_account_type,
    age_confirmed_at = null,
    terms_accepted_at = pg_catalog.now(),
    creator_confirmed_at = case
      when p_account_type = 'creator' and p_creator_confirmed is true
        then pg_catalog.now()
      else null
    end,
    account_type_selected_at = pg_catalog.now()
  where id = v_user_id
    and account_type_selected_at is null;

  if not found then
    raise exception 'Profile setup is already complete' using errcode = '42501';
  end if;
end;
$function$;

revoke all on function public.complete_profile_setup(text, text, boolean, boolean, boolean) from public, anon;
grant execute on function public.complete_profile_setup(text, text, boolean, boolean, boolean) to authenticated;
