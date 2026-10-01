-- Tappable quick replies NORA offers with its question, in the buyer's voice.
alter table public.ranking_messages add column suggestions text[] not null default '{}';
