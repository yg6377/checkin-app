-- ============================================================
-- RLS 정책 v0.2 — 재실행 안전(idempotent)
-- ============================================================
-- 원칙:
--   admin  → 전체 데이터 R/W
--   worker → 본인 데이터만 R, 출퇴근 체크인/체크아웃만 W
--   인증 안 됨 → 모두 차단
-- 헬퍼: is_admin(), current_worker_id() — schema.sql 참조
-- ============================================================

-- ─── profiles ─────────────────────────────────────────────
alter table profiles enable row level security;

drop policy if exists profiles_select_self  on profiles;
drop policy if exists profiles_select_admin on profiles;
drop policy if exists profiles_update_admin on profiles;

create policy profiles_select_self
  on profiles for select
  using (id = auth.uid());

create policy profiles_select_admin
  on profiles for select
  using (is_admin());

create policy profiles_update_admin
  on profiles for update
  using (is_admin())
  with check (is_admin());


-- ─── settings ─────────────────────────────────────────────
alter table settings enable row level security;

drop policy if exists settings_select_authed on settings;
drop policy if exists settings_modify_admin  on settings;

create policy settings_select_authed
  on settings for select
  to authenticated
  using (true);

create policy settings_modify_admin
  on settings for all
  using (is_admin())
  with check (is_admin());


-- ─── workers ──────────────────────────────────────────────
alter table workers enable row level security;

drop policy if exists workers_select_self  on workers;
drop policy if exists workers_select_admin on workers;
drop policy if exists workers_modify_admin on workers;

create policy workers_select_self
  on workers for select
  using (id = current_worker_id());

create policy workers_select_admin
  on workers for select
  using (is_admin());

create policy workers_modify_admin
  on workers for all
  using (is_admin())
  with check (is_admin());


-- ─── holidays ─────────────────────────────────────────────
alter table holidays enable row level security;

drop policy if exists holidays_select_authed on holidays;
drop policy if exists holidays_modify_admin  on holidays;

create policy holidays_select_authed
  on holidays for select
  to authenticated
  using (true);

create policy holidays_modify_admin
  on holidays for all
  using (is_admin())
  with check (is_admin());


-- ─── attendance ───────────────────────────────────────────
alter table attendance enable row level security;

drop policy if exists attendance_select_self  on attendance;
drop policy if exists attendance_select_admin on attendance;
drop policy if exists attendance_insert_self  on attendance;
drop policy if exists attendance_update_self  on attendance;
drop policy if exists attendance_modify_admin on attendance;

create policy attendance_select_self
  on attendance for select
  using (worker_id = current_worker_id());

create policy attendance_select_admin
  on attendance for select
  using (is_admin());

create policy attendance_insert_self
  on attendance for insert
  with check (worker_id = current_worker_id());

create policy attendance_update_self
  on attendance for update
  using (worker_id = current_worker_id())
  with check (worker_id = current_worker_id());

create policy attendance_modify_admin
  on attendance for all
  using (is_admin())
  with check (is_admin());


-- ─── attendance_segments ──────────────────────────────────
alter table attendance_segments enable row level security;

drop policy if exists attendance_segments_select_self on attendance_segments;
drop policy if exists attendance_segments_admin       on attendance_segments;

create policy attendance_segments_select_self
  on attendance_segments for select
  using (
    exists (
      select 1 from attendance a
      where a.id = attendance_segments.attendance_id
        and a.worker_id = current_worker_id()
    )
  );

create policy attendance_segments_admin
  on attendance_segments for all
  using (is_admin())
  with check (is_admin());


-- ─── payroll_records ──────────────────────────────────────
alter table payroll_records enable row level security;

drop policy if exists payroll_select_self on payroll_records;
drop policy if exists payroll_admin       on payroll_records;

create policy payroll_select_self
  on payroll_records for select
  using (
    worker_id = current_worker_id()
    and status in ('confirmed', 'paid')
  );

create policy payroll_admin
  on payroll_records for all
  using (is_admin())
  with check (is_admin());


-- ─── settings_history ─────────────────────────────────────
alter table settings_history enable row level security;

drop policy if exists settings_history_admin on settings_history;

create policy settings_history_admin
  on settings_history for all
  using (is_admin())
  with check (is_admin());
