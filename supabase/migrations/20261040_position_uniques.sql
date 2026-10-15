-- KineTech position uniqueness repair — run anytime, idempotent.
--
-- The id-preserving sync matches lessons by (course_id, sort_order). If a
-- database is missing those UNIQUE constraints (old schema drift) or holds
-- duplicates (parallel saves), one admin part can map to several rows:
-- deletes remove one copy while the twin keeps showing, and adds appear to
-- vanish. This file deletes the twins (keeping the copy that actually holds
-- content: video row wins, then translations, then lowest id) and enforces
-- the constraints so it cannot recur. Fully transactional.

begin;

-- 1. Duplicate modules: same (course_id, sort_order) more than once.
do $$ declare r record; v_keep uuid; v_n int := 0; begin
  for r in select course_id, sort_order from modules
           group by course_id, sort_order having count(*) > 1
  loop
    -- Prefer the module holding a video; then one holding translations.
    select m.id into v_keep from modules m
     where m.course_id = r.course_id and m.sort_order = r.sort_order
     order by (exists (select 1 from videos v where v.module_id = m.id)) desc,
              (exists (select 1 from module_translations t where t.module_id = m.id)) desc,
              m.id::text
     limit 1;
    delete from modules m
     where m.course_id = r.course_id and m.sort_order = r.sort_order
       and m.id <> v_keep;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      raise notice 'modules: removed % duplicate(s) at course % position %', v_n, r.course_id, r.sort_order;
    end if;
  end loop;
end $$;

-- 2. Duplicate videos: same (course_id, sort_order) more than once.
do $$ declare r record; v_keep uuid; v_n int := 0; begin
  for r in select course_id, sort_order from videos
           group by course_id, sort_order having count(*) > 1
  loop
    -- Prefer the video students actually watched (has views), then one with
    -- a stored URL, then lowest id.
    select v.id into v_keep from videos v
     where v.course_id = r.course_id and v.sort_order = r.sort_order
     order by (exists (select 1 from video_views vv where vv.video_id = v.id)) desc,
              (exists (select 1 from video_sources s where s.video_id = v.id)) desc,
              v.id::text
     limit 1;
    delete from videos v
     where v.course_id = r.course_id and v.sort_order = r.sort_order
       and v.id <> v_keep;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      raise notice 'videos: removed % duplicate(s) at course % position %', v_n, r.course_id, r.sort_order;
    end if;
  end loop;
end $$;

-- 3. Enforce the constraints going forward — but only if no equivalent
-- UNIQUE already covers those columns (init.sql created inline ones under
-- auto-generated names on healthy DBs; a second identical constraint would
-- be harmless yet pointless).
do $$ begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_attribute a1 on a1.attrelid = t.oid and a1.attnum = c.conkey[1]
    join pg_attribute a2 on a2.attrelid = t.oid and a2.attnum = c.conkey[2]
    where t.relname = 'modules' and c.contype = 'u'
      and ((a1.attname = 'course_id' and a2.attname = 'sort_order')
        or (a1.attname = 'sort_order' and a2.attname = 'course_id'))
  ) then
    alter table modules add constraint modules_course_pos_unique unique (course_id, sort_order);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_attribute a1 on a1.attrelid = t.oid and a1.attnum = c.conkey[1]
    join pg_attribute a2 on a2.attrelid = t.oid and a2.attnum = c.conkey[2]
    where t.relname = 'videos' and c.contype = 'u'
      and ((a1.attname = 'course_id' and a2.attname = 'sort_order')
        or (a1.attname = 'sort_order' and a2.attname = 'course_id'))
  ) then
    alter table videos add constraint videos_course_pos_unique unique (course_id, sort_order);
  end if;
end $$;

commit;
