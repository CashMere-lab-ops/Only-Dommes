-- Make paid and free clip purchases atomic and idempotent.
create unique index if not exists clip_purchases_clip_buyer_uidx
  on public.clip_purchases (clip_id, buyer_id);

create or replace function public.purchase_creator_clip(
  p_buyer_id uuid,
  p_clip_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_clip public.clips%rowtype;
  v_purchase_id uuid;
  v_transfer jsonb;
  v_price_pence integer;
  v_amount_gbp numeric(12,2);
begin
  if p_buyer_id is null or p_clip_id is null then
    raise exception 'Buyer and clip are required';
  end if;
  if coalesce(trim(p_idempotency_key), '') = '' or length(p_idempotency_key) > 200 then
    raise exception 'A valid idempotency key is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_idempotency_key, 0));

  select * into v_clip
  from public.clips
  where id = p_clip_id
  for update;

  if not found or not v_clip.is_published then
    raise exception 'Clip not available';
  end if;
  if v_clip.creator_id = p_buyer_id then
    raise exception 'You cannot purchase your own clip';
  end if;
  if v_clip.price_gbp < 0 then
    raise exception 'Invalid clip price';
  end if;

  select id into v_purchase_id
  from public.clip_purchases
  where clip_id = p_clip_id and buyer_id = p_buyer_id;

  if found then
    return jsonb_build_object('ok', true, 'already', true, 'purchase_id', v_purchase_id);
  end if;

  if v_clip.price_gbp > 0 then
    v_price_pence := round(v_clip.price_gbp * 100)::integer;
    if v_price_pence <= 0 then
      raise exception 'Invalid clip price';
    end if;
    v_amount_gbp := v_price_pence::numeric / 100;

    v_transfer := public.post_creator_wallet_transfer(
      p_buyer_id,
      v_clip.creator_id,
      v_price_pence,
      'clip_sent',
      'clip_received',
      'clip',
      p_clip_id::text,
      p_idempotency_key,
      'Clip: ' || v_clip.title
    );
  else
    v_amount_gbp := 0;
    if not exists (
      select 1 from public.profiles
      where id = p_buyer_id
    ) then
      raise exception 'Buyer profile not found';
    end if;
    if not exists (
      select 1 from public.profiles
      where id = v_clip.creator_id and account_type = 'creator'
    ) then
      raise exception 'Creator profile not found';
    end if;
    v_transfer := jsonb_build_object('ok', true, 'already', false, 'gross_gbp', 0, 'fee_gbp', 0, 'net_gbp', 0);
  end if;

  insert into public.clip_purchases (clip_id, buyer_id, creator_id, amount_gbp)
  values (p_clip_id, p_buyer_id, v_clip.creator_id, v_amount_gbp)
  returning id into v_purchase_id;

  update public.clips
  set sales_count = sales_count + 1,
      updated_at = pg_catalog.now()
  where id = p_clip_id;

  return coalesce(v_transfer, '{}'::jsonb) ||
    jsonb_build_object('ok', true, 'already', false, 'purchase_id', v_purchase_id,
      'free', v_amount_gbp = 0, 'amount_gbp', v_amount_gbp);
end;
$function$;

revoke all on function public.purchase_creator_clip(uuid, uuid, text) from public;
revoke all on function public.purchase_creator_clip(uuid, uuid, text) from anon, authenticated;
grant execute on function public.purchase_creator_clip(uuid, uuid, text) to service_role;
