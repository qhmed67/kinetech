-- KineTech lesson sections ("Month 1", units, chapters...) — run AFTER 20261021_exam_feedback.sql
--
-- Long courses group consecutive lessons under a titled header
-- (e.g. months). Sections are per-module-pair bilingual labels;
-- empty = ungrouped, rendered flat exactly as before. Idempotent.

alter table modules add column if not exists section_en text not null default '';
alter table modules add column if not exists section_ar text not null default '';
