-- ============================================================
-- 009: 퇴사자 보존 + 2년 후 민감정보 정리
-- ============================================================

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS privacy_purged_at timestamptz;

CREATE INDEX IF NOT EXISTS workers_retired_privacy_due_idx
  ON workers(retire_date, privacy_purged_at)
  WHERE retire_date IS NOT NULL;

-- 관리자 퇴사 처리: worker row와 과거 근태는 유지하고 근로자 로그인만 즉시 차단한다.
CREATE OR REPLACE FUNCTION retire_worker(
  p_worker_id    uuid,
  p_retire_date  date DEFAULT ((now() AT TIME ZONE 'Asia/Seoul')::date)
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_worker workers;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다.';
  END IF;

  SELECT * INTO v_worker
  FROM workers
  WHERE id = p_worker_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '근로자 정보를 찾을 수 없습니다.';
  END IF;

  UPDATE workers
  SET retire_date = coalesce(p_retire_date, (now() AT TIME ZONE 'Asia/Seoul')::date),
      auth_user_id = NULL,
      updated_at = now()
  WHERE id = p_worker_id;

  IF v_worker.auth_user_id IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = v_worker.auth_user_id;
  END IF;

  RETURN jsonb_build_object(
    'worker_id', v_worker.id,
    'worker_code', v_worker.worker_id,
    'name', v_worker.name,
    'retire_date', coalesce(p_retire_date, (now() AT TIME ZONE 'Asia/Seoul')::date),
    'auth_disabled', v_worker.auth_user_id IS NOT NULL
  );
END;
$$;

GRANT EXECUTE ON FUNCTION retire_worker(uuid, date) TO authenticated;

-- 퇴사 2년 후 민감정보 정리: 정산 식별에 필요한 최소 정보와 과거 근태 FK는 유지한다.
CREATE OR REPLACE FUNCTION purge_retired_worker_private_data(p_worker_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_worker workers;
  v_due_date date;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION '관리자 권한이 필요합니다.';
  END IF;

  SELECT * INTO v_worker
  FROM workers
  WHERE id = p_worker_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '근로자 정보를 찾을 수 없습니다.';
  END IF;

  IF v_worker.retire_date IS NULL THEN
    RAISE EXCEPTION '퇴사 처리된 근로자만 개인정보를 정리할 수 있습니다.';
  END IF;

  v_due_date := (v_worker.retire_date + INTERVAL '2 years')::date;
  IF v_due_date > (now() AT TIME ZONE 'Asia/Seoul')::date THEN
    RAISE EXCEPTION '퇴사 후 2년이 지나야 개인정보를 정리할 수 있습니다.';
  END IF;

  IF v_worker.auth_user_id IS NOT NULL THEN
    DELETE FROM auth.users WHERE id = v_worker.auth_user_id;
  END IF;

  UPDATE workers
  SET resident_number = NULL,
      resident_number_enc = NULL,
      phone = '정리완료',
      address = NULL,
      login_id = 'purged-' || p_worker_id::text,
      auth_user_id = NULL,
      bank_name = NULL,
      account_no = NULL,
      account_holder = NULL,
      passport_expiry = NULL,
      home_address = NULL,
      home_contact = NULL,
      emergency_name = NULL,
      emergency_relation = NULL,
      privacy_purged_at = now(),
      updated_at = now()
  WHERE id = p_worker_id;

  RETURN jsonb_build_object(
    'worker_id', v_worker.id,
    'worker_code', v_worker.worker_id,
    'name', v_worker.name,
    'privacy_purged_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION purge_retired_worker_private_data(uuid) TO authenticated;

-- 이미 로그인된 퇴사자 세션이 남아 있어도 신규 출퇴근 기록을 막는다.
CREATE OR REPLACE FUNCTION submit_attendance(
  scanned_code  text,
  action        text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_worker_id  uuid;
  v_retire_date date;
  v_site_code  text;
  v_today      date := (now() AT TIME ZONE 'Asia/Seoul')::date;
  v_now        timestamptz := now();
  v_existing_id          uuid;
  v_existing_check_in    timestamptz;
  v_existing_check_out   timestamptz;
BEGIN
  v_worker_id := current_worker_id();
  IF v_worker_id IS NULL THEN
    RAISE EXCEPTION '근로자 계정으로 로그인되어 있지 않습니다.';
  END IF;

  SELECT retire_date INTO v_retire_date
  FROM workers
  WHERE id = v_worker_id;

  IF v_retire_date IS NOT NULL AND v_retire_date <= v_today THEN
    RAISE EXCEPTION '퇴사 처리된 근로자는 출퇴근을 등록할 수 없습니다.';
  END IF;

  SELECT data->>'checkinCode' INTO v_site_code FROM settings WHERE category = 'site';
  IF v_site_code IS NULL OR length(v_site_code) = 0 THEN
    RAISE EXCEPTION '현장 QR 코드가 아직 발급되지 않았습니다. 관리자에게 문의하세요.';
  END IF;
  IF scanned_code IS NULL OR btrim(scanned_code) != v_site_code THEN
    RAISE EXCEPTION '잘못된 QR 코드입니다.';
  END IF;

  SELECT id, check_in_at, check_out_at
    INTO v_existing_id, v_existing_check_in, v_existing_check_out
  FROM attendance
  WHERE worker_id = v_worker_id AND work_date = v_today;

  IF action = 'in' THEN
    IF v_existing_id IS NOT NULL AND v_existing_check_in IS NOT NULL THEN
      RAISE EXCEPTION '오늘 이미 출근 체크가 완료되었습니다.';
    END IF;

    IF v_existing_id IS NULL THEN
      INSERT INTO attendance (worker_id, work_date, check_in_at, status)
      VALUES (v_worker_id, v_today, v_now, 'normal')
      RETURNING id INTO v_existing_id;
    ELSE
      UPDATE attendance
      SET check_in_at = v_now
      WHERE id = v_existing_id;
    END IF;

    RETURN jsonb_build_object(
      'action', 'in',
      'attendance_id', v_existing_id,
      'work_date', v_today,
      'timestamp', v_now
    );

  ELSIF action = 'out' THEN
    IF v_existing_id IS NULL OR v_existing_check_in IS NULL THEN
      RAISE EXCEPTION '출근 체크가 먼저 필요합니다.';
    END IF;
    IF v_existing_check_out IS NOT NULL THEN
      RAISE EXCEPTION '오늘 이미 퇴근 체크가 완료되었습니다.';
    END IF;

    UPDATE attendance
    SET check_out_at = v_now
    WHERE id = v_existing_id;

    RETURN jsonb_build_object(
      'action', 'out',
      'attendance_id', v_existing_id,
      'work_date', v_today,
      'timestamp', v_now
    );

  ELSE
    RAISE EXCEPTION '알 수 없는 액션: %', action;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_attendance(text, text) TO authenticated;
