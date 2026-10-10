-- KineTech instructor feedback on answers — run AFTER 20261020_touch_fifo.sql
--
-- exam_results.feedback: per-question instructor notes keyed by question id
-- ({ "<qid>": "note" }). Shown to the student on the exam review page next
-- to their answer. Empty object = no notes. Idempotent.
alter table exam_results add column if not exists feedback jsonb not null default '{}';
