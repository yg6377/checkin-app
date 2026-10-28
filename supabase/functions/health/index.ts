// 개인 대시보드용 운영 지표 health 엔드포인트
//
// - 인원 수·건수·시간 합계만 돌려준다. 이름·주민번호·연락처·임금·계좌·위치 좌표는 응답에 넣지 않는다.
// - DB 구조를 바꾸지 않는다. service role 로 기존 테이블을 읽기만 한다.
// - 인증: Authorization: Bearer <토큰>. 코드에는 토큰의 SHA-256 해시만 있고, 원문은 대시보드 Worker 비밀값
//   (CHECKIN_HEALTH_TOKEN)에만 있다. 교체하려면 새 토큰의 해시로 TOKEN_SHA256 을 바꾸고 재배포한다.
//   함수가 직접 검사하므로 verify_jwt = false 로 배포한다.
// - GET                    : 5분마다 부르는 카드 지표
//   GET ?detail=1&days=N   : 대시보드 상세 페이지용 집계 (N = 30 | 90 | 365), 범용 그래프 형식(charts)
// - "오늘"은 Asia/Seoul 기준 (006_attendance_korea_work_date 와 같음).
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const TOKEN_SHA256 = '0abb47a651acb621fae2c8b9f42452226842dacda1749b98f3a0d57d3afe8f15';
const TZ = 'Asia/Seoul';
const PAGE = 1000;
const MAX_ROWS = 50000;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const dateOf = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: TZ });
const kstDate = (offsetDays = 0) => dateOf(new Date(Date.now() + offsetDays * 86400000));
const hourOf = (iso: string) => Number(new Date(iso).toLocaleString('en-US', { timeZone: TZ, hour: '2-digit', hour12: false })) % 24;

/** 조회가 가끔 일시적으로 실패하므로 300ms 뒤 한 번 더 시도한다 */
async function withRetry<T extends { error: unknown }>(make: () => PromiseLike<T>): Promise<T> {
  let r = await make();
  if (r.error) {
    await new Promise((res) => setTimeout(res, 300));
    r = await make();
  }
  return r;
}

