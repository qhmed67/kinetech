-- KineTech exam key separation (phase 2) — additive, safe to run first.
-- Client deploy using these RPCs must go live BEFORE 20261035 (which
-- strips `correct` from stored JSON and revokes direct writes).
-- Run order: this file -> deploy -> 20261035.
--
-- Model:
--   exam_keys(video_id, kind, key) holds {questionId: correctIndex} for
--   choice questions. RLS enabled, NO policies (security-definer only).
--   exam_json/assign_json keep serving questions; every RPC below strips
--   `correct` at return time, so output is key-free whether or not the
--   stored rows were stripped yet.
-- Review rule (hard): correct answers are revealed ONLY for 'graded'
-- results (no further attempts allowed). Pending results and resubmits
-- never see the key.

create table if not exists exam_keys (
  video_id uuid not null references videos(id) on delete cascade,
  kind text not null check (kind in ('exam', 'assignment')),
  key jsonb not null default '{}'::jsonb,
  primary key (video_id, kind)
);
alter table exam_keys enable row level security;
-- NO policies: only security-definer functions read this.

-- Strip helper: drops every `correct` field from questions, stable order.
create or replace function strip_exam_correct(j jsonb)
returns jsonb language sql immutable set search_path = public as $$
  select case
    when j is null or not (j ? 'questions') then j
    else jsonb_set(j, '{questions}', (
      select coalesce(jsonb_agg(t.q - 'correct' order by t.ord), '[]'::jsonb)
      from jsonb_array_elements(coalesce(j->'questions', '[]'::jsonb))
        with ordinality as t(q, ord)
    ))
  end
$$;

-- Backfill keys from existing content (choice questions with a set index).
insert into exam_keys (video_id, kind, key)
select v.id, 'exam', (
  select coalesce(jsonb_object_agg(t.q->>'id', (t.q->>'correct')::int), '{}'::jsonb)
  from jsonb_array_elements(coalesce(v.exam_json->'questions', '[]'::jsonb)) as t(q)
  where t.q->>'kind' = 'choice'
    and t.q->>'id' is not null
    and (t.q->>'correct') ~ '^[0-9]+$'
)
from videos v
where v.exam_json is not null
  and exists (
    select 1 from jsonb_array_elements(coalesce(v.exam_json->'questions', '[]'::jsonb)) as t(q)
    where t.q->>'kind' = 'choice' and (t.q->>'correct') ~ '^[0-9]+$'
  )
on conflict (video_id, kind) do update set key = excluded.key;

insert into exam_keys (video_id, kind, key)
select v.id, 'assignment', (
  select coalesce(jsonb_object_agg(t.q->>'id', (t.q->>'correct')::int), '{}'::jsonb)
  from jsonb_array_elements(coalesce(v.assign_json->'questions', '[]'::jsonb)) as t(q)
  where t.q->>'kind' = 'choice'
    and t.q->>'id' is not null
    and (t.q->>'correct') ~ '^[0-9]+$'
)
from videos v
where v.assign_json is not null
  and exists (
    select 1 from jsonb_array_elements(coalesce(v.assign_json->'questions', '[]'::jsonb)) as t(q)
    where t.q->>'kind' = 'choice' and (t.q->>'correct') ~ '^[0-9]+$'
  )
on conflict (video_id, kind) do update set key = excluded.key;

-- Shared gate: enrolled (or admin) + lesson open. Mirrors the UX rule that
-- exams surface only once the lesson is actually open for the student.
create or replace function exam_gate_ok(p_video uuid, p_user uuid)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_course uuid; v_pos int;
begin
  select v.course_id, v.sort_order into v_course, v_pos
    from videos v where v.id = p_video;
  if v_course is null then return false; end if;
  if exists (select 1 from profiles p where p.id = p_user and p.role = 'admin') then
    return true;
  end if;
  if not exists (select 1 from enrollments e where e.user_id = p_user and e.course_id = v_course) then
    return false;
  end if;
  if v_pos = 0 then return true; end if;
  return exists (
    select 1 from video_views vv
     where vv.user_id = p_user and vv.video_id = p_video and coalesce(vv.unlocked, false)
  );
end $$;

