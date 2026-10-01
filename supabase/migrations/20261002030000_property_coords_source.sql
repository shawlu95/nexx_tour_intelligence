-- Where a home's coordinates came from:
--   'device'  = the phone's position when the home was added (often down the street)
--   'address' = looked up from the street address (the house itself)
-- Homes added before this change are 'device' and get corrected by the app.
alter table public.properties
  add column coords_source text not null default 'device' check (coords_source in ('device', 'address'));
