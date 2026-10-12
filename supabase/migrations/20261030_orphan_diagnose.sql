-- KineTech orphan diagnosis (READ-ONLY — deletes nothing).
-- Run it, send the output back. Finds every row class the admin editor
-- cannot see or remove: dangling videos, duplicate positions, empty
-- placeholders, translation-less months.

-- 1. Per-course totals: modules vs videos (a gap here = drift).
select c.slug,
       (select count(*) from modules m where m.course_id = c.id) as modules,
       (select count(*) from videos v where v.course_id = c.id) as videos
from courses c order by c.slug;

-- 2. Dangling videos: module_id points at no module (editor can never show them).
select v.id, v.course_id, v.sort_order, left(v.src_url, 60) as src
from videos v
where not exists (select 1 from modules m where m.id = v.module_id);

-- 3. Duplicate positions: same (course, sort_order) twice (parallel saves).
select course_id, sort_order, count(*) as n
from modules group by course_id, sort_order having count(*) > 1;

-- 4. Empty-src videos (unwatchable placeholders, never notify).
select v.course_id, v.sort_order, v.module_id
from videos v where v.src_url is null or btrim(v.src_url) = '';

-- 5. Translation-less modules (blank month headers with no content rows).
select m.course_id, m.sort_order, m.id,
       (select count(*) from videos v where v.module_id = m.id) as videos
from modules m
where not exists (select 1 from module_translations t where t.module_id = m.id);
