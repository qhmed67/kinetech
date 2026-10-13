-- KineTech playback security, drop phase — run ONLY AFTER the phase-1
-- client (which never selects videos.src_url) is deployed and confirmed
-- live (admin header shows the new build hash). Until then, 20261032 keeps
-- get_watch_state returning the old column.
--
-- 1. get_watch_state keeps its signature but returns '' for src_url, so old
--    and new clients both keep working across the deploy boundary.
-- 2. The lesson-notice trigger moves from videos (row no longer carries the
--    URL) to video_sources (URL added = watchable = newsworthy; unchanged
--    rewrites stay silent via the OLD/NEW comparison).
-- 3. videos.src_url is dropped last.

create or replace function get_watch_state(p_slug text, p_lang char(2))
returns table (
  video_id uuid, sort_order int, title text, description text,
  src_url text, mins int, assign_url text, exam_url text,
  views_count smallint, done boolean, unlocked boolean, views_left smallint
)
language plpgsql stable security definer set search_path = public as $$
declare v_course uuid; v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not signed in'; end if;
  select id into v_course from courses where slug = p_slug;
  if v_course is null then return; end if;
  return query
  with v as (
    select v2.id, v2.sort_order, v2.mins, v2.assign_url, v2.exam_url,
           mt.title, mt.description,
           coalesce(vv.views_count, 0)::smallint as vc,
           coalesce(vv.done, false) as dn,
           coalesce(vv.unlocked, false) as un
    from videos v2
    join modules m on m.id = v2.module_id
    left join module_translations mt on mt.module_id = m.id and mt.lang = p_lang
    left join video_views vv on vv.video_id = v2.id and vv.user_id = v_user
    where v2.course_id = v_course
  )
  select v.id, v.sort_order, v.title, v.description, ''::text,
         v.mins, v.assign_url, v.exam_url, v.vc, v.dn,
         (v.un or v.sort_order = 0 or exists (
            select 1 from videos pv
            left join video_views pvv on pvv.video_id = pv.id and pvv.user_id = v_user
            where pv.course_id = v_course and pv.sort_order = v.sort_order - 1
              and coalesce(pvv.done, false)
         )) as unlocked,
         greatest(0, 3 - v.vc)::smallint as views_left
  from v order by v.sort_order;
end $$;

-- Retire the videos-row trigger; notices now fire when the URL lands.
drop trigger if exists trg_notify_enrolled_on_new_video on videos;

create or replace function notify_enrolled_on_new_video() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_course uuid; v_module uuid; v_title text;
begin
  -- Rewrites with an unchanged URL are edits, not news.
  if TG_OP = 'UPDATE' and OLD.src_url is not distinct from NEW.src_url then
    return NEW;
  end if;
  if NEW.src_url is null or btrim(NEW.src_url) = '' then
    return NEW;
  end if;
  select v.course_id, v.module_id into v_course, v_module
    from videos v where v.id = NEW.video_id;
  if v_course is null then return NEW; end if;
  select coalesce(
    (select title from module_translations
      where module_id = v_module and lang = 'ar' and btrim(title) <> ''),
    (select title from module_translations
      where module_id = v_module and lang = 'en' and btrim(title) <> ''),
    'New lesson'
  ) into v_title;
  begin
    insert into upcoming_sessions (user_id, title, date)
    select e.user_id, 'New lesson · درس جديد: ' || v_title, now()
    from enrollments e
    where e.course_id = v_course;
  exception when others then
    -- Notifications are best-effort; the save already succeeded.
    null;
  end;
  return NEW;
end $$;

drop trigger if exists trg_notify_enrolled_on_new_video on video_sources;
create trigger trg_notify_enrolled_on_new_video
after insert or update on video_sources
for each row execute function notify_enrolled_on_new_video();

alter table videos drop column if exists src_url;
