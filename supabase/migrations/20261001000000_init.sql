-- NORA MVP schema.
-- Every table is owned by a user and protected by row-level security.
-- Server-only writes (transcripts, AI note items, status changes past "uploading")
-- happen in Edge Functions with the service role, which bypasses RLS.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  push_token text,
  created_at timestamptz not null default now()
);

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Properties: one row per user per address; repeat visits group here.
-- ---------------------------------------------------------------------------
create table public.properties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  address_line text not null,
  unit text,
  city text,
  region text,
  postal_code text,
  normalized_key text not null,
  latitude double precision,
  longitude double precision,
  created_at timestamptz not null default now(),
  last_visited_at timestamptz,
  unique (user_id, normalized_key)
);

create index properties_user_recent_idx on public.properties (user_id, last_visited_at desc nulls last);

-- ---------------------------------------------------------------------------
-- Visits: one short spoken reaction recorded after leaving a home.
-- id is generated on the phone so recording works offline.
-- ---------------------------------------------------------------------------
create table public.visits (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  recorded_at timestamptz not null,
  duration_seconds integer not null default 0,
  audio_path text,
  status text not null default 'uploading'
    check (status in ('uploading', 'processing', 'ready', 'failed')),
  error text,
  attempts integer not null default 0,
  status_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index visits_property_idx on public.visits (property_id, recorded_at desc);
create index visits_user_recent_idx on public.visits (user_id, recorded_at desc);
create index visits_retry_idx on public.visits (status, status_updated_at)
  where status in ('processing', 'failed');

create function public.touch_property_last_visited() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.properties
     set last_visited_at = greatest(coalesce(last_visited_at, new.recorded_at), new.recorded_at)
   where id = new.property_id;
  return new;
end;
$$;

create trigger visits_touch_property
  after insert on public.visits
  for each row execute function public.touch_property_last_visited();

-- Phones may only move a visit into "uploading"; later states belong to the server.
create function public.guard_visit_status() returns trigger
language plpgsql as $$
begin
  if auth.role() = 'authenticated' and new.status is distinct from old.status and new.status <> 'uploading' then
    raise exception 'status % can only be set by the server', new.status;
  end if;
  return new;
end;
$$;

create trigger visits_guard_status
  before update on public.visits
  for each row execute function public.guard_visit_status();

-- ---------------------------------------------------------------------------
-- Transcripts (server-written)
-- utterances: [{ start, end, text }] with times in seconds from the start of the clip.
-- ---------------------------------------------------------------------------
create table public.transcripts (
  visit_id uuid primary key references public.visits (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  utterances jsonb not null default '[]'::jsonb,
  full_text text not null default '',
  provider text not null,
  model text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Notes and note items
-- ---------------------------------------------------------------------------
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null unique references public.visits (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  overall text not null default '',
  personal_note text not null default '',
  model text,
  prompt_version text,
  edited_by_buyer boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.note_items (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('liked', 'concern', 'question')),
  text text not null,
  quote text,
  origin text not null check (origin in ('ai', 'buyer')),
  edited boolean not null default false,
  deleted boolean not null default false,
  sort integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index note_items_note_idx on public.note_items (note_id, kind, sort);

-- ---------------------------------------------------------------------------
-- Share links
-- ---------------------------------------------------------------------------
create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references public.notes (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  include_transcript boolean not null default false,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '90 days',
  revoked_at timestamptz,
  view_count integer not null default 0
);

create index share_links_note_idx on public.share_links (note_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create function public.set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger notes_updated_at before update on public.notes
  for each row execute function public.set_updated_at();
create trigger note_items_updated_at before update on public.note_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.properties enable row level security;
alter table public.visits enable row level security;
alter table public.transcripts enable row level security;
alter table public.notes enable row level security;
alter table public.note_items enable row level security;
alter table public.share_links enable row level security;

create policy "own profile" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

create policy "own properties" on public.properties
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own visits" on public.visits
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "read own transcripts" on public.transcripts
  for select using (user_id = auth.uid());

create policy "read own notes" on public.notes
  for select using (user_id = auth.uid());
create policy "edit own notes" on public.notes
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "read own items" on public.note_items
  for select using (user_id = auth.uid());
create policy "add own items" on public.note_items
  for insert with check (user_id = auth.uid() and origin = 'buyer');
create policy "edit own items" on public.note_items
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own share links" on public.share_links
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Public share lookup. The share page calls this with the anon key; it never
-- touches tables directly and only sees what the link allows.
-- ---------------------------------------------------------------------------
create function public.get_shared_note(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  link public.share_links;
  result jsonb;
begin
  select * into link from public.share_links
   where token = p_token and revoked_at is null and expires_at > now();
  if not found then
    return null;
  end if;

  update public.share_links set view_count = view_count + 1 where id = link.id;

  select jsonb_build_object(
    'address', p.address_line || coalesce(', Unit ' || nullif(p.unit, ''), ''),
    'city', concat_ws(', ', p.city, p.region),
    'recorded_at', v.recorded_at,
    'overall', n.overall,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('kind', i.kind, 'text', i.text, 'quote', i.quote)
                       order by i.kind, i.sort, i.created_at)
        from public.note_items i
       where i.note_id = n.id and not i.deleted
    ), '[]'::jsonb),
    'transcript', case when link.include_transcript then t.full_text else null end
  ) into result
  from public.notes n
  join public.visits v on v.id = n.visit_id
  join public.properties p on p.id = v.property_id
  left join public.transcripts t on t.visit_id = v.id
  where n.id = link.note_id;

  return result;
end;
$$;

revoke all on function public.get_shared_note(text) from public;
grant execute on function public.get_shared_note(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Audio storage: private bucket, files at <user_id>/<visit_id>.m4a
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audio', 'audio', false, 10485760, array['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac'])
on conflict (id) do nothing;

create policy "upload own audio" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "update own audio" on storage.objects
  for update to authenticated
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "read own audio" on storage.objects
  for select to authenticated
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "delete own audio" on storage.objects
  for delete to authenticated
  using (bucket_id = 'audio' and (storage.foldername(name))[1] = auth.uid()::text);
