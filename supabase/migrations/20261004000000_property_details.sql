-- Property details for the confirm card and the home page (updated mockup):
-- type, year built, lot size, parking and HOA, from RentCast.
alter table public.properties
  add column property_type text,
  add column year_built integer,
  add column lot_sqft integer,
  add column parking text,
  add column hoa_fee numeric;

-- Look homes up once more so they get the new details. The sweeper does a few
-- per run, within the monthly RentCast cap.
update public.properties set facts_status = 'pending' where facts_status = 'found';
