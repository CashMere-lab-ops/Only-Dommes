-- Harden profile setup and atomically complete AgeGO verification.
-- Profile setup only updates the caller's own profile, so it should run with caller privileges/RLS.
alter function public.complete_profile_setup(text, text, boolean, boolean, boolean) security invoker;

create or replace function public.complete_agego_verification(
  p_attempt_id uuid,
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_attempt public.agego_verification_attempts%rowtype;
begin
  if coalesce(pg_catalog.current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  select *
    into v_attempt
    from public.agego_verification_attempts
   where id = p_attempt_id
     and user_id = p_user_id
     and status = 'pending'
     and expires_at > pg_catalog.now()
   for update;

  if not found then
    return false;
  end if;

  update public.profiles
     set age_verified_at = pg_catalog.now()
   where id = p_user_id;

  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  update public.agego_verification_attempts
     set status = 'verified',
         completed_at = pg_catalog.now(),
         failure_code = null
   where id = p_attempt_id;

  return true;
end;
$function$;

revoke all on function public.complete_agego_verification(uuid, uuid) from public, anon, authenticated;
grant execute on function public.complete_agego_verification(uuid, uuid) to service_role;
