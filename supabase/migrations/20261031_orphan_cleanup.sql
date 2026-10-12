-- KineTech orphan cleanup — run AFTER 20261030_orphan_diagnose.sql only if
-- it showed rows. Deletes ONLY unambiguous junk (reports counts via NOTICE):
--   (a) videos whose module is gone (editor can never show/remove them),
--   (b) videos with empty src on modules with no titles (blank placeholders),
--   (c) modules with no translations AND no videos (empty month headers).
-- Titled-but-videoless parts ("coming soon") are KEPT — delete those with
-- the row delete button in the course editor.
-- Entirely transactional: any error rolls everything back.

begin;

-- (a) dangling videos
delete from videos v
where not exists (select 1 from modules m where m.id = v.module_id);

-- (b) empty-src videos on untitled modules
delete from videos v
where (v.src_url is null or btrim(v.src_url) = '')
  and not exists (
    select 1 from module_translations t
    where t.module_id = v.module_id and btrim(t.title) <> ''
  );

-- (c) translation-less, videoless modules
delete from modules m
where not exists (select 1 from module_translations t where t.module_id = m.id)
  and not exists (select 1 from videos v where v.module_id = m.id);

-- report survivors per course (verify the numbers look right)
do $$ declare r record; begin
  for r in select c.slug,
    (select count(*) from modules m where m.course_id = c.id) as modules,
    (select count(*) from videos v where v.course_id = c.id) as videos
    from courses c order by c.slug
  loop
    raise notice 'course %: % modules, % videos', r.slug, r.modules, r.videos;
  end loop;
end $$;

commit;
