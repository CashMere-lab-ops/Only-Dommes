create or replace function public.post_creator_wallet_transfer(
  p_sender_id uuid,
  p_creator_id uuid,
  p_gross_pence integer,
  p_sent_type text,
  p_received_type text,
  p_reference_type text,
  p_reference_id text,
  p_idempotency_key text,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_sender_balance numeric(12,2);
  v_creator_balance numeric(12,2);
  v_gross numeric(12,2);
  v_fee numeric(12,2);
  v_net numeric(12,2);
  v_sender_next numeric(12,2);
  v_creator_next numeric(12,2);
  v_existing_count integer;
begin
  if p_sender_id is null or p_creator_id is null or p_sender_id = p_creator_id then
    raise exception 'Invalid sender or creator';
  end if;
  if p_gross_pence is null or p_gross_pence <= 0 then
    raise exception 'Amount must be positive';
  end if;
  if coalesce(trim(p_sent_type), '') = '' or coalesce(trim(p_received_type), '') = '' then
    raise exception 'Transaction types are required';
  end if;
  if coalesce(trim(p_idempotency_key), '') = '' then
    raise exception 'Idempotency key is required';
  end if;
  if length(p_idempotency_key) > 200 then
    raise exception 'Idempotency key is too long';
  end if;

  -- Serialize retries of the same logical payment before checking the ledger.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key, 0));

  select count(*) into v_existing_count
  from public.wallet_transactions
  where idempotency_key in (p_idempotency_key || ':debit', p_idempotency_key || ':credit');

  if v_existing_count > 0 then
    if v_existing_count <> 2 then
      raise exception 'Incomplete prior transfer; manual reconciliation required';
    end if;
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  -- Lock both wallets in deterministic order to avoid concurrent overspend/deadlocks.
  perform 1
  from public.profiles
  where id in (p_sender_id, p_creator_id)
  order by id
  for update;

  select balance_gbp into v_sender_balance
  from public.profiles where id = p_sender_id;
  if not found then raise exception 'Sender profile not found'; end if;

  select balance_gbp into v_creator_balance
  from public.profiles where id = p_creator_id;
  if not found then raise exception 'Creator profile not found'; end if;

  if not exists (
    select 1 from public.profiles
    where id = p_creator_id and account_type = 'creator'
  ) then
    raise exception 'Recipient is not a creator account';
  end if;

  v_gross := p_gross_pence::numeric / 100;
  v_fee := round(p_gross_pence::numeric * 20 / 100) / 100;
  v_net := v_gross - v_fee;

  if v_sender_balance < v_gross then raise exception 'Insufficient wallet balance'; end if;

  v_sender_next := v_sender_balance - v_gross;
  v_creator_next := v_creator_balance + v_net;

  update public.profiles set balance_gbp = v_sender_next where id = p_sender_id;
  update public.profiles set balance_gbp = v_creator_next where id = p_creator_id;

  insert into public.wallet_transactions (
    user_id, type, amount_gbp, balance_after, counterparty_id,
    reference_type, reference_id, description, idempotency_key
  ) values (
    p_sender_id, p_sent_type, -v_gross, v_sender_next, p_creator_id,
    p_reference_type, p_reference_id, coalesce(p_description, 'Creator transaction'), p_idempotency_key || ':debit'
  );

  insert into public.wallet_transactions (
    user_id, type, amount_gbp, balance_after, counterparty_id,
    reference_type, reference_id, description, gross_gbp, fee_gbp, net_gbp, idempotency_key
  ) values (
    p_creator_id, p_received_type, v_net, v_creator_next, p_sender_id,
    p_reference_type, p_reference_id,
    coalesce(p_description, 'Creator transaction') || ' · 20% platform commission',
    v_gross, v_fee, v_net, p_idempotency_key || ':credit'
  );

  return jsonb_build_object(
    'ok', true,
    'already', false,
    'gross_gbp', v_gross,
    'fee_gbp', v_fee,
    'net_gbp', v_net,
    'sender_balance', v_sender_next,
    'creator_balance', v_creator_next
  );
end;
$function$;

revoke all on function public.post_creator_wallet_transfer(uuid, uuid, integer, text, text, text, text, text, text) from public;
revoke all on function public.post_creator_wallet_transfer(uuid, uuid, integer, text, text, text, text, text, text) from anon;
revoke all on function public.post_creator_wallet_transfer(uuid, uuid, integer, text, text, text, text, text, text) from authenticated;
grant execute on function public.post_creator_wallet_transfer(uuid, uuid, integer, text, text, text, text, text, text) to service_role;
