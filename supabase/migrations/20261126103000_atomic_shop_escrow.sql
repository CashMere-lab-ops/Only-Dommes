-- Serialize all shop escrow state transitions with atomic wallet/ledger changes.
create or replace function public.process_shop_escrow_action(
  p_actor_id uuid,
  p_order_id uuid,
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_order public.shop_orders%rowtype;
  v_buyer_balance numeric(12,2);
  v_creator_balance numeric(12,2);
  v_creator_pending numeric(12,2);
  v_amount numeric(12,2);
  v_fee numeric(12,2);
  v_net numeric(12,2);
  v_buyer_next numeric(12,2);
  v_creator_next numeric(12,2);
  v_pending_next numeric(12,2);
  v_key text;
begin
  if p_actor_id is null or p_order_id is null or p_action not in ('hold','accept','release','refund') then
    raise exception 'Invalid shop escrow action';
  end if;

  v_key := 'shop-escrow:' || p_order_id::text || ':' || p_action;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_key, 0));

  select * into v_order
  from public.shop_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found';
  end if;

  if p_action = 'hold' then
    v_amount := round(coalesce(v_order.item_price, 0), 2);
  else
    v_amount := round(coalesce(nullif(v_order.amount_held, 0), v_order.item_price, 0), 2);
  end if;
  if v_amount <= 0 or v_amount > 10000 then
    raise exception 'Invalid order amount';
  end if;

  if p_action = 'hold' then
    if v_order.buyer_id <> p_actor_id then
      raise exception 'Not your order';
    end if;
    if v_order.funds_status in ('held','pending_creator','released') then
      return jsonb_build_object('ok',true,'already',true,'funds_status',v_order.funds_status);
    end if;
    if v_order.funds_status is distinct from 'none' or v_order.status = 'cancelled' then
      raise exception 'Order cannot be funded in current state';
    end if;

    select balance_gbp into v_buyer_balance
    from public.profiles where id = v_order.buyer_id for update;
    if not found then raise exception 'Buyer profile not found'; end if;
    if v_buyer_balance < v_amount then
      raise exception 'Insufficient wallet balance';
    end if;

    v_buyer_next := v_buyer_balance - v_amount;
    update public.profiles set balance_gbp = v_buyer_next where id = v_order.buyer_id;

    insert into public.wallet_transactions (
      user_id,type,amount_gbp,balance_after,counterparty_id,reference_type,reference_id,description,idempotency_key
    ) values (
      v_order.buyer_id,'shop_hold',-v_amount,v_buyer_next,v_order.creator_id,'shop_order',p_order_id::text,
      'Hold for shop order: ' || coalesce(v_order.item_title,'item'),v_key || ':ledger'
    );

    update public.shop_orders
    set funds_status='held', amount_held=v_amount, updated_at=pg_catalog.now()
    where id=p_order_id;

    return jsonb_build_object('ok',true,'already',false,'funds_status','held','balance',v_buyer_next,'amount',v_amount);
  end if;

  if p_action = 'accept' then
    if v_order.creator_id <> p_actor_id then
      raise exception 'Not your sale';
    end if;
    if v_order.funds_status in ('pending_creator','released') then
      return jsonb_build_object('ok',true,'already',true,'funds_status',v_order.funds_status);
    end if;
    if v_order.funds_status <> 'held' then
      raise exception 'No funds on hold for this order';
    end if;

    select pending_gbp,balance_gbp into v_creator_pending,v_creator_balance
    from public.profiles where id=v_order.creator_id for update;
    if not found then raise exception 'Creator profile not found'; end if;

    v_pending_next := v_creator_pending + v_amount;
    update public.profiles set pending_gbp=v_pending_next where id=v_order.creator_id;

    insert into public.wallet_transactions (
      user_id,type,amount_gbp,balance_after,counterparty_id,reference_type,reference_id,description,idempotency_key
    ) values (
      v_order.creator_id,'shop_pending',v_amount,v_creator_balance,v_order.buyer_id,'shop_order',p_order_id::text,
      'Pending shop sale: ' || coalesce(v_order.item_title,'item') || ' (awaiting delivery)',v_key || ':ledger'
    );

    update public.shop_orders
    set funds_status='pending_creator',status='paid',paid_at=pg_catalog.now(),updated_at=pg_catalog.now()
    where id=p_order_id;

    update public.shop_items
    set status='sold',reserved_for_id=null,reserved_for_username=null,updated_at=pg_catalog.now()
    where id=v_order.item_id;

    return jsonb_build_object('ok',true,'already',false,'funds_status','pending_creator','pending',v_pending_next,'amount',v_amount);
  end if;

  if p_action = 'release' then
    if v_order.buyer_id <> p_actor_id then
      raise exception 'Not your order';
    end if;
    if v_order.funds_status = 'released' then
      return jsonb_build_object('ok',true,'already',true,'funds_status','released');
    end if;
    if v_order.funds_status <> 'pending_creator' then
      raise exception 'Funds are not in pending state';
    end if;

    select pending_gbp,balance_gbp into v_creator_pending,v_creator_balance
    from public.profiles where id=v_order.creator_id for update;
    if not found then raise exception 'Creator profile not found'; end if;
    if v_creator_pending < v_amount then
      raise exception 'Pending creator balance requires reconciliation';
    end if;

    v_fee := round(v_amount * 20 / 100,2);
    v_net := v_amount - v_fee;
    v_pending_next := v_creator_pending - v_amount;
    v_creator_next := v_creator_balance + v_net;

    update public.profiles
    set pending_gbp=v_pending_next,balance_gbp=v_creator_next
    where id=v_order.creator_id;

    insert into public.wallet_transactions (
      user_id,type,amount_gbp,balance_after,counterparty_id,reference_type,reference_id,description,
      gross_gbp,fee_gbp,net_gbp,idempotency_key
    ) values (
      v_order.creator_id,'shop_received',v_net,v_creator_next,v_order.buyer_id,'shop_order',p_order_id::text,
      'Released shop sale: ' || coalesce(v_order.item_title,'item') || ' · kept £' || v_net::text || ' after 20% fee',
      v_amount,v_fee,v_net,v_key || ':ledger'
    );

    update public.shop_orders
    set funds_status='released',status='completed',completed_at=pg_catalog.now(),updated_at=pg_catalog.now()
    where id=p_order_id;

    return jsonb_build_object('ok',true,'already',false,'funds_status','released','creator_balance',v_creator_next,'amount',v_amount,'fee_gbp',v_fee,'net_gbp',v_net);
  end if;

  -- Refund may be initiated by buyer or seller while funds are held.
  -- Once accepted, only the seller may refund the order.
  if p_action = 'refund' then
    if p_actor_id not in (v_order.buyer_id,v_order.creator_id) then
      raise exception 'Not allowed';
    end if;
    if v_order.funds_status in ('refunded','none') then
      return jsonb_build_object('ok',true,'already',true,'funds_status',v_order.funds_status);
    end if;

    if v_order.funds_status = 'held' then
      select balance_gbp into v_buyer_balance
      from public.profiles where id=v_order.buyer_id for update;
      if not found then raise exception 'Buyer profile not found'; end if;

      v_buyer_next := v_buyer_balance + v_amount;
      update public.profiles set balance_gbp=v_buyer_next where id=v_order.buyer_id;

      insert into public.wallet_transactions (
        user_id,type,amount_gbp,balance_after,counterparty_id,reference_type,reference_id,description,idempotency_key
      ) values (
        v_order.buyer_id,'shop_refund',v_amount,v_buyer_next,v_order.creator_id,'shop_order',p_order_id::text,
        'Refund shop hold: ' || coalesce(v_order.item_title,'item'),v_key || ':ledger'
      );

    elsif v_order.funds_status = 'pending_creator' and v_order.creator_id = p_actor_id then
      perform 1
      from public.profiles
      where id in (v_order.buyer_id,v_order.creator_id)
      order by id
      for update;

      select pending_gbp,balance_gbp into v_creator_pending,v_creator_balance
      from public.profiles where id=v_order.creator_id;
      select balance_gbp into v_buyer_balance
      from public.profiles where id=v_order.buyer_id;

      if v_creator_pending < v_amount then
        raise exception 'Pending creator balance requires reconciliation';
      end if;

      v_pending_next := v_creator_pending - v_amount;
      v_buyer_next := v_buyer_balance + v_amount;

      update public.profiles set pending_gbp=v_pending_next where id=v_order.creator_id;
      update public.profiles set balance_gbp=v_buyer_next where id=v_order.buyer_id;

      insert into public.wallet_transactions (
        user_id,type,amount_gbp,balance_after,counterparty_id,reference_type,reference_id,description,idempotency_key
      ) values (
        v_order.creator_id,'shop_pending_reverse',-v_amount,v_creator_balance,v_order.buyer_id,'shop_order',p_order_id::text,
        'Pending reversed: ' || coalesce(v_order.item_title,'item'),v_key || ':creator-ledger'
      );

      insert into public.wallet_transactions (
        user_id,type,amount_gbp,balance_after,counterparty_id,reference_type,reference_id,description,idempotency_key
      ) values (
        v_order.buyer_id,'shop_refund',v_amount,v_buyer_next,v_order.creator_id,'shop_order',p_order_id::text,
        'Refund after cancel: ' || coalesce(v_order.item_title,'item'),v_key || ':buyer-ledger'
      );
    else
      raise exception 'Cannot refund in current state';
    end if;

    update public.shop_orders
    set funds_status='refunded',status='cancelled',updated_at=pg_catalog.now()
    where id=p_order_id;

    update public.shop_items
    set status='available',reserved_for_id=null,reserved_for_username=null,updated_at=pg_catalog.now()
    where id=v_order.item_id;

    return jsonb_build_object('ok',true,'already',false,'funds_status','refunded','buyer_balance',v_buyer_next,'amount',v_amount);
  end if;

  raise exception 'Unknown shop escrow action';
end;
$function$;

revoke all on function public.process_shop_escrow_action(uuid, uuid, text) from public;
revoke all on function public.process_shop_escrow_action(uuid, uuid, text) from anon, authenticated;
grant execute on function public.process_shop_escrow_action(uuid, uuid, text) to service_role;
