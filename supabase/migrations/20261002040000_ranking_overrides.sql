-- The buyer's own order of their homes, set by dragging rows on the Ranking tab.
-- Overrides NORA's ranking until the buyer reverts or asks NORA to re-rank.
create table public.ranking_overrides (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  property_ids uuid[] not null,
  updated_at timestamptz not null default now()
);

alter table public.ranking_overrides enable row level security;

create policy "own ranking override" on public.ranking_overrides
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
