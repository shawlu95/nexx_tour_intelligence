-- AI processing consent (App Store guideline 5.1.2: ask before sending personal
-- data to third-party AI). Recordings and typed notes go to AssemblyAI and
-- Anthropic only while profiles.ai_consent_at is set. The buyer sets and clears
-- it in the app; the Edge Functions check it before every AI call.
alter table public.profiles add column ai_consent_at timestamptz;

-- A visit saved while AI processing is off waits here until the buyer allows it.
alter table public.visits drop constraint visits_status_check;
alter table public.visits add constraint visits_status_check
  check (status in ('uploading', 'processing', 'ready', 'failed', 'needs_consent'));
