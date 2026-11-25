create or replace function public.start_creator_subscription(
  p_subscriber_id uuid,
  p_creator_id uuid,
  p_price_pence integer,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_sub public.subscriptions%rowtype;
  v_existing boolean := false;
  v_sender numeric(12,2);
  v_creator numeric(12,2);
  v_gross numeric(12,2);
  v_fee numeric(12,2);
  v_net numeric(12,2);
  v_now timestamptz := now();
  v_end timestamptz;
begin
  if p_subscriber_id is null or p_creator_id is null or p_subscriber_id = p_creator_id
     or p_price_pence is null or p_price_pence <= 0
     or coalesce(trim(p_idempotency_key),'') = '' then
    raise exception 'Invalid subscription request';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key, 0));

  select * into v_sub from public.subscriptions
  where subscriber_id=p_subscriber_id and creator_id=p_creator_id
  for update;
  v_existing := found;

  if v_existing and v_sub.status='active' then
    if v_sub.cancel_at_period_end then
      update public.subscriptions set cancel_at_period_end=false where id=v_sub.id;
      return jsonb_build_object('ok',true,'resumed',true,'period_end',v_sub.current_period_end);
    end if;
    return jsonb_build_object('ok',true,'already',true,'period_end',v_sub.current_period_end);
  end if;

  perform 1 from public.profiles
  where id in (p_subscriber_id,p_creator_id)
  order by id for update;

  select balance_gbp into v_sender from public.profiles where id=p_subscriber_id;
  if not found then raise exception 'Subscriber profile not found'; end if;
  if not exists(select 1 from public.profiles where id=p_creator_id and account_type='creator') then
    raise exception 'Recipient is not a creator account';
  end if;
  select balance_gbp into v_creator from public.profiles where id=p_creator_id;

  v_gross := p_price_pence::numeric/100;
  v_fee := round(p_price_pence::numeric*20/100)/100;
  v_net := v_gross-v_fee;
  if v_sender < v_gross then raise exception 'Insufficient wallet balance'; end if;

  update public.profiles set balance_gbp=v_sender-v_gross where id=p_subscriber_id;
  update public.profiles set balance_gbp=v_creator+v_net where id=p_creator_id;
  v_end := v_now+interval '1 month';

  if v_existing then
    update public.subscriptions set price=v_gross,status='active',
      started_at=coalesce(v_sub.started_at,v_now),last_billed_at=v_now,
      current_period_end=v_end,expires_at=v_end,cancel_at_period_end=false,
      remind_3d_sent_at=null,remind_1d_sent_at=null
    where id=v_sub.id returning * into v_sub;
  else
    insert into public.subscriptions(subscriber_id,creator_id,price,status,started_at,
      last_billed_at,current_period_end,expires_at,cancel_at_period_end)
    values(p_subscriber_id,p_creator_id,v_gross,'active',v_now,v_now,v_end,v_end,false)
    returning * into v_sub;
  end if;

  insert into public.wallet_transactions(user_id,type,amount_gbp,balance_after,counterparty_id,
    reference_type,reference_id,description,idempotency_key)
  values(p_subscriber_id,'sub_sent',-v_gross,v_sender-v_gross,p_creator_id,'subscription',
    v_sub.id::text,'Monthly subscription £'||to_char(v_gross,'FM999999990.00'),p_idempotency_key||':debit');

  insert into public.wallet_transactions(user_id,type,amount_gbp,balance_after,counterparty_id,
    reference_type,reference_id,description,gross_gbp,fee_gbp,net_gbp,idempotency_key)
  values(p_creator_id,'sub_received',v_net,v_creator+v_net,p_subscriber_id,'subscription',
    v_sub.id::text,'Monthly subscription · 20% platform commission',v_gross,v_fee,v_net,p_idempotency_key||':credit');

  return jsonb_build_object('ok',true,'already',false,'subscription_id',v_sub.id,
    'gross_gbp',v_gross,'fee_gbp',v_fee,'net_gbp',v_net,'period_end',v_end,'balance',v_sender-v_gross);
end;
$function$;

