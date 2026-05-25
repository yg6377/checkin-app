-- ============================================================
-- 003: QR 출퇴근 체크 + 현장 코드 발급 RPC
-- ============================================================
-- settings.site.checkinCode (랜덤 문자열) 을 현장 QR 의 내용으로 사용.
-- 근로자는 QR 을 스캔해 얻은 문자열을 submit_attendance(...) 로 제출.
-- ============================================================


-- ─── 1. 현장 QR 코드 발급/재발급 (관리자) ─────────────────────
create or replace function regenerate_site_checkin_code()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_new_code text;
begin
  if not is_admin() then
    raise exception '관리자 권한이 필요합니다.';
  end if;

  -- 16자 영문/숫자 코드
  v_new_code := substring(
    replace(replace(replace(encode(gen_random_bytes(16), 'base64'), '/', ''), '+', ''), '=', '')
    from 1 for 16
  );

  update settings
  set data       = jsonb_set(data, '{checkinCode}', to_jsonb(v_new_code)),
      updated_at = now(),
      updated_by = auth.uid()
  where category = 'site';

  return v_new_code;
end;
$$;

grant execute on function regenerate_site_checkin_code() to authenticated;


-- ─── 2. QR 스캔 결과 제출 (근로자) ─────────────────────────────
create or replace function submit_attendance(
  scanned_code  text,
  action        text  -- 'in' or 'out'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_worker_id  uuid;
  v_site_code  text;
  v_today      date := current_date;
  v_now        timestamptz := now();
  v_existing_id          uuid;
  v_existing_check_in    timestamptz;
  v_existing_check_out   timestamptz;
begin
  -- 근로자 식별
  v_worker_id := current_worker_id();
  if v_worker_id is null then
    raise exception '근로자 계정으로 로그인되어 있지 않습니다.';
  end if;

  -- 현장 코드 검증
  select data->>'checkinCode' into v_site_code from settings where category = 'site';
  if v_site_code is null or length(v_site_code) = 0 then
    raise exception '현장 QR 코드가 아직 발급되지 않았습니다. 관리자에게 문의하세요.';
  end if;
  if scanned_code is null or scanned_code != v_site_code then
    raise exception '잘못된 QR 코드입니다.';
  end if;

  -- 오늘 attendance 조회
  select id, check_in_at, check_out_at
    into v_existing_id, v_existing_check_in, v_existing_check_out
  from attendance
  where worker_id = v_worker_id and work_date = v_today;

  if action = 'in' then
    if v_existing_id is not null and v_existing_check_in is not null then
      raise exception '오늘 이미 출근 체크가 완료되었습니다.';
    end if;

    if v_existing_id is null then
      insert into attendance (worker_id, work_date, check_in_at, status)
      values (v_worker_id, v_today, v_now, 'normal')
      returning id into v_existing_id;
    else
      update attendance
      set check_in_at = v_now
      where id = v_existing_id;
    end if;

    return jsonb_build_object(
      'action',       'in',
      'attendance_id', v_existing_id,
      'timestamp',     v_now
    );

  elsif action = 'out' then
    if v_existing_id is null or v_existing_check_in is null then
      raise exception '출근 체크가 먼저 필요합니다.';
    end if;
    if v_existing_check_out is not null then
      raise exception '오늘 이미 퇴근 체크가 완료되었습니다.';
    end if;

    update attendance
    set check_out_at = v_now
    where id = v_existing_id;

    return jsonb_build_object(
      'action',       'out',
      'attendance_id', v_existing_id,
      'timestamp',     v_now
    );

  else
    raise exception '알 수 없는 액션: %', action;
  end if;
end;
$$;

grant execute on function submit_attendance(text, text) to authenticated;
