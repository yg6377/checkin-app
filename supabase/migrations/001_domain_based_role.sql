-- ============================================================
-- 001: 도메인 기반 역할 자동 분기로 trigger 교체
-- ============================================================
-- schema.sql v0.1 을 이미 적용한 환경에서만 실행.
-- 신규 환경은 schema.sql 최신본을 그대로 적용하면 됨.

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
