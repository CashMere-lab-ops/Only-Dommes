-- Credit wallet top-ups exactly once, without platform commission.
create or replace function public.credit_wallet_top_up(
  p_user_id uuid,
  p_amount_pence integer,
  p_payment_reference text,
  p_description text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_key text;
  v_existing public.wallet_transactions%rowtype;
  v_current numeric(12,2);
  v_amount numeric(12,2);
  v_next numeric(12,2);
begin
  if p_user_id is null then
    raise exception 'User is required';
  end if;
  if p_amount_pence is null or p_amount_pence < 1000 or p_amount_pence > 500000 then
    raise exception 'Top-up amount must be between £10 and £5,000';
  end if;
  if coalesce(trim(p_payment_reference), '') = '' or length(p_payment_reference) > 200 then
    raise exception 'A valid payment reference is required';
  end if;

  v_amount := p_amount_pence::numeric / 100;
  v_key := 'wallet-top-up:' || p_payment_reference;

  -- Serialize a webhook and browser confirmation for the same payment.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_key, 0));

  select * into v_existing
  from public.wallet_transactions
  where type = 'top_up'
    and reference_id = p_payment_reference
  limit 1;

  if found then
    if v_existing.user_id <> p_user_id or v_existing.amount_gbp <> v_amount then
      raise exception 'Payment reference has already been credited to a different account or amount';
    end if;

    select balance_gbp into v_current
    from public.profiles
    where id = p_user_id;

    if not found then raise exception 'Profile not found'; end if;

    return jsonb_build_object(
      'ok', true,
      'already', true,
      'amount_gbp', v_amount,
      'balance', v_current
    );
  end if;

  select balance_gbp into v_current
  from public.profiles
  where id = p_user_id
  for update;

  if not found then raise exception 'Profile not found'; end if;

  v_next := v_current + v_amount;

  update public.profiles
  set balance_gbp = v_next
  where id = p_user_id;

  insert into public.wallet_transactions (
    user_id,type,amount_gbp,balance_after,reference_type,reference_id,description,idempotency_key
  ) values (
    p_user_id,
    'top_up',
    v_amount,
    v_next,
    'stripe_checkout',
    p_payment_reference,
    coalesce(p_description, 'Wallet top-up £' || v_amount::text),
    v_key || ':credit'
  );

  return jsonb_build_object(
    'ok', true,
    'already', false,
    'amount_gbp', v_amount,
    'balance', v_next
  );
end;
$function$;

revoke all on function public.credit_wallet_top_up(uuid, integer, text, text) from public;
revoke all on function public.credit_wallet_top_up(uuid, integer, text, text) from anon, authenticated;
grant execute on function public.credit_wallet_top_up(uuid, integer, text, text) to service_role;
