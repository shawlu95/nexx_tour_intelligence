-- Public facts about each home (from RentCast), and a hard monthly cap on paid API calls.

alter table public.properties
  add column beds numeric,
  add column baths numeric,
  add column sqft integer,
  add column price integer,
  add column price_kind text check (price_kind in ('list', 'last_sale')),
  add column price_date date,
  add column listing_status text,
  add column facts_status text not null default 'pending'
    check (facts_status in ('pending', 'found', 'not_found', 'error')),
  add column facts_fetched_at timestamptz;

-- Calls made to metered third-party APIs, per calendar month (UTC).
create table public.api_usage (
  month text not null,          -- 'YYYY-MM'
  provider text not null,
  calls integer not null default 0,
  primary key (month, provider)
);

-- Service role only: RLS on with no policies.
alter table public.api_usage enable row level security;

-- Reserves one call for `provider` this month. Returns false once `monthly_limit`
-- calls have been reserved, so callers can stop before paying overage.
create function public.claim_api_call(p_provider text, p_monthly_limit integer) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  m text := to_char(now() at time zone 'utc', 'YYYY-MM');
  used integer;
begin
  insert into public.api_usage (month, provider, calls)
  values (m, p_provider, 1)
  on conflict (month, provider) do update
    set calls = public.api_usage.calls + 1
    where public.api_usage.calls < p_monthly_limit
  returning calls into used;
  return used is not null;
end;
$$;

revoke all on function public.claim_api_call(text, integer) from public, anon, authenticated;
