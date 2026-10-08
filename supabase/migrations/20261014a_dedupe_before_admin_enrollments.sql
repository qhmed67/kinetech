-- KineTech dedupe helper — RUN THIS BEFORE 20261014_admin_enrollments.sql
--
-- The v8 migration installs UNIQUE constraints on national_id + phone and
-- aborts on existing duplicates. This script inspects first, then deletes
-- only the extras (keeps the earliest account per duplicated value).
-- Safe to run multiple times: step 3+ affect zero rows once clean.

-- ============ 1. INSPECT: show every duplicated value ============
select national_id, count(*), array_agg(email) as emails
from profiles where national_id is not null
group by national_id having count(*) > 1;

select phone, count(*), array_agg(email) as emails
from profiles where phone is not null
group by phone having count(*) > 1;

-- ============ 2. VERIFY the rows above are throwaways, then run below ============

-- Keep the earliest profile per national_id, delete the rest.
-- (Cascades their tracks/views/grant rows — intended for test duplicates.)
delete from profiles
where id in (
  select id from (
    select id, row_number() over (partition by national_id order by created_at, id) as rn
    from profiles where national_id is not null
  ) t where rn > 1
);

-- Keep the earliest profile per phone, delete the rest.
delete from profiles
where id in (
  select id from (
    select id, row_number() over (partition by phone order by created_at, id) as rn
    from profiles where phone is not null
  ) t where rn > 1
);

-- ============ 3. CONFIRM clean: both queries must return zero rows ============
select national_id, count(*)
from profiles where national_id is not null
group by national_id having count(*) > 1;

select phone, count(*)
from profiles where phone is not null
group by phone having count(*) > 1;
