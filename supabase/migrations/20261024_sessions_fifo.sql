-- KineTech lessons-widget FIFO — run AFTER 20261020_touch_fifo.sql
--
-- New-lesson notices now land in upcoming_sessions (the lessons widget),
-- not general notifications. Cap each user at the 5 newest session rows,
-- same first-in-first-out rule as notifications. Idempotent.

create or replace function prune_upcoming_sessions() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from upcoming_sessions
  where user_id = new.user_id
    and id not in (
      select id from upcoming_sessions
      where user_id = new.user_id
      order by date desc, created_at desc, id desc
      limit 5
    );
  return new;
end $$;

drop trigger if exists trg_prune_upcoming_sessions on upcoming_sessions;
create trigger trg_prune_upcoming_sessions after insert on upcoming_sessions
for each row execute function prune_upcoming_sessions();
