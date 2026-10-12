-- KineTech new-lesson notices, server-side — run AFTER 20261025_video_mins_selfheal.sql
--
-- WHY: the client broadcast fired once per admin save (best-effort, errors
-- swallowed, edits never re-notify) — one hiccup meant permanent silence.
-- A trigger on videos INSERT cannot be skipped: every new watchable lesson
-- notifies every enrolled user, from any insert path (editor saves,
-- backfills, SQL). Replaces the client notifyNewLessons call (removed).
--
-- Rule: only rows WITH a video URL notify (empty-src placeholders are not
-- watchable yet). Filling the URL later is an UPDATE — admins attach the
-- video when the part is ready, and the INSERT is the announcement moment.
-- The existing FIFO trigger keeps each user at the 5 newest rows.

create or replace function notify_enrolled_on_new_video() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  if NEW.src_url is null or btrim(NEW.src_url) = '' then
    return NEW;
  end if;
  select coalesce(
    (select title from module_translations
      where module_id = NEW.module_id and lang = 'ar' and btrim(title) <> ''),
    (select title from module_translations
      where module_id = NEW.module_id and lang = 'en' and btrim(title) <> ''),
    'New lesson'
  ) into v_title;
  insert into upcoming_sessions (user_id, title, date)
  select e.user_id, 'New lesson · درس جديد: ' || v_title, now()
  from enrollments e
  where e.course_id = NEW.course_id;
  return NEW;
end $$;

drop trigger if exists trg_notify_enrolled_on_new_video on videos;
create trigger trg_notify_enrolled_on_new_video after insert on videos
for each row execute function notify_enrolled_on_new_video();
