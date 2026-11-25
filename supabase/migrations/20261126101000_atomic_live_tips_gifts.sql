-- Atomically post a live tip or gift and update stream totals/leaderboard.
create or replace function public.post_live_creator_payment(
  p_sender_id uuid,
  p_stream_id uuid,
  p_gross_pence integer,
  p_sent_type text,
  p_received_type text,
  p_idempotency_key text,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_stream public.live_streams%rowtype;
  v_transfer jsonb;
  v_sender_name text;
  v_sender_avatar text;
  v_user_total numeric(12,2);
  v_new_raised numeric(12,2);
  v_next_goal numeric(12,2);
  v_showcase_user_id uuid;
  v_showcase_amount numeric(12,2);
  v_showcase_name text;
  v_showcase_avatar text;
  v_gross numeric(12,2);
  v_fee numeric(12,2);
  v_net numeric(12,2);
  v_sender_balance numeric(12,2);
  v_already boolean := false;
begin
  if p_sender_id is null or p_stream_id is null or p_sender_id = (select creator_id from public.live_streams where id = p_stream_id) then
    raise exception 'Invalid sender or stream';
  end if;
  if p_gross_pence is null or p_gross_pence <= 0 or p_gross_pence > 500000 then
    raise exception 'Invalid live payment amount';
  end if;
  if not (
    (p_sent_type = 'tip_sent' and p_received_type = 'tip_received') or
    (p_sent_type = 'gift_sent' and p_received_type = 'gift_received')
  ) then
    raise exception 'Invalid live payment transaction types';
  end if;
  if coalesce(trim(p_idempotency_key), '') = '' or length(p_idempotency_key) > 200 then
    raise exception 'A valid idempotency key is required';
  end if;

  select * into v_stream
  from public.live_streams
  where id = p_stream_id
  for update;

  if not found or v_stream.status not in ('active', 'idle_ready', 'disconnected') then
    raise exception 'This live has ended';
  end if;
  if v_stream.creator_id = p_sender_id then
    raise exception 'You cannot pay yourself';
  end if;

  select coalesce(display_name, username, 'A fan'), avatar_url
    into v_sender_name, v_sender_avatar
  from public.profiles
  where id = p_sender_id;

  if not found then
    raise exception 'Sender profile not found';
  end if;

  v_transfer := public.post_creator_wallet_transfer(
    p_sender_id,
    v_stream.creator_id,
    p_gross_pence,
    p_sent_type,
    p_received_type,
    'live_stream',
    p_stream_id::text,
    p_idempotency_key,
    coalesce(p_description, 'Live creator payment')
  );

  v_already := coalesce((v_transfer->>'already')::boolean, false);

  if v_already then
    select gross_gbp, fee_gbp, net_gbp
      into v_gross, v_fee, v_net
    from public.wallet_transactions
    where idempotency_key = p_idempotency_key || ':credit'
    limit 1;

    select balance_gbp into v_sender_balance
    from public.profiles
    where id = p_sender_id;

    select coalesce(total_gbp, 0) into v_user_total
    from public.live_stream_tips
    where stream_id = p_stream_id and user_id = p_sender_id;
    v_user_total := coalesce(v_user_total, 0);

    return jsonb_build_object(
      'ok', true,
      'already', true,
      'gross_gbp', v_gross,
      'fee_gbp', v_fee,
      'net_gbp', v_net,
      'sender_balance', v_sender_balance,
      'tip_raised_gbp', v_stream.tip_raised_gbp,
      'tip_goal_gbp', v_stream.tip_goal_gbp,
      'tip_goals', coalesce(v_stream.tip_goals, '[]'::jsonb),
      'from_name', v_sender_name,
      'user_total', v_user_total,
      'is_showcase', v_stream.showcase_user_id = p_sender_id,
      'showcase', jsonb_build_object(
        'user_id', v_stream.showcase_user_id,
        'amount_gbp', v_stream.showcase_amount_gbp,
        'name', v_stream.showcase_name,
        'avatar_url', v_stream.showcase_avatar_url
      )
    );
  end if;

  v_gross := p_gross_pence::numeric / 100;

  insert into public.live_stream_tips (stream_id, user_id, total_gbp, updated_at)
  values (p_stream_id, p_sender_id, v_gross, pg_catalog.now())
  on conflict (stream_id, user_id)
  do update set
    total_gbp = public.live_stream_tips.total_gbp + excluded.total_gbp,
    updated_at = pg_catalog.now()
  returning total_gbp into v_user_total;

  v_new_raised := coalesce(v_stream.tip_raised_gbp, 0) + v_gross;
  v_next_goal := coalesce(v_stream.tip_goal_gbp, 0);

  if jsonb_typeof(coalesce(v_stream.tip_goals, '[]'::jsonb)) = 'array' then
    if jsonb_array_length(coalesce(v_stream.tip_goals, '[]'::jsonb)) > 0 then
      select min(case
        when (goal->>'amount') ~ '^[0-9]+([.][0-9]+)?

  v_showcase_user_id := v_stream.showcase_user_id;
  v_showcase_amount := coalesce(v_stream.showcase_amount_gbp, 0);
  v_showcase_name := v_stream.showcase_name;
  v_showcase_avatar := v_stream.showcase_avatar_url;

  if v_user_total >= v_showcase_amount then
    v_showcase_user_id := p_sender_id;
    v_showcase_amount := v_user_total;
    v_showcase_name := v_sender_name;
    v_showcase_avatar := v_sender_avatar;
  end if;

  update public.live_streams
  set tip_raised_gbp = v_new_raised,
      tip_goal_gbp = v_next_goal,
      showcase_user_id = v_showcase_user_id,
      showcase_amount_gbp = v_showcase_amount,
      showcase_name = v_showcase_name,
      showcase_avatar_url = v_showcase_avatar,
      updated_at = pg_catalog.now()
  where id = p_stream_id;

  return v_transfer || jsonb_build_object(
    'ok', true,
    'already', false,
    'tip_raised_gbp', v_new_raised,
    'tip_goal_gbp', v_next_goal,
    'tip_goals', coalesce(v_stream.tip_goals, '[]'::jsonb),
    'from_name', v_sender_name,
    'user_total', v_user_total,
    'is_showcase', v_showcase_user_id = p_sender_id,
    'showcase', jsonb_build_object(
      'user_id', v_showcase_user_id,
      'amount_gbp', v_showcase_amount,
      'name', v_showcase_name,
      'avatar_url', v_showcase_avatar
    )
  );
end;
$function$;

revoke all on function public.post_live_creator_payment(uuid, uuid, integer, text, text, text, text) from public;
revoke all on function public.post_live_creator_payment(uuid, uuid, integer, text, text, text, text) from anon, authenticated;
grant execute on function public.post_live_creator_payment(uuid, uuid, integer, text, text, text, text) to service_role;
 then (goal->>'amount')::numeric
        else null
      end)
        into v_next_goal
      from jsonb_array_elements(v_stream.tip_goals) as goal
      where case
        when (goal->>'amount') ~ '^[0-9]+([.][0-9]+)?

  v_showcase_user_id := v_stream.showcase_user_id;
  v_showcase_amount := coalesce(v_stream.showcase_amount_gbp, 0);
  v_showcase_name := v_stream.showcase_name;
  v_showcase_avatar := v_stream.showcase_avatar_url;

  if v_user_total >= v_showcase_amount then
    v_showcase_user_id := p_sender_id;
    v_showcase_amount := v_user_total;
    v_showcase_name := v_sender_name;
    v_showcase_avatar := v_sender_avatar;
  end if;

  update public.live_streams
  set tip_raised_gbp = v_new_raised,
      tip_goal_gbp = v_next_goal,
      showcase_user_id = v_showcase_user_id,
      showcase_amount_gbp = v_showcase_amount,
      showcase_name = v_showcase_name,
      showcase_avatar_url = v_showcase_avatar,
      updated_at = pg_catalog.now()
  where id = p_stream_id;

  return v_transfer || jsonb_build_object(
    'ok', true,
    'already', false,
    'tip_raised_gbp', v_new_raised,
    'tip_goal_gbp', v_next_goal,
    'tip_goals', coalesce(v_stream.tip_goals, '[]'::jsonb),
    'from_name', v_sender_name,
    'user_total', v_user_total,
    'is_showcase', v_showcase_user_id = p_sender_id,
    'showcase', jsonb_build_object(
      'user_id', v_showcase_user_id,
      'amount_gbp', v_showcase_amount,
      'name', v_showcase_name,
      'avatar_url', v_showcase_avatar
    )
  );
end;
$function$;

revoke all on function public.post_live_creator_payment(uuid, uuid, integer, text, text, text, text) from public;
revoke all on function public.post_live_creator_payment(uuid, uuid, integer, text, text, text, text) from anon, authenticated;
grant execute on function public.post_live_creator_payment(uuid, uuid, integer, text, text, text, text) to service_role;
 then (goal->>'amount')::numeric > v_new_raised
        else false
      end;

      if v_next_goal is null then
        select max(case
          when (goal->>'amount') ~ '^[0-9]+([.][0-9]+)?

  v_showcase_user_id := v_stream.showcase_user_id;
  v_showcase_amount := coalesce(v_stream.showcase_amount_gbp, 0);
  v_showcase_name := v_stream.showcase_name;
  v_showcase_avatar := v_stream.showcase_avatar_url;

  if v_user_total >= v_showcase_amount then
    v_showcase_user_id := p_sender_id;
    v_showcase_amount := v_user_total;
    v_showcase_name := v_sender_name;
    v_showcase_avatar := v_sender_avatar;
  end if;

  update public.live_streams
  set tip_raised_gbp = v_new_raised,
      tip_goal_gbp = v_next_goal,
      showcase_user_id = v_showcase_user_id,
      showcase_amount_gbp = v_showcase_amount,
      showcase_name = v_showcase_name,
      showcase_avatar_url = v_showcase_avatar,
      updated_at = pg_catalog.now()
  where id = p_stream_id;

  return v_transfer || jsonb_build_object(
    'ok', true,
    'already', false,
    'tip_raised_gbp', v_new_raised,
    'tip_goal_gbp', v_next_goal,
    'tip_goals', coalesce(v_stream.tip_goals, '[]'::jsonb),
    'from_name', v_sender_name,
    'user_total', v_user_total,
    'is_showcase', v_showcase_user_id = p_sender_id,
    'showcase', jsonb_build_object(
      'user_id', v_showcase_user_id,
      'amount_gbp', v_showcase_amount,
      'name', v_showcase_name,
      'avatar_url', v_showcase_avatar
    )
  );
end;
$function$;

revoke all on function public.post_live_creator_payment(uuid, uuid, integer, text, text, text, text) from public;
revoke all on function public.post_live_creator_payment(uuid, uuid, integer, text, text, text, text) from anon, authenticated;
grant execute on function public.post_live_creator_payment(uuid, uuid, integer, text, text, text, text) to service_role;
 then (goal->>'amount')::numeric
          else null
        end)
          into v_next_goal
        from jsonb_array_elements(v_stream.tip_goals) as goal;
      end if;

      v_next_goal := coalesce(v_next_goal, coalesce(v_stream.tip_goal_gbp, 0));
    end if;
  end if;

  v_showcase_user_id := v_stream.showcase_user_id;
  v_showcase_amount := coalesce(v_stream.showcase_amount_gbp, 0);
  v_showcase_name := v_stream.showcase_name;
  v_showcase_avatar := v_stream.showcase_avatar_url;

  if v_user_total >= v_showcase_amount then
    v_showcase_user_id := p_sender_id;
    v_showcase_amount := v_user_total;
    v_showcase_name := v_sender_name;
    v_showcase_avatar := v_sender_avatar;
  end if;

  update public.live_streams
  set tip_raised_gbp = v_new_raised,
      tip_goal_gbp = v_next_goal,
      showcase_user_id = v_showcase_user_id,
      showcase_amount_gbp = v_showcase_amount,
      showcase_name = v_showcase_name,
      showcase_avatar_url = v_showcase_avatar,
      updated_at = pg_catalog.now()
  where id = p_stream_id;

  return v_transfer || jsonb_build_object(
    'ok', true,
    'already', false,
    'tip_raised_gbp', v_new_raised,
    'tip_goal_gbp', v_next_goal,
    'tip_goals', coalesce(v_stream.tip_goals, '[]'::jsonb),
    'from_name', v_sender_name,
    'user_total', v_user_total,
    'is_showcase', v_showcase_user_id = p_sender_id,
    'showcase', jsonb_build_object(
      'user_id', v_showcase_user_id,
      'amount_gbp', v_showcase_amount,
      'name', v_showcase_name,
      'avatar_url', v_showcase_avatar
    )
  );
end;
$function$;

revoke all on function public.post_live_creator_payment(uuid, uuid, integer, text, text, text, text) from public;
revoke all on function public.post_live_creator_payment(uuid, uuid, integer, text, text, text, text) from anon, authenticated;
grant execute on function public.post_live_creator_payment(uuid, uuid, integer, text, text, text, text) to service_role;
