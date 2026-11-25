-- Make accepting a live private request and charging its wallet atomic.
create or replace function public.accept_live_private_request(
  p_request_id uuid,
  p_creator_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_request public.live_private_requests%rowtype;
  v_stream public.live_streams%rowtype;
  v_transfer jsonb;
  v_amount_pence integer;
  v_amount numeric(12,2);
  v_ends_at timestamptz;
begin
  if p_request_id is null or p_creator_id is null then
    raise exception 'Request and creator are required';
  end if;

  select * into v_request
  from public.live_private_requests
  where id = p_request_id;

  if not found then
    raise exception 'Private request not found';
  end if;
  if v_request.creator_id <> p_creator_id then
    raise exception 'Not your request';
  end if;

  -- Serialize all acceptance attempts for a stream.
  select * into v_stream
  from public.live_streams
  where id = v_request.stream_id
  for update;

  if not found or v_stream.status = 'ended' then
    raise exception 'Stream not available';
  end if;

  select * into v_request
  from public.live_private_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Private request not found';
  end if;
  if v_request.creator_id <> p_creator_id then
    raise exception 'Not your request';
  end if;
  if v_request.status <> 'pending' then
    if v_request.status = 'accepted' then
      return jsonb_build_object(
        'ok', true,
        'already', true,
        'status', v_request.status,
        'minutes', v_request.minutes,
        'amount', v_request.amount_gbp,
        'private_ends_at', v_stream.private_ends_at
      );
    end if;
    raise exception 'Request already handled';
  end if;
  if v_stream.private_active then
    raise exception 'Already in a private session';
  end if;

  if v_request.minutes < 1 or v_request.minutes > 120 or v_request.amount_gbp <= 0 or v_request.amount_gbp > 10000 then
    raise exception 'Invalid private request amount';
  end if;

  v_amount_pence := round(v_request.amount_gbp * 100)::integer;
  if v_amount_pence <= 0 then
    raise exception 'Invalid private request amount';
  end if;
  v_amount := v_amount_pence::numeric / 100;
  v_ends_at := pg_catalog.now() + (v_request.minutes * interval '1 minute');

  v_transfer := public.post_creator_wallet_transfer(
    v_request.requester_id,
    v_request.creator_id,
    v_amount_pence,
    'private_sent',
    'private_received',
    'live_private',
    v_request.id::text,
    'live-private:' || v_request.id::text,
    'Private live · ' || v_request.minutes::text || ' min'
  );

  update public.live_private_requests
  set status = 'accepted',
      responded_at = pg_catalog.now(),
      started_at = pg_catalog.now()
  where id = p_request_id;

  update public.live_private_requests
  set status = 'declined',
      responded_at = pg_catalog.now()
  where stream_id = v_request.stream_id
    and status = 'pending'
    and id <> p_request_id;

  update public.live_streams
  set private_active = true,
      private_user_id = v_request.requester_id,
      private_request_id = p_request_id,
      private_ends_at = v_ends_at,
      private_end_by_creator = false,
      private_end_by_fan = false,
      updated_at = pg_catalog.now()
  where id = v_request.stream_id;

  return coalesce(v_transfer, '{}'::jsonb) || jsonb_build_object(
    'ok', true,
    'already', false,
    'status', 'accepted',
    'private_ends_at', v_ends_at,
    'amount', v_amount,
    'minutes', v_request.minutes,
    'request_id', p_request_id
  );
end;
$function$;

revoke all on function public.accept_live_private_request(uuid, uuid) from public;
revoke all on function public.accept_live_private_request(uuid, uuid) from anon, authenticated;
grant execute on function public.accept_live_private_request(uuid, uuid) to service_role;