create or replace function public.renew_creator_subscription(p_subscription_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_sub public.subscriptions%rowtype;
  v_sender numeric(12,2);
  v_creator numeric(12,2);
  v_gross numeric(12,2);
  v_fee numeric(12,2);
  v_net numeric(12,2);
  v_sender_next numeric(12,2);
  v_creator_next numeric(12,2);
  v_key text;
  v_end timestamptz;
begin
  select * into v_sub from public.subscriptions where id=p_subscription_id for update;
  if not found then raise exception 'Subscription not found'; end if;
  if v_sub.status not in ('active','past_due') then
    return jsonb_build_object('ok',true,'skipped',true,'reason','not_renewable');
  end if;
  if v_sub.cancel_at_period_end then
    update public.subscriptions set status='cancelled',expires_at=now() where id=v_sub.id;
    return jsonb_build_object('ok',true,'ended',true);
  end if;
  if v_sub.current_period_end is null or v_sub.current_period_end>now() then
    return jsonb_build_object('ok',true,'skipped',true,'reason','not_due');
  end if;

  perform 1 from public.profiles where id in(v_sub.subscriber_id,v_sub.creator_id) order by id for update;
  select balance_gbp into v_sender from public.profiles where id=v_sub.subscriber_id;
  select balance_gbp into v_creator from public.profiles where id=v_sub.creator_id;
  v_gross := round(v_sub.price*100)/100;
  if v_gross<=0 then
    update public.subscriptions set status='expired' where id=v_sub.id;
    return jsonb_build_object('ok',false,'reason','invalid_price');
  end if;
  if v_sender<v_gross then
    update public.subscriptions set status='past_due' where id=v_sub.id;
    return jsonb_build_object('ok',false,'past_due',true,'reason','insufficient_balance');
  end if;

  v_fee := round(v_gross*100*20/100)/100;
  v_net := v_gross-v_fee;
  v_sender_next := v_sender-v_gross;
  v_creator_next := v_creator+v_net;
  update public.profiles set balance_gbp=v_sender_next where id=v_sub.subscriber_id;
  update public.profiles set balance_gbp=v_creator_next where id=v_sub.creator_id;

  v_key := 'subscription-renewal:'||v_sub.id::text||':'||
    to_char(v_sub.current_period_end at time zone 'UTC','YYYYMMDDHH24MISS');
  insert into public.wallet_transactions(user_id,type,amount_gbp,balance_after,counterparty_id,
    reference_type,reference_id,description,idempotency_key)
  values(v_sub.subscriber_id,'sub_sent',-v_gross,v_sender_next,v_sub.creator_id,'subscription',
    v_sub.id::text,'Monthly subscription renewal',v_key||':debit');
  insert into public.wallet_transactions(user_id,type,amount_gbp,balance_after,counterparty_id,
    reference_type,reference_id,description,gross_gbp,fee_gbp,net_gbp,idempotency_key)
  values(v_sub.creator_id,'sub_received',v_net,v_creator_next,v_sub.subscriber_id,'subscription',
    v_sub.id::text,'Monthly subscription renewal · 20% platform commission',
    v_gross,v_fee,v_net,v_key||':credit');

  v_end := v_sub.current_period_end+interval '1 month';
  if v_end<=now() then v_end:=now()+interval '1 month'; end if;
  update public.subscriptions set last_billed_at=now(),current_period_end=v_end,
    expires_at=v_end,status='active',remind_3d_sent_at=null,remind_1d_sent_at=null
  where id=v_sub.id;
  return jsonb_build_object('ok',true,'renewed',true,'gross_gbp',v_gross,
    'fee_gbp',v_fee,'net_gbp',v_net,'period_end',v_end);
end;
$function$;

revoke all on function public.start_creator_subscription(uuid,uuid,integer,text) from public,anon,authenticated;
grant execute on function public.start_creator_subscription(uuid,uuid,integer,text) to service_role;
revoke all on function public.renew_creator_subscription(uuid) from public,anon,authenticated;
grant execute on function public.renew_creator_subscription(uuid) to service_role;