/** 1,000행 제한에 잘리지 않게 나눠 받는다 */
async function fetchAll<T>(make: () => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < MAX_ROWS; from += PAGE) {
    const { data, error } = await withRetry(() => make().range(from, from + PAGE - 1));
    if (error) throw new Error((error as { message?: string }).message || 'query failed');
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

type Att = { work_date: string; status: string; check_in_at: string | null; check_out_at: string | null; check_in_within_geo: boolean | null; check_out_within_geo: boolean | null };
type Wk = { employment_type: string | null; retire_date: string | null; contract_end_date: string | null; passport_expiry: string | null; is_foreigner: boolean | null };

const STATUS: Record<string, [string, string]> = {
  normal: ['정상', 'ok'], early_leave: ['조퇴', 'warn'], absent: ['결근', 'err'], annual_leave: ['연차', 'info'],
};
const ETYPE: Record<string, string> = { salary: '월급', hourly: '시급', daily: '일용', business: '사업소득' };

function expiring(workers: Wk[], today: string, until: string) {
  let contract = 0, passport = 0;
  for (const w of workers) {
    if (w.retire_date) continue;
    if (w.contract_end_date && w.contract_end_date >= today && w.contract_end_date <= until) contract++;
    if (w.passport_expiry && w.passport_expiry >= today && w.passport_expiry <= until) passport++;
  }
  return { contract, passport };
}

// ---------------------------------------------------------------------------
async function counters(sb: SupabaseClient) {
  const today = kstDate(0), weekAgo = kstDate(-6), in30 = kstDate(30);
  const [workers, todayRows, week] = await Promise.all([
    fetchAll<Wk>(() => sb.from('workers').select('employment_type, retire_date, contract_end_date, passport_expiry, is_foreigner')),
    fetchAll<Att>(() => sb.from('attendance').select('work_date, status, check_in_at, check_out_at, check_in_within_geo, check_out_within_geo').eq('work_date', today)),
    withRetry(() => sb.from('attendance').select('id', { count: 'exact' }).gte('work_date', weekAgo).not('check_in_at', 'is', null).range(0, 0)),
  ]);
  if (week.error) return { failed: [`week:${week.status}:${(week.error as { message?: string }).message ?? ''}`] };
  const active = workers.filter((w) => !w.retire_date);
  const exp = expiring(workers, today, in30);
  const by = (s: string) => todayRows.filter((r) => r.status === s).length;
  return {
    '재직 근로자': active.length,
    '오늘 출근': todayRows.filter((r) => r.check_in_at).length,
    '지금 근무 중': todayRows.filter((r) => r.check_in_at && !r.check_out_at).length,
    '오늘 결근': by('absent'),
    '오늘 조퇴': by('early_leave'),
    '오늘 연차': by('annual_leave'),
    '현장 밖 타각': todayRows.filter((r) => r.check_in_within_geo === false || r.check_out_within_geo === false).length,
    '30일 내 계약 만료': exp.contract,
    '30일 내 여권 만료': exp.passport,
    '7일 출근 연인원': week.count ?? 0,
    db: 'ok',
    date: today,
  };
}

// ---------------------------------------------------------------------------
async function detail(sb: SupabaseClient, days: number) {
  const today = kstDate(0), from = kstDate(-(days - 1)), until90 = kstDate(90);
  const [att, workers, segs] = await Promise.all([
    fetchAll<Att>(() => sb.from('attendance').select('work_date, status, check_in_at, check_out_at, check_in_within_geo, check_out_within_geo').gte('work_date', from).lte('work_date', today).order('work_date')),
    fetchAll<Wk>(() => sb.from('workers').select('employment_type, retire_date, contract_end_date, passport_expiry, is_foreigner')),
    fetchAll<{ segment_type: string; hours: number | null; man_days: number | null; attendance: { work_date: string } }>(() =>
      sb.from('attendance_segments').select('segment_type, hours, man_days, attendance!inner(work_date)').gte('attendance.work_date', from)),
  ]);

  const dates: string[] = [];
  for (let d = new Date(`${from}T00:00:00+09:00`); dateOf(d) <= today; d = new Date(d.getTime() + 86400000)) dates.push(dateOf(d));
  const idx = Object.fromEntries(dates.map((d, i) => [d, i]));
  const zeros = () => dates.map(() => 0);

  const byStatus: Record<string, number[]> = Object.fromEntries(Object.keys(STATUS).map((k) => [k, zeros()]));
  const hours = zeros(), offsite = zeros(), checked = zeros();
  const inHour = Array(24).fill(0), outHour = Array(24).fill(0), dow = Array(7).fill(0);
  const statusTotal: Record<string, number> = {};
  const durs: number[] = [];
  for (const a of att) {
    const i = idx[a.work_date]; if (i == null) continue;
    (byStatus[a.status] ??= zeros())[i]++;
    statusTotal[a.status] = (statusTotal[a.status] ?? 0) + 1;
    if (a.check_in_at) {
      checked[i]++;
      inHour[hourOf(a.check_in_at)]++;
      dow[(new Date(`${a.work_date}T12:00:00+09:00`).getUTCDay() + 6) % 7]++;
      if (a.check_in_within_geo === false || a.check_out_within_geo === false) offsite[i]++;
    }
    if (a.check_out_at) outHour[hourOf(a.check_out_at)]++;
    if (a.check_in_at && a.check_out_at) {
      const h = (new Date(a.check_out_at).getTime() - new Date(a.check_in_at).getTime()) / 3600000;
      if (h > 0 && h < 24) { hours[i] += h; durs.push(h); }
    }
  }

  const segType: Record<string, number> = {};
  let manDays = 0;
  for (const s of segs) { segType[s.segment_type] = (segType[s.segment_type] ?? 0) + (s.hours ?? 0); manDays += s.man_days ?? 0; }
  const SEG: Record<string, [string, string]> = { standard: ['기본', 'accent'], weekday_ot: ['평일 연장', 'warn'], night: ['야간', 'info'], holiday: ['휴일', 'err'], holiday_ot: ['휴일 연장', 'cyan'] };

  const active = workers.filter((w) => !w.retire_date);
  const etype: Record<string, number> = {};
  for (const w of active) { const k = ETYPE[w.employment_type ?? ''] ?? '기타'; etype[k] = (etype[k] ?? 0) + 1; }

  // 앞으로 90일 만료 예정 (월별 인원)
  const expMonth: Record<string, { c: number; p: number }> = {};
  for (const w of active) {
    for (const [k, v] of [['c', w.contract_end_date], ['p', w.passport_expiry]] as const) {
      if (v && v >= today && v <= until90) { const m = v.slice(0, 7); (expMonth[m] ??= { c: 0, p: 0 })[k]++; }
    }
  }
  const months = Object.keys(expMonth).sort();

  const label = (d: string) => d.slice(5).replace('-', '/');
  const sortedDur = durs.sort((a, b) => a - b);
  const checkedTotal = checked.reduce((a, b) => a + b, 0);

  return {
    range: { from, to: today, days },
    summary: {
      '출근 연인원': checkedTotal,
      '일평균 출근': dates.length ? Math.round((checkedTotal / dates.length) * 10) / 10 : 0,
      '근무시간 중앙값(시간)': sortedDur.length ? Math.round(sortedDur[Math.floor(sortedDur.length / 2)] * 10) / 10 : 0,
      '결근': statusTotal.absent ?? 0,
      '조퇴': statusTotal.early_leave ?? 0,
      '현장 밖 타각': offsite.reduce((a, b) => a + b, 0),
      '재직 근로자': active.length,
      '외국인 근로자': active.filter((w) => w.is_foreigner).length,
    },
    charts: [
      { type: 'stacked', title: '일별 출근 인원', tag: '근태 상태별', span: 2,
        rows: dates.map((d, i) => ({ label: d, ...Object.fromEntries(Object.keys(byStatus).map((k) => [k, byStatus[k][i]])) })),
        keys: Object.keys(byStatus).map((k) => ({ k, label: STATUS[k]?.[0] ?? k, color: STATUS[k]?.[1] ?? 'accent' })) },
      { type: 'donut', title: '근태 상태 비율', center: ['기간 기록', String(att.length)],
        parts: Object.entries(statusTotal).map(([k, n]) => ({ label: STATUS[k]?.[0] ?? k, n, color: STATUS[k]?.[1] ?? 'accent' })) },
      { type: 'line', title: '일별 근무시간 합계', tag: '출퇴근 시각 기준(시간)', span: 2, labels: dates.map(label),
        series: [{ name: '근무시간', color: 'accent', values: hours.map((h) => Math.round(h * 10) / 10) }] },
      { type: 'donut', title: '근로시간 종류', tag: `정산 확정분 · 공수 ${Math.round(manDays * 10) / 10}`, center: ['확정 시간', String(Math.round(Object.values(segType).reduce((a, b) => a + b, 0)))],
        parts: Object.entries(segType).map(([k, n]) => ({ label: SEG[k]?.[0] ?? k, n: Math.round(n * 10) / 10, color: SEG[k]?.[1] ?? 'faint' })) },
      { type: 'bars', title: '출근 시각 분포', color: 'ok', items: inHour.map((n, h) => ({ label: String(h), n })).filter((x, h) => x.n || (h >= 5 && h <= 10)) },
      { type: 'bars', title: '퇴근 시각 분포', color: 'warn', items: outHour.map((n, h) => ({ label: String(h), n })).filter((x, h) => x.n || (h >= 15 && h <= 21)) },
      { type: 'bars', title: '요일별 출근', color: 'accent', items: dow.map((n, i) => ({ label: '월화수목금토일'[i], n })) },
      { type: 'line', title: '현장 밖 타각', tag: '위치 확인 실패 건수', span: 2, labels: dates.map(label),
        series: [{ name: '현장 밖 타각', color: 'err', values: offsite }] },
      { type: 'donut', title: '재직 근로자 유형', center: ['재직', String(active.length)],
        parts: Object.entries(etype).map(([label, n], i) => ({ label, n, color: ['accent', 'ok', 'warn', 'info', 'cyan'][i % 5] })) },
      { type: 'hbars', title: '만료 예정', tag: '앞으로 90일 · 월별 인원',
        items: months.flatMap((m) => [
          ...(expMonth[m].c ? [{ label: `${m.slice(5)}월 계약`, n: expMonth[m].c }] : []),
          ...(expMonth[m].p ? [{ label: `${m.slice(5)}월 여권`, n: expMonth[m].p }] : []),
        ]) },
    ],
  };
}

Deno.serve(async (req) => {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || (await sha256Hex(token)) !== TOKEN_SHA256) return json({ error: 'unauthorized' }, 401);

  const t0 = Date.now();
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const url = new URL(req.url);
  try {
    if (url.searchParams.get('detail')) {
      const days = [30, 90, 365].includes(Number(url.searchParams.get('days'))) ? Number(url.searchParams.get('days')) : 30;
      return json({ ...(await detail(sb, days)), ms: Date.now() - t0 });
    }
    const c = await counters(sb);
    if ('failed' in c) return json({ db: 'error', failed: c.failed }, 503);
    return json({ ...c, ms: Date.now() - t0 });
  } catch (e) {
    return json({ db: 'error', error: (e as Error).message }, 503);
  }
});
