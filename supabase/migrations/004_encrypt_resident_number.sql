-- ============================================================
-- 004: 주민등록번호 암호화 (pgcrypto 대칭키)
-- ============================================================
--
-- ★ 마이그레이션 실행 전 Supabase SQL 에디터에서 반드시 실행하세요:
--
--   ALTER DATABASE postgres
--     SET app.encryption_key = '여기에_최소32자_무작위_문자열_입력';
--
--   예시 키 생성 (터미널):
--     openssl rand -base64 32
--
-- 이 키를 잃어버리면 암호화된 데이터를 복호화할 수 없습니다.
-- 반드시 별도 안전한 곳에 백업하세요.
-- ============================================================


-- ─── 1. pgcrypto 확장 ────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ─── 2. 암호화 컬럼 추가 ──────────────────────────────────────
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS resident_number_enc bytea;


-- ─── 3. 기존 평문 데이터 암호화 후 원본 삭제 ──────────────────
DO $$
DECLARE
  v_key text := current_setting('app.encryption_key', true);
BEGIN
  IF v_key IS NOT NULL AND length(v_key) >= 16 THEN
    -- 기존 데이터 암호화
    UPDATE workers
    SET
      resident_number_enc = CASE
        WHEN resident_number IS NOT NULL AND resident_number <> ''
          THEN pgp_sym_encrypt(resident_number, v_key)
        ELSE NULL
      END,
      resident_number = NULL        -- 평문 즉시 삭제
    WHERE resident_number IS NOT NULL;

    RAISE NOTICE '[004] 주민등록번호 암호화 완료.';
  ELSE
    -- 키 없이도 평문은 지움 (최소한의 조치)
    UPDATE workers SET resident_number = NULL WHERE resident_number IS NOT NULL;
    RAISE WARNING '[004] app.encryption_key 가 설정되지 않아 기존 평문을 NULL 처리했습니다. '
                  '키 설정 후 근로자 수정 화면에서 재입력이 필요합니다.';
  END IF;
END;
$$;


-- ─── 4. create_worker_with_account 업데이트 ──────────────────
--        resident_number_enc 컬럼에 암호화하여 저장
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

  -- 주민등록번호 암호화
  v_resident_raw := nullif(trim(coalesce(worker_data->>'resident_number', '')), '');
  v_key := current_setting('app.encryption_key', true);
  IF v_resident_raw IS NOT NULL AND v_key IS NOT NULL AND length(v_key) >= 16 THEN
    v_resident_enc := pgp_sym_encrypt(v_resident_raw, v_key);
  END IF;

  -- auth.users INSERT
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

  -- workers INSERT (resident_number_enc 사용, 평문 컬럼 미사용)
  INSERT INTO workers (
    worker_id, name, english_name, nationality, resident_number_enc,
    phone, address, employment_type,
    contract_date, join_date, retire_date,
    duty, department,
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


-- ─── 5. 주민등록번호 조회 RPC (관리자 전용) ──────────────────
CREATE OR REPLACE FUNCTION get_resident_number(p_worker_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_enc bytea;
  v_key text;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다.';
  END IF;

  v_key := current_setting('app.encryption_key', true);
  IF v_key IS NULL OR length(v_key) < 16 THEN
    RAISE EXCEPTION '암호화 키가 설정되지 않았습니다. 관리자에게 문의하세요.';
  END IF;

  SELECT resident_number_enc INTO v_enc
  FROM workers
  WHERE id = p_worker_id;

  IF v_enc IS NULL THEN
    RETURN '';
  END IF;

  RETURN pgp_sym_decrypt(v_enc, v_key);
END;
$$;


-- ─── 6. 주민등록번호 저장 RPC (관리자 전용) ──────────────────
CREATE OR REPLACE FUNCTION set_resident_number(p_worker_id uuid, p_resident_number text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_key text;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다.';
  END IF;

  v_key := current_setting('app.encryption_key', true);
  IF v_key IS NULL OR length(v_key) < 16 THEN
    RAISE EXCEPTION '암호화 키가 설정되지 않았습니다. 관리자에게 문의하세요.';
  END IF;

  IF p_resident_number IS NULL OR length(trim(p_resident_number)) = 0 THEN
    UPDATE workers SET resident_number_enc = NULL WHERE id = p_worker_id;
  ELSE
    UPDATE workers
    SET resident_number_enc = pgp_sym_encrypt(p_resident_number, v_key)
    WHERE id = p_worker_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION get_resident_number(uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION set_resident_number(uuid, text)    TO authenticated;