-- Student content: questions WITHOUT correct, or null when none.
create or replace function get_exam(p_video uuid, p_kind text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_col text; v_raw jsonb;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  if p_kind not in ('exam', 'assignment') then raise exception 'bad kind'; end if;
  if exists (select 1 from profiles p where p.id = v_user and coalesce(p.banned, false)) then
    raise exception 'suspended';
  end if;
  if not exam_gate_ok(p_video, v_user) then raise exception 'locked'; end if;
  v_col := case when p_kind = 'exam' then 'exam_json' else 'assign_json' end;
  execute format('select %I from videos where id = $1', v_col) using p_video into v_raw;
  if v_raw is null then return null; end if;
  v_raw := strip_exam_correct(v_raw);
  if v_raw->'questions' is null or jsonb_array_length(coalesce(v_raw->'questions', '[]'::jsonb)) = 0 then
    return null;
  end if;
  return v_raw;
end $$;

-- Attempt + questions + review in one gated call. Review reveals correct
-- indices ONLY for graded (final, no resubmits); pending shows picks only.
create or replace function get_my_result(p_video uuid, p_kind text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_content jsonb;
  v_row record;
  v_key jsonb := '{}'::jsonb;
  v_review jsonb;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  if p_kind not in ('exam', 'assignment') then raise exception 'bad kind'; end if;
  v_content := get_exam(p_video, p_kind);
  select r.answers, r.choice_score, r.choice_total, r.writing_score,
         r.writing_total, r.status, r.feedback
    into v_row
    from exam_results r
   where r.user_id = v_user and r.video_id = p_video and r.kind = p_kind;
  if v_row is null then
    return jsonb_build_object(
      'result', null,
      'questions', coalesce(v_content, '{"title":"","questions":[]}'::jsonb),
      'review', null
    );
  end if;
  if v_row.status = 'graded' then
    select k.key into v_key from exam_keys k
     where k.video_id = p_video and k.kind = p_kind;
    v_key := coalesce(v_key, '{}'::jsonb);
  end if;
  select jsonb_agg(jsonb_build_object(
      'id', q->>'id',
      'picked', (v_row.answers)->>(q->>'id'),
      'right', case
        when q->>'kind' <> 'choice' then null
        when v_row.status <> 'graded' then null
        when (v_row.answers->>(q->>'id')) ~ '^-?[0-9]+$'
         and (v_key->>(q->>'id')) ~ '^-?[0-9]+$' then
          ((v_row.answers->>(q->>'id'))::int = (v_key->>(q->>'id'))::int)
        else false
      end,
      'correctIndex', case
        when q->>'kind' <> 'choice' or v_row.status <> 'graded' then null
        when (v_key->>(q->>'id')) ~ '^-?[0-9]+$' then (v_key->>(q->>'id'))::int
        else null
      end
    ) order by ord)
    into v_review
    from jsonb_array_elements(coalesce(v_content->'questions', '[]'::jsonb))
      with ordinality as t(q, ord);
  return jsonb_build_object(
    'result', jsonb_build_object(
      'answers', coalesce(v_row.answers, '{}'::jsonb),
      'choice_score', coalesce(v_row.choice_score, 0),
      'choice_total', coalesce(v_row.choice_total, 0),
      'writing_score', v_row.writing_score,
      'writing_total', coalesce(v_row.writing_total, 0),
      'status', v_row.status,
      'feedback', coalesce(v_row.feedback, '{}'::jsonb)
    ),
    'questions', coalesce(v_content, '{"title":"","questions":[]}'::jsonb),
    'review', coalesce(v_review, '[]'::jsonb)
  );
end $$;

-- Server-side grading. Scores come from exam_keys, never the client.
-- Graded rows reject resubmits; pending rows resubmit freely (key-free).
create or replace function submit_exam(p_video uuid, p_kind text, p_answers jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_content jsonb;
  v_key jsonb := '{}'::jsonb;
  v_q record;
  v_choice_score int := 0;
  v_choice_total int := 0;
  v_writing_total int := 0;
  v_status text;
  v_existing text;
begin
  if v_user is null then raise exception 'not signed in'; end if;
  if p_kind not in ('exam', 'assignment') then raise exception 'bad kind'; end if;
  if exists (select 1 from profiles p where p.id = v_user and coalesce(p.banned, false)) then
    raise exception 'suspended';
  end if;
  if not exam_gate_ok(p_video, v_user) then raise exception 'locked'; end if;
  select k.key into v_key from exam_keys k
   where k.video_id = p_video and k.kind = p_kind;
  v_key := coalesce(v_key, '{}'::jsonb);
  select case when p_kind = 'exam' then v.exam_json else v.assign_json end
    into v_content from videos v where v.id = p_video;
  if v_content is null then raise exception 'no exam'; end if;

  select r.status into v_existing from exam_results r
   where r.user_id = v_user and r.video_id = p_video and r.kind = p_kind;
  if v_existing = 'graded' then raise exception 'already graded'; end if;

  -- Scores come from exam_keys only. Non-numeric picks never match (guarded
  -- cast); missing keys score zero — same semantics as content without keys.
  for v_q in select t.q from jsonb_array_elements(coalesce(v_content->'questions', '[]'::jsonb)) as t(q)
  loop
    if coalesce(v_q.q->>'prompt', '') = '' then continue; end if;
    if (v_q.q->>'kind') = 'writing' then
      v_writing_total := v_writing_total + 1;
    else
      v_choice_total := v_choice_total + 1;
      if (p_answers->>(v_q.q->>'id')) ~ '^-?[0-9]+$'
         and (p_answers->>(v_q.q->>'id'))::int = coalesce((v_key->>(v_q.q->>'id'))::int, -1) then
        v_choice_score := v_choice_score + 1;
      end if;
    end if;
  end loop;
  v_status := case when v_writing_total > 0 then 'pending' else 'graded' end;

  insert into exam_results (user_id, video_id, kind, answers, choice_score,
    choice_total, writing_score, writing_total, status, updated_at)
  values (v_user, p_video, p_kind, coalesce(p_answers, '{}'::jsonb),
    v_choice_score, v_choice_total, null, v_writing_total, v_status, now())
  on conflict (user_id, video_id, kind) do update set
    answers = excluded.answers,
    choice_score = excluded.choice_score,
    choice_total = excluded.choice_total,
    writing_score = null,
    writing_total = excluded.writing_total,
    status = excluded.status,
    updated_at = now();

  return get_my_result(p_video, p_kind);
end $$;

-- Instructor grading (admin only). Students can never touch these columns
-- again after 20261035 revokes their write privileges.
create or replace function grade_writing(
  p_user uuid, p_video uuid, p_kind text, p_score int, p_notes jsonb
)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only'; end if;
  if p_kind not in ('exam', 'assignment') then raise exception 'bad kind'; end if;
  update exam_results
     set writing_score = coalesce(p_score, 0),
         status = 'graded',
         feedback = coalesce(p_notes, '{}'::jsonb),
         updated_at = now()
   where user_id = p_user and video_id = p_video and kind = p_kind;
end $$;

-- Admin exam editor: full content IN (with key), split storage.
-- Admin key view: content OUT (stripped) + key, merged client-side.
create or replace function save_exam(p_video uuid, p_kind text, p_content jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare v_key jsonb;
begin
  if not is_admin() then raise exception 'admin only'; end if;
  if p_kind not in ('exam', 'assignment') then raise exception 'bad kind'; end if;
  select coalesce(jsonb_object_agg(t.q->>'id', (t.q->>'correct')::int), '{}'::jsonb)
    into v_key
    from jsonb_array_elements(coalesce(p_content->'questions', '[]'::jsonb)) as t(q)
   where t.q->>'kind' = 'choice'
     and t.q->>'id' is not null
     and (t.q->>'correct') ~ '^[0-9]+$';
  if p_kind = 'exam' then
    update videos set exam_json = strip_exam_correct(p_content) where id = p_video;
  else
    update videos set assign_json = strip_exam_correct(p_content) where id = p_video;
  end if;
  insert into exam_keys (video_id, kind, key)
  values (p_video, p_kind, coalesce(v_key, '{}'::jsonb))
  on conflict (video_id, kind) do update set key = excluded.key;
end $$;

create or replace function get_exam_admin(p_video uuid, p_kind text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_col text; v_content jsonb; v_key jsonb;
begin
  if not is_admin() then raise exception 'admin only'; end if;
  if p_kind not in ('exam', 'assignment') then raise exception 'bad kind'; end if;
  v_col := case when p_kind = 'exam' then 'exam_json' else 'assign_json' end;
  execute format('select %I from videos where id = $1', v_col) using p_video into v_content;
  select k.key into v_key from exam_keys k
   where k.video_id = p_video and k.kind = p_kind;
  return jsonb_build_object(
    'content', strip_exam_correct(coalesce(v_content, '{"title":"","questions":[]}'::jsonb)),
    'key', coalesce(v_key, '{}'::jsonb)
  );
end $$;

-- Presence per course video (has questions?), no content, no key.
-- Replaces the client-side exam_json select that lockdown revokes.
create or replace function course_exam_presence(p_course uuid)
returns table (video_id uuid, sort_order int, has_exam boolean, has_assignment boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from profiles p where p.id = v_user and p.role = 'admin')
     and not exists (select 1 from enrollments e where e.user_id = v_user and e.course_id = p_course) then
    raise exception 'not enrolled';
  end if;
  return query
    select v.id, v.sort_order,
      exists (select 1 from jsonb_array_elements(coalesce(v.exam_json->'questions', '[]'::jsonb)) as t(q)
               where coalesce(t.q->>'prompt', '') <> ''),
      exists (select 1 from jsonb_array_elements(coalesce(v.assign_json->'questions', '[]'::jsonb)) as t(q)
               where coalesce(t.q->>'prompt', '') <> '')
      from videos v
     where v.course_id = p_course
     order by v.sort_order;
end $$;
