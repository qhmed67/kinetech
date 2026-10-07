-- KineTech initial migration — Supabase Postgres
-- Covers: users/tracks, courses+i18n, modules/videos, enrollments w/ status,
-- video_views w/ 3-play cap, services/posts, reviews, bac JSONB doc.
-- Apply: supabase db push  (or paste into Supabase SQL editor)

-- ============ extensions ============
create extension if not exists citext;

-- ============ enums ============
do $$ begin create type user_role as enum ('student','admin'); exception when duplicate_object then null; end $$;
do $$ begin create type track_id as enum ('courses','marketing','programming','design'); exception when duplicate_object then null; end $$;
do $$ begin create type course_cat as enum ('tech','other'); exception when duplicate_object then null; end $$;
do $$ begin create type grade_lvl as enum ('sec1','sec2'); exception when duplicate_object then null; end $$;
do $$ begin create type enrollment_status as enum ('pending','approved'); exception when duplicate_object then null; end $$;

-- ============ profiles (id = auth.users.id) ============
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext unique not null,
  name text not null,
  phone text,
  national_id char(14) check (national_id ~ '^[0-9]{14}$'),
  grade grade_lvl,
  role user_role not null default 'student',
  created_at timestamptz not null default now()
);

create table if not exists user_tracks (
  user_id uuid not null references profiles(id) on delete cascade,
  track track_id not null,
  primary key (user_id, track)
);

-- ============ courses ============
create table if not exists instructors (
  id uuid primary key default gen_random_uuid(),
  name_en text not null, name_ar text not null,
  spec_en text, spec_ar text, bio_en text, bio_ar text
);

create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  cat course_cat not null default 'tech',
  is_bac boolean not null default false,
  seats_n int not null default 6 check (seats_n >= 0),
  price_cents int, -- null = contact for pricing
  photo_card_url text,
  photo_detail_url text, -- external URLs only, never base64
  instructor_id uuid references instructors(id),
  created_at timestamptz not null default now()
);

create table if not exists course_translations (
  course_id uuid not null references courses(id) on delete cascade,
  lang char(2) not null check (lang in ('en','ar')),
  name text not null,
  designation text, quote text,
  duration text, lessons text, schedule text, level text,
  seats_label text, cta_label text,
  outcomes text[] not null default '{}',
  primary key (course_id, lang)
);

create table if not exists modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  sort_order int not null,
  unique (course_id, sort_order)
);

create table if not exists module_translations (
  module_id uuid not null references modules(id) on delete cascade,
  lang char(2) not null check (lang in ('en','ar')),
  title text not null,
  description text,
  primary key (module_id, lang)
);

-- 1 video per module sort_order; src = YouTube unlisted / Cloudinary external URL
create table if not exists videos (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references courses(id) on delete cascade,
  module_id uuid not null references modules(id) on delete cascade,
  sort_order int not null,
  src_url text not null,
  mins int not null default 10,
  assign_url text,
  exam_url text,
  unique (course_id, sort_order)
);

-- ============ enrollments (WhatsApp manual pay -> pending, admin approves) ============
create table if not exists enrollments (
  user_id uuid not null references profiles(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  status enrollment_status not null default 'pending',
  enrolled_at timestamptz not null default now(),
  decided_at timestamptz,
  primary key (user_id, course_id)
);

-- ============ progress: strict 0..3 cap ============
create table if not exists video_views (
  user_id uuid not null references profiles(id) on delete cascade,
  video_id uuid not null references videos(id) on delete cascade,
  views_count smallint not null default 0 check (views_count between 0 and 3),
  done boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, video_id)
);

-- ============ services / posts / process / reviews ============
create table if not exists services (
  slug text primary key check (slug in ('marketing','software','design'))
);

create table if not exists service_translations (
  service_slug text not null references services(slug) on delete cascade,
  lang char(2) not null check (lang in ('en','ar')),
  title text not null,
  description text,
  items text[] not null default '{}',
  gets text[] not null default '{}',
  primary key (service_slug, lang)
);

