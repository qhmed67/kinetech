-- KineTech exam lockdown (phase 2) — run ONLY AFTER the phase-2 client
-- (which reads content exclusively via get_exam/get_my_result and writes
-- via submit_exam/save_exam/grade_writing RPCs) is deployed and confirmed
-- live. Until then, 20261034 keeps direct access working.
--
-- 1. Strip every `correct` field from stored exam/assignment JSON. RPCs
--    already strip at return time, so this changes nothing for new clients.
-- 2. Revoke direct writes on exam_results (students keep read-own).
-- 3. Revoke direct SELECT of the JSON columns on videos (admins read/write
--    through get_exam_admin/save_exam; presence via course_exam_presence).

update videos
   set exam_json = strip_exam_correct(exam_json),
       assign_json = strip_exam_correct(assign_json);

revoke insert, update, delete on exam_results from anon, authenticated;

revoke select (exam_json, assign_json) on videos from anon, authenticated;
