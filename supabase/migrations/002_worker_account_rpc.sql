-- ============================================================
-- 002: 근로자 계정 자동 발급 RPC + 삭제 cascade 트리거
-- ============================================================
-- 관리자가 클라이언트에서 다음을 호출:
--   create_worker_with_account(worker_data jsonb, initial_password text)
--   reset_worker_password(p_worker_id uuid, new_password text)
--
-- 비밀번호 정책:
--   - initial_password 가 비어있으면 전화번호 숫자를 그대로 사용
--   - 최소 6자 이상
--
-- 모든 함수는 SECURITY DEFINER + is_admin() 체크.
-- 함수 내부에서 auth.users 에 직접 INSERT 하므로
-- Supabase 가 auth 스키마를 바꾸면 깨질 수 있음 (CLAUDE.md 에 명시).
-- ============================================================


-- ─── 1. 근로자 + Auth 계정 생성 ───────────────────────────────
create or replace function create_worker_with_account(
  worker_data       jsonb,
  initial_password  text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_phone_digits   text;
  v_email          text;
  v_password       text;
  v_password_auto  boolean := false;
  v_auth_id        uuid;
  v_new_worker     workers;
begin
  -- 권한 체크
  if not is_admin() then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  -- 전화번호 정규화 (login_id 우선, 없으면 phone)
  v_phone_digits := regexp_replace(
    coalesce(worker_data->>'login_id', worker_data->>'phone', ''),
    '\D', '', 'g'
  );
  if length(v_phone_digits) < 8 then
    raise exception '로그인 ID(전화번호) 형식이 올바르지 않습니다.';
  end if;
  v_email := v_phone_digits || '@worker.cm.local';

  -- 비밀번호: 미입력이면 전화번호 숫자 그대로 사용
  if initial_password is null or length(trim(initial_password)) = 0 then
    v_password := v_phone_digits;
    v_password_auto := true;
  else
    v_password := initial_password;
  end if;
  if length(v_password) < 6 then
    raise exception '비밀번호는 6자 이상이어야 합니다.';
  end if;

  -- 중복 체크
  if exists (select 1 from auth.users where email = v_email) then
    raise exception '이미 발급된 로그인 계정이 있습니다. (전화번호 중복 또는 이전 등록 흔적)';
  end if;
  if exists (select 1 from workers where login_id = (worker_data->>'login_id')) then
    raise exception '중복된 로그인 ID 입니다.';
  end if;
  if exists (select 1 from workers where worker_id = (worker_data->>'worker_id')) then
    raise exception '중복된 사원번호 입니다.';
  end if;

  -- auth.users INSERT (handle_new_auth_user 트리거가 profiles 자동 생성)
  v_auth_id := gen_random_uuid();
  insert into auth.users (
    instance_id, id, aud, role,
    email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_auth_id, 'authenticated', 'authenticated',
    v_email,
    crypt(v_password, gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    '', '', '', ''
  );

  -- workers INSERT
  insert into workers (
    worker_id, name, english_name, nationality, resident_number,
    phone, address, employment_type,
    contract_date, join_date, retire_date,
    duty, department,
    monthly_base, hourly_rate, daily_rate,
    allowance_meal, allowance_transport, allowance_phone,
    housing_fee, cash_advance, custom_deductions,
    bank_name, account_no, account_holder,
    login_id, language, auth_user_id
  ) values (
    worker_data->>'worker_id',
    worker_data->>'name',
    nullif(worker_data->>'english_name', ''),
    nullif(worker_data->>'nationality', ''),
    nullif(worker_data->>'resident_number', ''),
    worker_data->>'phone',
    nullif(worker_data->>'address', ''),
    worker_data->>'employment_type',
    nullif(worker_data->>'contract_date', '')::date,
    (worker_data->>'join_date')::date,
    nullif(worker_data->>'retire_date', '')::date,
    nullif(worker_data->>'duty', ''),
    nullif(worker_data->>'department', ''),
    coalesce((worker_data->>'monthly_base')::numeric, 0),
    coalesce((worker_data->>'hourly_rate')::numeric, 0),
    coalesce((worker_data->>'daily_rate')::numeric, 0),
    nullif(worker_data->>'allowance_meal', '')::numeric,
    nullif(worker_data->>'allowance_transport', '')::numeric,
    nullif(worker_data->>'allowance_phone', '')::numeric,
    coalesce((worker_data->>'housing_fee')::numeric, 0),
    coalesce((worker_data->>'cash_advance')::numeric, 0),
    coalesce(worker_data->'custom_deductions', '[]'::jsonb),
    nullif(worker_data->>'bank_name', ''),
    nullif(worker_data->>'account_no', ''),
    coalesce(nullif(worker_data->>'account_holder', ''), worker_data->>'name'),
    worker_data->>'login_id',
    coalesce(worker_data->>'language', 'ko'),
    v_auth_id
  )
  returning * into v_new_worker;

  -- profiles.worker_id 명시적 매핑
  -- (handle_new_auth_user 트리거는 auth.users INSERT 시점에
  --  workers 행이 아직 없어서 NULL 로 남겨둠)
  update profiles
  set worker_id = v_new_worker.id
  where id = v_auth_id;

  return jsonb_build_object(
    'worker',             to_jsonb(v_new_worker),
    'email',              v_email,
    'password',           v_password,
    'password_generated', v_password_auto
  );
end;
$$;

grant execute on function create_worker_with_account(jsonb, text) to authenticated;


-- ─── 2. 비밀번호 재발급 ──────────────────────────────────────
create or replace function reset_worker_password(
  p_worker_id   uuid,
  new_password  text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_auth_id    uuid;
  v_login_id   text;
  v_password   text := new_password;
  v_auto       boolean := false;
begin
  if not is_admin() then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  select auth_user_id, login_id into v_auth_id, v_login_id
  from workers
  where id = p_worker_id;

  if v_auth_id is null then
    raise exception '근로자에 연결된 로그인 계정이 없습니다.';
  end if;

  -- 미입력이면 전화번호 숫자로 복구
  if v_password is null or length(trim(v_password)) = 0 then
    v_password := regexp_replace(v_login_id, '\D', '', 'g');
    v_auto := true;
  end if;
  if length(v_password) < 6 then
    raise exception '비밀번호는 6자 이상이어야 합니다.';
  end if;

  update auth.users
  set encrypted_password = crypt(v_password, gen_salt('bf')),
      updated_at         = now()
  where id = v_auth_id;

  return jsonb_build_object(
    'password',           v_password,
    'password_generated', v_auto
  );
end;
$$;

grant execute on function reset_worker_password(uuid, text) to authenticated;


-- ─── 3. workers DELETE → auth.users 동반 삭제 트리거 ─────────
create or replace function delete_worker_auth_account()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if old.auth_user_id is not null then
    delete from auth.users where id = old.auth_user_id;
  end if;
  return old;
end;
$$;

drop trigger if exists workers_after_delete on workers;
create trigger workers_after_delete
  after delete on workers
  for each row execute function delete_worker_auth_account();
