-- "One quick question" after a note: the note writer may return one follow-up
-- about something the buyer raised but left unclear, with three answers.
--   clarify: { question, reason, options: [{ label, detail }] } or null
--   clarify_answer: the chosen option's label, or 'skipped'
-- The buyer answers on the note screen (owner may update notes under RLS), and
-- answers feed the ranking.
alter table public.notes
  add column clarify jsonb,
  add column clarify_answer text check (char_length(clarify_answer) <= 200),
  add column clarify_answered_at timestamptz;
