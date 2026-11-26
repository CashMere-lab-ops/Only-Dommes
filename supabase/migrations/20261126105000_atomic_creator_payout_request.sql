-- Atomically reserve creator balance and create a weekly payout request.
create unique index if not exists payout_requests_creator_active_uidx
  on public.payout_requests (creator_id)
  where status in ('pending','processing');

create or replace function public.reserve_creator_payout(
  p_creator_id uuid,
  p_amount_pence integer,
  p_scheduled_for date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_balance numeric(12,2);
  v_amount numeric(12,2);
  v_fee numeric(12,2) := 0;
  v_net numeric(12,2);
  v_next numeric(12,2);
  v_amount_pence integer;
  v_payout public.payout_requests%rowtype;
begin
  if p_creator_id is null or p_scheduled_for is null then
    raise exception 'Creator and payout date are required';
  end if;
  if extract(isodow from p_scheduled_for) <> 1 then
    raise exception 'Payout date must be a Monday';
  end if;
  if p_amount_pence is not null and p_amount_pence < 10000 then
    raise exception 'Minimum payout is £100';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('payout-request:' || p_creator_id::text, 0)
  );

  select balance_gbp into v_balance
  from public.profiles
  where id = p_creator_id and account_type = 'creator'
  for update;

  if not found then
    raise exception 'Creator profile not found';
  end if;

  if exists (
    select 1 from public.payout_requests
    where creator_id = p_creator_id
      and status in ('pending','processing')
  ) then
    raise exception 'Payout already in progress';
  end if;

  if p_amount_pence is null then
    v_amount_pence := round(v_balance * 100)::integer;
  else
    v_amount_pence := p_amount_pence;
  end if;

  if v_amount_pence < 10000 then
    raise exception 'Minimum payout is £100';
  end if;

  v_amount := v_amount_pence::numeric / 100;
  if v_amount > v_balance then
    raise exception 'Payout amount exceeds available balance';
  end if;

  -- Platform commission is taken when creator earns; there is no second payout fee.
  v_net := v_amount - v_fee;
  v_next := v_balance - v_amount;

  update public.profiles
  set balance_gbp = v_next
  where id = p_creator_id;

  insert into public.payout_requests (
    creator_id,amount_gbp,fee_gbp,net_gbp,status,scheduled_for,notes
  ) values (
    p_creator_id,v_amount,v_fee,v_net,'pending',p_scheduled_for,'Requested via dashboard'
  )
  returning * into v_payout;

  insert into public.wallet_transactions (
    user_id,amount_gbp,type,balance_after,reference_type,reference_id,description,idempotency_key
  ) values (
    p_creator_id,
    -v_amount,
    'payout_requested',
    v_next,
    'payout_request',
    v_payout.id::text,
    'Payout request · £' || v_amount::text || ' · scheduled ' || p_scheduled_for::text,
    'payout-request:' || v_payout.id::text
  );

  return jsonb_build_object(
    'ok',true,
    'already',false,
    'payout',to_jsonb(v_payout),
    'balance',v_next,
    'amount',v_amount,
    'fee_gbp',v_fee,
    'net_gbp',v_net,
    'scheduled_for',p_scheduled_for
  );
end;
$function$;

revoke all on function public.reserve_creator_payout(uuid, integer, date) from public;
revoke all on function public.reserve_creator_payout(uuid, integer, date) from anon, authenticated;
grant execute on function public.reserve_creator_payout(uuid, integer, date) to service_role;