create table if not exists service_posts (
  id uuid primary key default gen_random_uuid(),
  service_slug text not null references services(slug) on delete cascade,
  lang char(2) not null check (lang in ('en','ar')),
  title text,
  body text,
  image_url text,
  link text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists process_steps (
  sort_order int primary key,
  title_en text, title_ar text,
  desc_en text, desc_ar text
);

create table if not exists reviews (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role_en text, role_ar text,
  quote_en text not null, quote_ar text not null,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============ baccalaureate: single JSONB doc per lang ============
create table if not exists bac_content (
  lang char(2) primary key check (lang in ('en','ar')),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- ============ indexes (lean queries, no SELECT *) ============
create index if not exists idx_course_trans_lang on course_translations (lang);
create index if not exists idx_courses_bac on courses (is_bac) where is_bac;
create index if not exists idx_courses_cat on courses (cat);
create index if not exists idx_modules_course_pos on modules (course_id, sort_order);
create index if not exists idx_videos_course_pos on videos (course_id, sort_order);
create index if not exists idx_views_video on video_views (video_id);
create index if not exists idx_enroll_course on enrollments (course_id);
create index if not exists idx_enroll_status on enrollments (status);
create index if not exists idx_posts_svc_lang_pos on service_posts (service_slug, lang, sort_order);

-- ============ seed static rows ============
insert into services (slug) values ('marketing'),('software'),('design')
on conflict (slug) do nothing;

-- ============ helpers ============
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- ============ ROLE LOCK: students can never change their own role ============
-- RLS alone can't compare OLD/NEW, so a trigger is the hard backstop.
create or replace function lock_role_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role is distinct from new.role and not is_admin() then
    raise exception 'role change denied';
  end if;
  return new;
end $$;

drop trigger if exists trg_lock_role on profiles;
create trigger trg_lock_role before update of role on profiles
for each row execute function lock_role_change();

-- ============ watch RPCs: 3-view cap + sequential unlock, server-side ============
create or replace function get_watch_state(p_slug text, p_lang char(2))
returns table (
  video_id uuid, sort_order int, title text, description text,
  src_url text, mins int, assign_url text, exam_url text,
  views_count smallint, done boolean, unlocked boolean, views_left smallint
)
language plpgsql stable security definer set search_path = public as $$
declare v_course uuid; v_user uuid := auth.uid();
begin
  select id into v_course from courses where slug = p_slug;
  if v_course is null then return; end if;
  -- must hold an APPROVED enrollment (or be admin) to see URLs
  if not is_admin() and not exists (
    select 1 from enrollments
    where user_id = v_user and course_id = v_course and status = 'approved'
  ) then
    raise exception 'enrollment required';
  end if;
  return query
  with v as (
    select v2.id, v2.sort_order, v2.src_url, v2.mins, v2.assign_url, v2.exam_url,
           mt.title, mt.description,
           coalesce(vv.views_count, 0) as vc, coalesce(vv.done, false) as dn
    from videos v2
    join modules m on m.id = v2.module_id
    left join module_translations mt on mt.module_id = m.id and mt.lang = p_lang
    left join video_views vv on vv.video_id = v2.id and vv.user_id = v_user
    where v2.course_id = v_course
  )
  select v.id, v.sort_order, v.title, v.description, v.src_url, v.mins,
         v.assign_url, v.exam_url, v.vc, v.dn,
         (v.sort_order = 0 or exists (
            select 1 from videos pv
            left join video_views pvv on pvv.video_id = pv.id and pvv.user_id = v_user
            where pv.course_id = v_course and pv.sort_order = v.sort_order - 1
              and (coalesce(pvv.done,false) or coalesce(pvv.views_count,0) >= 3)
         )) as unlocked,
         greatest(0, 3 - v.vc)::smallint as views_left
  from v order by v.sort_order;
end $$;

create or replace function record_play(p_video uuid)
returns table (views_count smallint, views_left smallint)
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_course uuid; v_pos int; v_vc smallint;
begin
  select course_id, sort_order into v_course, v_pos from videos where id = p_video;
  if v_course is null then raise exception 'video not found'; end if;
  if not is_admin() and not exists (
    select 1 from enrollments
    where user_id = v_user and course_id = v_course and status = 'approved'
  ) then raise exception 'enrollment required'; end if;
  if v_pos > 0 and not exists (
    select 1 from videos pv
    left join video_views pvv on pvv.video_id = pv.id and pvv.user_id = v_user
    where pv.course_id = v_course and pv.sort_order = v_pos - 1
      and (coalesce(pvv.done,false) or coalesce(pvv.views_count,0) >= 3)
  ) then raise exception 'previous lesson locked'; end if;
  insert into video_views (user_id, video_id, views_count)
  values (v_user, p_video, 1)
  on conflict (user_id, video_id) do update
    set views_count = least(3, video_views.views_count + 1), updated_at = now()
  returning video_views.views_count into v_vc;
  -- re-read post-upsert value (conflict path returns old row otherwise)
  select views_count into v_vc from video_views where user_id = v_user and video_id = p_video;
  return query select v_vc, greatest(0, 3 - v_vc)::smallint;
end $$;

create or replace function complete_video(p_video uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_course uuid;
begin
  select course_id into v_course from videos where id = p_video;
  if v_course is null then raise exception 'video not found'; end if;
  if not is_admin() and not exists (
    select 1 from enrollments
    where user_id = v_user and course_id = v_course and status = 'approved'
  ) then raise exception 'enrollment required'; end if;
  insert into video_views (user_id, video_id, views_count, done)
  values (v_user, p_video, 0, true)
  on conflict (user_id, video_id) do update set done = true, updated_at = now();
end $$;

-- ============ RLS ============
alter table profiles enable row level security;
alter table user_tracks enable row level security;
alter table courses enable row level security;
alter table course_translations enable row level security;
alter table instructors enable row level security;
alter table modules enable row level security;
alter table module_translations enable row level security;
alter table videos enable row level security;
alter table enrollments enable row level security;
alter table video_views enable row level security;
alter table services enable row level security;
alter table service_translations enable row level security;
alter table service_posts enable row level security;
alter table process_steps enable row level security;
alter table reviews enable row level security;
alter table bac_content enable row level security;

-- public catalog reads (lean, no src_url here — URLs only via get_watch_state)
drop policy if exists "public read courses" on courses;
create policy "public read courses" on courses for select using (true);
drop policy if exists "public read course_translations" on course_translations;
create policy "public read course_translations" on course_translations for select using (true);
drop policy if exists "public read instructors" on instructors;
create policy "public read instructors" on instructors for select using (true);
drop policy if exists "public read modules" on modules;
create policy "public read modules" on modules for select using (true);
drop policy if exists "public read module_translations" on module_translations;
create policy "public read module_translations" on module_translations for select using (true);
-- videos: metadata public (sort_order/mins) but src_url hidden from anon:
-- simplest v1: allow select only to authenticated enrolled/admin; player uses RPC anyway.
drop policy if exists "enrolled read videos" on videos;
create policy "enrolled read videos" on videos for select
using (is_admin() or exists (
  select 1 from enrollments e where e.user_id = auth.uid()
    and e.course_id = videos.course_id and e.status = 'approved'));

drop policy if exists "public read services" on services;
create policy "public read services" on services for select using (true);
drop policy if exists "public read service_translations" on service_translations;
create policy "public read service_translations" on service_translations for select using (true);
drop policy if exists "public read service_posts" on service_posts;
create policy "public read service_posts" on service_posts for select using (true);
drop policy if exists "public read process" on process_steps;
create policy "public read process" on process_steps for select using (true);
drop policy if exists "public read reviews" on reviews;
create policy "public read reviews" on reviews for select using (approved = true);
drop policy if exists "public read bac" on bac_content;
create policy "public read bac" on bac_content for select using (true);

-- profiles: read own + admins read all; insert own; update own EXCEPT role (trigger backs it);
-- role column writable only via admin path (service role / is_admin check in WITH CHECK).
drop policy if exists "read own profile" on profiles;
create policy "read own profile" on profiles for select
using (auth.uid() = id or is_admin());
drop policy if exists "insert own profile" on profiles;
create policy "insert own profile" on profiles for insert
with check (auth.uid() = id);
drop policy if exists "update own profile no role" on profiles;
create policy "update own profile no role" on profiles for update
using (auth.uid() = id or is_admin())
with check (
  is_admin() -- admins may set any role
  or (
    auth.uid() = id
    and role = (select p.role from profiles p where p.id = auth.uid())
  ));
drop policy if exists "admin all profiles" on profiles;
create policy "admin all profiles" on profiles for all
using (is_admin()) with check (is_admin());

-- user_tracks: owner read/insert own (signup default), delete own; admin all.
drop policy if exists "own tracks" on user_tracks;
create policy "own tracks" on user_tracks for select using (user_id = auth.uid() or is_admin());
drop policy if exists "insert own tracks" on user_tracks;
create policy "insert own tracks" on user_tracks for insert with check (user_id = auth.uid() or is_admin());
drop policy if exists "delete own tracks" on user_tracks;
create policy "delete own tracks" on user_tracks for delete using (user_id = auth.uid() or is_admin());

-- enrollments: user reads own, inserts own as pending only; admin decides.
drop policy if exists "read own enrollments" on enrollments;
create policy "read own enrollments" on enrollments for select
using (user_id = auth.uid() or is_admin());
drop policy if exists "request enrollment pending" on enrollments;
create policy "request enrollment pending" on enrollments for insert
with check (user_id = auth.uid() and status = 'pending');
drop policy if exists "admin manage enrollments" on enrollments;
create policy "admin manage enrollments" on enrollments for all
using (is_admin()) with check (is_admin());

-- video_views: owner read; writes ONLY via RPC (no direct insert/update/delete for students).
drop policy if exists "read own views" on video_views;
create policy "read own views" on video_views for select
using (user_id = auth.uid() or is_admin());
drop policy if exists "admin manage views" on video_views;
create policy "admin manage views" on video_views for all
using (is_admin()) with check (is_admin());

-- admin write on catalog (students read-only via public policies above).
drop policy if exists "admin write courses" on courses;
create policy "admin write courses" on courses for all using (is_admin()) with check (is_admin());
drop policy if exists "admin write course_translations" on course_translations;
create policy "admin write course_translations" on course_translations for all using (is_admin()) with check (is_admin());
drop policy if exists "admin write instructors" on instructors;
create policy "admin write instructors" on instructors for all using (is_admin()) with check (is_admin());
drop policy if exists "admin write modules" on modules;
create policy "admin write modules" on modules for all using (is_admin()) with check (is_admin());
drop policy if exists "admin write module_translations" on module_translations;
create policy "admin write module_translations" on module_translations for all using (is_admin()) with check (is_admin());
drop policy if exists "admin write videos" on videos;
create policy "admin write videos" on videos for all using (is_admin()) with check (is_admin());
drop policy if exists "admin write services" on services;
create policy "admin write services" on services for all using (is_admin()) with check (is_admin());
drop policy if exists "admin write service_translations" on service_translations;
create policy "admin write service_translations" on service_translations for all using (is_admin()) with check (is_admin());
drop policy if exists "admin write service_posts" on service_posts;
create policy "admin write service_posts" on service_posts for all using (is_admin()) with check (is_admin());
drop policy if exists "admin write process" on process_steps;
create policy "admin write process" on process_steps for all using (is_admin()) with check (is_admin());
drop policy if exists "admin write reviews" on reviews;
create policy "admin write reviews" on reviews for all using (is_admin()) with check (is_admin());
drop policy if exists "admin write bac" on bac_content;
create policy "admin write bac" on bac_content for all using (is_admin()) with check (is_admin());
