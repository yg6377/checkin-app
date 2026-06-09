-- ============================================================
-- 현장 노무 & 임금 정책 관리 — Supabase 스키마 v0.1
-- ============================================================
-- 실행 순서: 이 파일 → policies.sql → seed.sql
-- 필수 확장: pgcrypto (gen_random_uuid)
-- ============================================================

create extension if not exists pgcrypto;

-- ============================================================
-- 1. 역할 관리 (auth.users ↔ 앱 도메인)
-- ============================================================
-- Supabase auth.users는 인증 정보만 보유.
-- 앱에서 쓰는 "관리자/근로자" 구분과 worker_id 매핑은 profiles에서.

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        text not null check (role in ('admin', 'worker')) default 'worker',
  worker_id   uuid,  -- workers.id FK는 workers 테이블 생성 후 ALTER로 추가
  created_at  timestamptz not null default now()
);

-- 관리자 여부 헬퍼 함수 (RLS에서 재사용)
create or replace function is_admin()
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- 본인 worker_id 조회 헬퍼
create or replace function current_worker_id()
returns uuid
language sql
stable
security definer
as $$
  select worker_id from profiles where id = auth.uid();
$$;


-- ============================================================
-- 2. settings — 8개 카테고리를 JSONB 한 테이블에 보관
-- ============================================================
-- 현재 types.ts의 AllSettings 8개 키와 1:1 매핑.
-- 카테고리별 스키마는 애플리케이션 레이어에서 검증.
-- (장점: 추가 카테고리 시 마이그레이션 불필요, 현행 코드와 형태 유사)

create table settings (
  category    text primary key
              check (category in (
                'workTime', 'overtimeRules', 'dailyWorkerRules',
                'insuranceRates', 'taxRules', 'allowanceDefaults',
                'site', 'annualLeave'
              )),
  data        jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id)
);


-- ============================================================
-- 3. workers — 근로자 마스터
-- ============================================================
-- 기존 Worker 인터페이스를 정규화.
-- 주민번호는 운영 시 pgcrypto로 암호화 저장 권장 (resident_number_enc bytea).

