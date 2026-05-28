-- 005: 근로자 본인 정보 수정 / 비밀번호 변경

create or replace function update_my_worker_profile(
  p_name             text,
  p_resident_number  text,
  p_bank_name        text,
  p_account_no       text,
  p_account_holder   text,
  p_language         text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_worker_id uuid;
begin
  v_worker_id := current_worker_id();

  if v_worker_id is null then
    raise exception '근로자 계정으로 로그인해야 합니다.';
  end if;

  if p_name is null or length(trim(p_name)) = 0 then
    raise exception '이름은 비워둘 수 없습니다.';
  end if;

  if p_language is null or p_language not in ('ko', 'en') then
    raise exception '지원하지 않는 언어 설정입니다.';
  end if;

  update workers
  set name = trim(p_name),
      resident_number = nullif(trim(p_resident_number), ''),
      bank_name = nullif(trim(p_bank_name), ''),
      account_no = nullif(trim(p_account_no), ''),
      account_holder = case
        when p_account_holder is null or length(trim(p_account_holder)) = 0
          then trim(p_name)
        else trim(p_account_holder)
      end,
      language = p_language
  where id = v_worker_id;
end;
$$;

grant execute on function update_my_worker_profile(text, text, text, text, text, text) to authenticated;


create or replace function change_my_password(
  p_new_password text
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if p_new_password is null or length(trim(p_new_password)) < 6 then
    raise exception '비밀번호는 6자 이상이어야 합니다.';
  end if;

  update auth.users
  set encrypted_password = crypt(trim(p_new_password), gen_salt('bf')),
      updated_at = now()
  where id = auth.uid();
end;
$$;

grant execute on function change_my_password(text) to authenticated;
