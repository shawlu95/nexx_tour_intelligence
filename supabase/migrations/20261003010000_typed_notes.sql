-- Typed notes: the buyer can type their reaction instead of recording it (also
-- the alternative when the microphone is off). The phone saves the text with the
-- visit; process-visit uses it as the transcript, so nothing goes to AssemblyAI.
alter table public.visits
  add column typed_note text check (char_length(typed_note) <= 5000);