create table workers (
  id                  uuid primary key default gen_random_uuid(),
  worker_id           text not null unique,           -- "CM-2026-001"
  auth_user_id        uuid unique references auth.users(id) on delete set null,

  -- 인적사항
  name                text not null,
  english_name        text,
  nationality         text,
  resident_number     text,                            -- TODO: 운영 전 암호화
  phone               text not null,
  address             text,

  -- 고용 계약
  employment_type     text not null
                      check (employment_type in ('salary', 'hourly', 'daily', 'business')),
  contract_date       date,
  join_date           date not null,
  retire_date         date,
  privacy_purged_at   timestamptz,
  duty                text,
  department          text,
  job                 text,

  -- 임금 단가
  monthly_base        numeric(12, 0) not null default 0,
  hourly_rate         numeric(12, 0) not null default 0,
  daily_rate          numeric(12, 0) not null default 0,

  -- 수당 재정의 (null = 회사 기본값 상속)
  allowance_meal      numeric(12, 0),
  allowance_transport numeric(12, 0),
  allowance_phone     numeric(12, 0),

  -- 정기 공제
  housing_fee         numeric(12, 0) not null default 0,
  cash_advance        numeric(12, 0) not null default 0,
  custom_deductions   jsonb not null default '[]'::jsonb,
                      -- [{ name: "가스비", amount: 35000 }, ...]

  -- 계좌
  bank_name           text,
  account_no          text,
  account_holder      text,

  -- 앱 로그인
  login_id            text not null unique,            -- 보통 전화번호
  language            text not null default 'ko' check (language in ('ko', 'en')),

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index workers_employment_type_idx on workers(employment_type);
create index workers_department_idx       on workers(department);
create index workers_job_idx              on workers(job);
create index workers_retire_date_idx      on workers(retire_date) where retire_date is null;
create index workers_retired_privacy_due_idx on workers(retire_date, privacy_purged_at) where retire_date is not null;

-- profiles → workers FK 지연 연결
alter table profiles
  add constraint profiles_worker_id_fkey
  foreign key (worker_id) references workers(id) on delete set null;


-- ============================================================
-- 4. holidays — 공휴일 + 사용자 지정 휴일
-- ============================================================

create table holidays (
  id          uuid primary key default gen_random_uuid(),
  date        date not null unique,
  name        text not null,
  type        text not null check (type in ('public', 'custom')) default 'public',
  created_at  timestamptz not null default now()
);

create index holidays_date_idx on holidays(date);


-- ============================================================
-- 5. attendance — 일별 출퇴근 (헤더)
-- ============================================================
-- 한 근로자, 한 날짜에 1행. (조출/야간연장 등 다구간은 segments로 분해)
-- check_in_*, check_out_*은 GPS 체크인 결과.

create table attendance (
  id                    uuid primary key default gen_random_uuid(),
  worker_id             uuid not null references workers(id) on delete cascade,
  work_date             date not null,

  check_in_at           timestamptz,
  check_in_lat          numeric(10, 7),
  check_in_lng          numeric(10, 7),
  check_in_distance_m   numeric(8, 2),                 -- 현장 중심점에서의 거리(m)
  check_in_within_geo   boolean,                       -- 인가 반경 내 여부

  check_out_at          timestamptz,
  check_out_lat         numeric(10, 7),
  check_out_lng         numeric(10, 7),
  check_out_distance_m  numeric(8, 2),
  check_out_within_geo  boolean,

  status                text not null default 'normal'
                        check (status in ('normal', 'late', 'early_leave', 'absent', 'holiday_work')),

  note                  text,                          -- 관리자 메모

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  unique (worker_id, work_date)
);

create index attendance_worker_date_idx on attendance(worker_id, work_date desc);
create index attendance_work_date_idx   on attendance(work_date);


-- ============================================================
-- 6. attendance_segments — 일 내 구간별 공수 산정
-- ============================================================
-- 일용직: 조출(05–08), 오후연장(17–19:30), 야간연장(19:30–22) 등 다구간.
-- 시급/월급제: 평일/연장/야간/휴일 분류.

create table attendance_segments (
  id              uuid primary key default gen_random_uuid(),
  attendance_id   uuid not null references attendance(id) on delete cascade,

  segment_type    text not null
                  check (segment_type in (
                    'standard',         -- 평일 정상 근무
                    'early_morning',    -- 조출
                    'afternoon_ot',     -- 오후 연장
                    'evening_ot',       -- 야간 연장
                    'night',            -- 심야 가산 (22:00–06:00)
                    'weekday_ot',       -- 평일 연장 (시급/월급)
                    'holiday',          -- 휴일 근무
                    'holiday_ot'        -- 휴일 연장
                  )),

  start_at        timestamptz not null,
  end_at          timestamptz not null,
  hours           numeric(6, 2) not null,              -- 산정된 시간
  man_days        numeric(5, 2) not null default 0,    -- 산정된 공수 (일용직)
  rate_multiplier numeric(4, 2) not null default 1.0,  -- 적용 가산율

  created_at      timestamptz not null default now()
);

create index attendance_segments_attendance_idx on attendance_segments(attendance_id);


-- ============================================================
-- 7. payroll_records — 월별 급여 명세 (확정본 보관)
-- ============================================================
-- SimulatorTab 결과를 확정·저장하는 곳.
-- 한 번 발행되면 settings 변경에 영향받지 않도록 snapshot_settings 보관.

create table payroll_records (
  id                  uuid primary key default gen_random_uuid(),
  worker_id           uuid not null references workers(id),
  period_year         int not null,
  period_month        int not null check (period_month between 1 and 12),

  -- 계산 결과 (payrollCalculator의 PayrollCalculationResult와 매핑)
  base_pay            numeric(12, 0) not null default 0,
  overtime_pay        numeric(12, 0) not null default 0,
  holiday_pay         numeric(12, 0) not null default 0,
  night_pay           numeric(12, 0) not null default 0,
  allowance_meal      numeric(12, 0) not null default 0,
  allowance_transport numeric(12, 0) not null default 0,
  allowance_phone     numeric(12, 0) not null default 0,
  gross_salary        numeric(12, 0) not null,

  -- 공제
  deduct_pension      numeric(12, 0) not null default 0,
  deduct_health       numeric(12, 0) not null default 0,
  deduct_care         numeric(12, 0) not null default 0,
  deduct_employment   numeric(12, 0) not null default 0,
  deduct_income_tax   numeric(12, 0) not null default 0,
  deduct_local_tax    numeric(12, 0) not null default 0,
  deduct_housing      numeric(12, 0) not null default 0,
  deduct_cash_advance numeric(12, 0) not null default 0,
  deduct_custom       jsonb not null default '[]'::jsonb,
  deduct_total        numeric(12, 0) not null default 0,

  net_pay             numeric(12, 0) not null,
  total_man_days      numeric(6, 2) not null default 0,

  -- 산정 근거
  input_snapshot      jsonb not null,                  -- 시뮬레이터 입력값
  settings_snapshot   jsonb not null,                  -- 산정 시점의 settings 8종
  status              text not null default 'draft'
                      check (status in ('draft', 'confirmed', 'paid', 'cancelled')),

  confirmed_at        timestamptz,
  confirmed_by        uuid references auth.users(id),
  created_at          timestamptz not null default now(),

  unique (worker_id, period_year, period_month)
);

create index payroll_period_idx on payroll_records(period_year, period_month);


-- ============================================================
-- 8. settings_history — 감사 로그
-- ============================================================
-- 기존 Firestore settingsHistory와 동일 컨셉.
-- 별도 트리거로 자동 기록도 가능하지만, 일단은 앱에서 명시적으로 INSERT.

create table settings_history (
  id              uuid primary key default gen_random_uuid(),
  changed_at      timestamptz not null default now(),
  changed_by      uuid references auth.users(id),
  changed_by_email text,                               -- 사용자 삭제 후에도 추적용
  category        text not null,                       -- 'workTime' | 'worker' | 'holidays' | ...
  action          text not null check (action in ('create', 'update', 'delete')),
  label           text not null,
  from_value      jsonb,
  to_value        jsonb
);

create index settings_history_changed_at_idx on settings_history(changed_at desc);
create index settings_history_category_idx   on settings_history(category);


-- ============================================================
-- 9. updated_at 자동 갱신 트리거
-- ============================================================

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger settings_touch_updated_at
  before update on settings
  for each row execute function touch_updated_at();

create trigger workers_touch_updated_at
  before update on workers
  for each row execute function touch_updated_at();

create trigger attendance_touch_updated_at
  before update on attendance
  for each row execute function touch_updated_at();


-- ============================================================
-- 10. 신규 가입자 → profiles 자동 생성 트리거
-- ============================================================
-- 이메일 도메인으로 역할을 자동 결정:
--   '@admin.cm.local'   → role = 'admin'
--   '@worker.cm.local'  → role = 'worker'
--   그 외                → role = 'worker' (fallback, 직접 검증 후 승격)
--
-- 근로자의 경우 email 의 local part (전화번호 숫자) 가 workers.login_id 의
-- 숫자와 일치하면 profiles.worker_id 까지 자동 매핑한다.

create or replace function handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_domain     text := split_part(new.email, '@', 2);
  v_local      text := split_part(new.email, '@', 1);
  v_role       text;
  v_worker_id  uuid;
begin
  v_role := case
    when v_domain = 'admin.cm.local'  then 'admin'
    when v_domain = 'worker.cm.local' then 'worker'
    else 'worker'
  end;

  if v_role = 'worker' then
    -- login_id 의 숫자만 추출해 비교 (010-1234-5678 ↔ 01012345678)
    select id into v_worker_id
    from workers
    where regexp_replace(login_id, '\D', '', 'g') = v_local
    limit 1;
  end if;

  insert into public.profiles (id, role, worker_id)
  values (new.id, v_role, v_worker_id)
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_auth_user();
