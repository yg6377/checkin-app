-- ============================================================
-- 008: 외국인 근로자 정보 필드 + 계약만료일
-- ============================================================
-- 배경:
--   외국인 근로자 비중이 높아 비자/여권/본국 연락처 등 추가 정보가 필요.
--   계약만료일은 내·외국인 공통(계약직·일용직 포함), 나머지는 외국인 전용.
--
-- 또한 create_worker_with_account 를 함께 갱신한다:
--   - 신규 컬럼 8종을 INSERT 에 반영
--   - 007 버전이 current_setting('app.encryption_key') 를 쓰면서
--     004 의 Vault 전환(app_encryption_key())을 덮어써 버린 문제를 바로잡음
--     (Supabase 클라우드에선 current_setting 으로 키를 못 읽어 주민번호가
--      암호화되지 않은 채 빈 값으로 저장되던 상태)
-- ============================================================


-- ─── 1. 컬럼 추가 ────────────────────────────────────────────
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS is_foreigner        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contract_end_date   date,    -- 공통: 계약 만료일
  ADD COLUMN IF NOT EXISTS visa_type           text,    -- 외국인: 비자 종류
  ADD COLUMN IF NOT EXISTS passport_expiry     date,    -- 외국인: 여권 만료일
  ADD COLUMN IF NOT EXISTS home_address        text,    -- 외국인: 본국 주소
  ADD COLUMN IF NOT EXISTS home_contact        text,    -- 외국인: 본국 연락처
  ADD COLUMN IF NOT EXISTS emergency_name      text,    -- 외국인: 본국 연락 가능 이름
  ADD COLUMN IF NOT EXISTS emergency_relation  text;    -- 외국인: 관계


-- ─── 2. 만료 알림 조회용 인덱스 ──────────────────────────────
CREATE INDEX IF NOT EXISTS workers_contract_end_idx   ON workers(contract_end_date);
CREATE INDEX IF NOT EXISTS workers_passport_expiry_idx ON workers(passport_expiry);


-- ─── 3. create_worker_with_account 갱신 ──────────────────────
--        (007 기준 + 외국인 필드 + Vault 키)
CREATE OR REPLACE FUNCTION create_worker_with_account(
  worker_data       jsonb,
  initial_password  text default null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_phone_digits   text;
  v_email          text;
  v_password       text;
  v_password_auto  boolean := false;
  v_auth_id        uuid;
  v_new_worker     workers;
  v_resident_raw   text;
  v_resident_enc   bytea;
  v_key            text;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다.';
  END IF;

  v_phone_digits := regexp_replace(
    coalesce(worker_data->>'login_id', worker_data->>'phone', ''),
    '\D', '', 'g'
  );
  IF length(v_phone_digits) < 8 THEN
    RAISE EXCEPTION '로그인 ID(전화번호) 형식이 올바르지 않습니다.';
  END IF;
  v_email := v_phone_digits || '@worker.cm.local';

  IF initial_password IS NULL OR length(trim(initial_password)) = 0 THEN
    v_password := v_phone_digits;
    v_password_auto := true;
  ELSE
    v_password := initial_password;
  END IF;
  IF length(v_password) < 6 THEN
    RAISE EXCEPTION '비밀번호는 6자 이상이어야 합니다.';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = v_email) THEN
    RAISE EXCEPTION '이미 발급된 로그인 계정이 있습니다. (전화번호 중복 또는 이전 등록 흔적)';
  END IF;
  IF EXISTS (SELECT 1 FROM workers WHERE login_id = (worker_data->>'login_id')) THEN
    RAISE EXCEPTION '중복된 로그인 ID 입니다.';
  END IF;
  IF EXISTS (SELECT 1 FROM workers WHERE worker_id = (worker_data->>'worker_id')) THEN
    RAISE EXCEPTION '중복된 사원번호 입니다.';
  END IF;

  -- 주민/외국인등록번호 암호화 (Vault 키)
  v_resident_raw := nullif(trim(coalesce(worker_data->>'resident_number', '')), '');
  v_key := app_encryption_key();
  IF v_resident_raw IS NOT NULL AND v_key IS NOT NULL AND length(v_key) >= 16 THEN
    v_resident_enc := pgp_sym_encrypt(v_resident_raw, v_key);
  END IF;

  v_auth_id := gen_random_uuid();
  INSERT INTO auth.users (
    instance_id, id, aud, role,
    email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    v_auth_id, 'authenticated', 'authenticated',
    v_email,
    crypt(v_password, gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    '', '', '', ''
  );

  INSERT INTO workers (
    worker_id, name, english_name, nationality, resident_number_enc,
    phone, address, employment_type,
    contract_date, join_date, retire_date,
    duty, department, job,
    is_foreigner, contract_end_date, visa_type, passport_expiry,
    home_address, home_contact, emergency_name, emergency_relation,
    monthly_base, hourly_rate, daily_rate,
    allowance_meal, allowance_transport, allowance_phone,
    housing_fee, cash_advance, custom_deductions,
    bank_name, account_no, account_holder,
    login_id, language, auth_user_id
  ) VALUES (
    worker_data->>'worker_id',
    worker_data->>'name',
    nullif(worker_data->>'english_name', ''),
    nullif(worker_data->>'nationality', ''),
    v_resident_enc,
    worker_data->>'phone',
    nullif(worker_data->>'address', ''),
    worker_data->>'employment_type',
    nullif(worker_data->>'contract_date', '')::date,
    (worker_data->>'join_date')::date,
    nullif(worker_data->>'retire_date', '')::date,
    nullif(worker_data->>'duty', ''),
    nullif(worker_data->>'department', ''),
    nullif(worker_data->>'job', ''),
    coalesce((worker_data->>'is_foreigner')::boolean, false),
    nullif(worker_data->>'contract_end_date', '')::date,
    nullif(worker_data->>'visa_type', ''),
    nullif(worker_data->>'passport_expiry', '')::date,
    nullif(worker_data->>'home_address', ''),
    nullif(worker_data->>'home_contact', ''),
    nullif(worker_data->>'emergency_name', ''),
    nullif(worker_data->>'emergency_relation', ''),
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
  RETURNING * INTO v_new_worker;

  UPDATE profiles
  SET worker_id = v_new_worker.id
  WHERE id = v_auth_id;

  RETURN jsonb_build_object(
    'worker',             to_jsonb(v_new_worker),
    'email',              v_email,
    'password',           v_password,
    'password_generated', v_password_auto
  );
END;
$$;
