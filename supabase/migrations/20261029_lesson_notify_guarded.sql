-- KineTech new-lesson notices, hardened — run INSTEAD of 20261026 (same
-- trigger name; safe to run whether or not 20261026 was applied).
--
-- Hardening: the broadcast MUST NEVER break lesson saves. The first version
-- let any internal failure (deadlocked prune, schema drift, RLS) abort the
-- video INSERT itself — parts then "saved" locally while the DB rejected
-- them. The exception block below guarantees: notice sent when possible,
-- video row ALWAYS lands.

create or replace function notify_enrolled_on_new_video() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_title text;
begin
  begin
    -- Only real watchable lessons (empty-src placeholders are not
    -- watchable yet; filling the URL later is an UPDATE, not news).
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
  exception when others then
    -- Notifications are best-effort; the lesson save already succeeded.
    null;
  end;
  return NEW;
end $$;

drop trigger if exists trg_notify_enrolled_on_new_video on videos;
create trigger trg_notify_enrolled_on_new_video after insert on videos
for each row execute function notify_enrolled_on_new_video();
