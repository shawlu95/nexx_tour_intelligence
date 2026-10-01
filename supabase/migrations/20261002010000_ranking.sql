-- Ranking conversation: the buyer talks with NORA to rank their homes, and NORA
-- learns their priorities along the way. Written only by the rank-homes function.

create table public.ranking_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  -- Assistant turns carry the ranking they produced:
  -- [{ property_id, rank, fit: 'strong'|'good'|'weak', reason }]
  ranking jsonb,
  -- Assistant turns: the follow-up question NORA asked, if any.
  question text,
  -- Property ids the ranking was based on, to tell when new homes have been added since.
  based_on uuid[],
  model text,
  created_at timestamptz not null default now()
);

create index ranking_messages_user_idx on public.ranking_messages (user_id, created_at);

-- What NORA has learned about the buyer: [{ label, importance: 'must'|'high'|'medium'|'low', evidence }]
create table public.buyer_priorities (
  user_id uuid primary key references auth.users (id) on delete cascade,
  priorities jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.ranking_messages enable row level security;
alter table public.buyer_priorities enable row level security;

create policy "read own ranking messages" on public.ranking_messages
  for select using (user_id = auth.uid());
-- "Start over" clears the conversation.
create policy "delete own ranking messages" on public.ranking_messages
  for delete using (user_id = auth.uid());

create policy "read own priorities" on public.buyer_priorities
  for select using (user_id = auth.uid());
create policy "delete own priorities" on public.buyer_priorities
  for delete using (user_id = auth.uid());
