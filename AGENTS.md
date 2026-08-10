# AGENTS.md

이 파일은 AI 에이전트(Codex / Claude Code 등)가 본 저장소에서 작업할 때 참고하는 가이드입니다.
`CLAUDE.md`는 이 파일을 가리키는 포인터입니다 — **문서를 고칠 때는 이 파일만 고치세요.**

---

## 1. 프로젝트 개요

**이름:** 건설 현장 출퇴근 · 노무 · 급여 관리 앱
**도메인:** 건설 현장 노무 관리 — 근로자 등록, QR 출퇴근 타각, 근태 정산, 임금 정책(연장/야간/휴일 가산, 4대보험, 세금) 설정, 급여 시뮬레이션, 노무대장·급여명세서 엑셀 발행
**현재 버전:** `package.json`의 `version` (빌드 시 `__APP_VERSION__` 전역 상수로 주입되어 화면 우상단에 표시)

> 이 프로젝트는 Google AI Studio 프로토타입(Firebase 기반)에서 출발했지만, **현재는 Supabase(Postgres + Auth + RLS + RPC)로 완전히 이관되었습니다.** Firebase 관련 파일·코드는 저장소에 남아 있지 않습니다.

### 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 프레임워크 | React 19 + TypeScript 5.8 |
| 빌드 | Vite 6 |
| 스타일 | Tailwind CSS 4 (`@tailwindcss/vite`) |
| 인증/DB | Supabase (`@supabase/supabase-js` v2) — Postgres + Auth + RLS + RPC |
| PWA | `vite-plugin-pwa` — 새 배포 감지 시 확인 없이 자동 갱신 (7절 참고) |
| QR | `html5-qrcode`(스캔, 동적 import) / `qrcode`(생성) |
| 엑셀 | `exceljs` + `file-saver` |
| 아이콘/모션 | `lucide-react`, `motion` |
| 배포 | Vercel (`vercel.json`, framework: vite) |

### 실행

```bash
npm install
cp .env.example .env.local   # VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY 채우기
npm run dev                  # vite, 포트 3000, --host 0.0.0.0 (모바일 실기기 테스트용)
npm run build
npm run lint                 # tsc --noEmit — 유일한 자동 검증 수단
```

`src/supabase.ts`는 환경변수가 없으면 **모듈 로드 시점에 throw** 합니다. `.env.local` 없이는 앱이 뜨지 않습니다.

---

## 2. 파일 구조

```
출퇴근앱/
├── index.html
├── vite.config.ts                  # PWA manifest, __APP_VERSION__ 주입, @ alias
├── vercel.json
├── .env.example
├── AGENTS.md                       # ← 이 파일 (단일 진실 원천)
├── CLAUDE.md                       # AGENTS.md 포인터 (gitignore 대상, 커밋 안 됨)
├── README.md
├── supabase/
│   ├── schema.sql                  # 초기 스키마 (테이블 8종 + 트리거 + 헬퍼 함수)
│   ├── policies.sql                # RLS 정책 (재실행 안전)
│   ├── seed.sql                    # settings 8종 + 공휴일 시드 (멱등)
│   ├── bootstrap_first_admin.sql   # 첫 관리자 계정 생성 안내
│   └── migrations/001~010_*.sql    # 순차 적용 마이그레이션
└── src/
    ├── main.tsx
    ├── App.tsx                     # 로그인 게이트 → 역할별 분기 (Admin 5탭 / Worker 포털)
    ├── supabase.ts                 # 클라이언트 초기화 (18줄)
    ├── types.ts                    # AllSettings, Worker, Holiday, SettingsHistory
    ├── i18n.tsx                    # 7개 언어 × 73개 키 (ko/vi/km/my/ne/zh/en)
    ├── context/
    │   └── SupabaseContext.tsx     # Auth + CRUD + RPC 래퍼 — 앱의 데이터 허브 (944줄)
    ├── components/
    │   ├── WorkerTab.tsx           # 근로자 CRUD (1308줄)
    │   ├── AttendanceTab.tsx       # 근태 조회·수정·정산 확정 (1386줄)
    │   ├── ExpiryTab.tsx           # 계약·여권 만료 알림 (281줄)
    │   ├── SettingsTab.tsx         # 임금 정책 설정 + 현장 QR 코드 발급 (1774줄)
    │   ├── SimulatorTab.tsx        # 월 급여 시뮬레이터 (563줄)
    │   └── WorkerPortal.tsx        # 근로자용 모바일 화면 — QR 스캔 출퇴근 (759줄)
    ├── utils/
    │   ├── payrollCalculator.ts    # 급여 계산 (309줄)
    │   ├── attendanceHours.ts      # 타각 보정 + 근로시간/공수 분해 (244줄)
    │   ├── datetime.ts             # IANA 타임존 기준 날짜·시각 변환 (99줄)
    │   ├── excelExporter.ts        # 노무대장/급여명세서/근태부 3종 (1280줄)
    │   └── auth.ts                 # 로그인 ID ↔ 가짜 이메일 변환 (53줄)
    ├── constants/workerOptions.ts  # 부서·직급·직종 기본 선택지
    └── data/defaults.ts            # DEFAULT_SETTINGS (+ 미사용 상수 2종, 3절 참고)
```

---

## 3. 인증 구조 — "가짜 이메일" 패턴

Supabase Auth는 이메일을 요구하지만 사용자는 ID/비밀번호로 로그인합니다. `src/utils/auth.ts`가 변환을 담당합니다.

| 역할 | 입력 ID | 변환 결과 |
|---|---|---|
| 관리자 | `admin01` | `admin01@admin.cm.local` |
| 근로자 | `010-1234-5678` (전화번호) | `01012345678@worker.cm.local` (숫자만 추출) |

- **역할 판정은 이메일 도메인으로 결정됩니다.** `auth.users` INSERT 시 `handle_new_auth_user()` 트리거가 도메인을 보고 `profiles.role`을 `admin`/`worker`로 설정하고, 근로자면 `login_id` 숫자와 매칭해 `profiles.worker_id`까지 자동 연결합니다.
- RLS 헬퍼: `is_admin()`, `current_worker_id()` — 모든 정책이 이 둘을 재사용합니다.
- 첫 관리자는 Supabase 대시보드에서 직접 생성해야 합니다 (`supabase/bootstrap_first_admin.sql` 참고).
- `App.tsx` 루트 분기: 미로그인 → `LoginGate`, `role === "worker"` → `WorkerPortal`, 그 외 → `AdminPortal`.

---

## 4. 데이터 모델 (Postgres)

`schema.sql` 기준 8개 테이블. **단, migrations 001~010에서 컬럼과 함수가 계속 추가되었으므로 `schema.sql`만 보고 판단하면 안 됩니다.**

| 테이블 | 용도 |
|---|---|
| `profiles` | `auth.users` ↔ 역할(`admin`/`worker`) ↔ `worker_id` 매핑 |
| `settings` | 8개 카테고리를 `category` PK + `data jsonb`로 보관 (`types.ts`의 `AllSettings` 키와 1:1) |
| `workers` | 근로자 마스터 (월급/시급/일용/사업소득 4유형) |
| `holidays` | 공휴일 + 사용자 지정 휴일 |
| `attendance` | 일별 출퇴근 헤더. `unique (worker_id, work_date)` |
| `attendance_segments` | 일 내 구간별 시간·공수 분해. **정산 확정 결과가 여기 저장됨** |
| `payroll_records` | 월별 급여 명세 확정본 (스키마만 존재 — UI 미연결, 6절 참고) |
| `settings_history` | 감사 로그 |

### 마이그레이션 이력 (적용 순서 = 파일명 순서)

| 파일 | 내용 |
|---|---|
| `001_domain_based_role` | 이메일 도메인 기반 역할 자동 판정 |
| `002_worker_account_rpc` | `create_worker_with_account` / `reset_worker_password` / `delete_worker_auth_account` |
| `003_qr_attendance` | `regenerate_site_checkin_code` / `submit_attendance` (QR 코드 검증 + 타각) |
| `004_encrypt_resident_number` | 주민번호 pgcrypto 암호화 (`resident_number_enc`) + `get/set_resident_number` |
| `005_worker_self_service` | `update_my_worker_profile` / `change_my_password` (근로자 본인용) |
| `006_attendance_korea_work_date` | `submit_attendance`의 근무일자를 KST 기준으로 산정 |
| `007_worker_job_and_org_options` | `workers.job` 추가 + 부서/직급/직종 옵션 |
| `008_foreign_worker_fields` | 외국인 필드 (`is_foreigner`, `visa_type`, `passport_expiry`, 본국 연락처 등) + `contract_end_date` |
| `009_retired_worker_retention` | `retire_worker` / `purge_retired_worker_private_data` (퇴사자 개인정보 파기) |
| `010_worker_has_vehicle` | `workers.has_vehicle` — 자가운전보조금 비과세 분리용 |

`create_worker_with_account`는 002·004·007·008·010에서 **다섯 번 재정의**되었습니다. 이 함수를 수정할 때는 최신 정의(010)를 기준으로 새 마이그레이션 파일에 전체를 재작성하세요.

### RLS 원칙 (`policies.sql`)

- `admin` → 전체 R/W
- `worker` → 본인 데이터만 R, 출퇴근 INSERT/UPDATE만 W
- 미인증 → 전면 차단
- `settings`·`holidays`는 인증된 사용자면 누구나 SELECT 가능 (근로자 화면에서 근로시간 계산에 필요)

---

## 5. 핵심 도메인 로직

### 타각 보정(스냅) — `attendanceHours.ts` + `types.ts:AttendanceSnapRule`

"이 요일에 이 시간 구간에 찍으면 → 이 시각으로 인정"하는 규칙. `dayType`(weekday/saturday/sunday/holiday) × `kind`(in/out) × 구간 → `snapTo`.
기본값은 `DEFAULT_SETTINGS.overtimeRules.snapRules`에 18개 정의되어 있고, 관리자가 `SettingsTab`에서 수정 가능합니다. 규칙에 걸리지 않는 타각은 **보정하지 않고 원본 시각 사용**.

### 출퇴근 검증 방식 — QR 전용

**현재 설계상 출퇴근 검증은 QR 코드로만 이루어집니다. 위치(GPS) 검증은 사용하지 않습니다.**

- 관리자가 `SettingsTab`에서 `regenerate_site_checkin_code` RPC로 현장 QR 코드를 발급 → 근로자가 `WorkerPortal`에서 스캔 → `submit_attendance` RPC가 타각합니다.
- 코드는 `settings.site` 문서의 `data->>'checkinCode'`에 **현장당 하나, 정적으로** 보관됩니다. 시간 만료나 자동 회전이 없어 관리자가 수동 재발급할 때까지 계속 유효합니다.
- `submit_attendance`가 실제로 검증하는 것: ① 근로자 계정 로그인 여부(`current_worker_id()`) ② 퇴사 여부(`retire_date`) ③ QR 코드 문자열 일치 ④ 당일 중복 출근/퇴근 ⑤ 퇴근 전 출근 선행. 위치는 이 목록에 없습니다.
- 전 소스에 `navigator.geolocation` 호출이 **0건**입니다. 위치를 못 잡는 버그가 아니라 애초에 받지 않습니다.
- 따라서 **위치 관련 자산은 전부 사용되지 않는 상태**입니다:
  - `attendance.check_in_lat/lng/distance_m/within_geo`, `check_out_*` 동일 — 항상 NULL
  - `settings.site.siteLocation`(기본값 `37.1234, 126.4567`은 더미 좌표), `settings.site.allowedRadius`
  - `SettingsTab`의 "가상 위성 지도" — div 클릭을 좌표로 환산하는 시뮬레이션이며 실제 지도 SDK 미통합
  - `App.tsx` 헤더의 "인가 반경 100m" 표시 — 실제로 아무것도 강제하지 않는 장식입니다

QR 검증을 강화하거나 위치 검증을 추가하려는 요청이 오기 전까지, 위 자산은 건드리지 말고 그대로 두세요. 반대로 **"출퇴근이 반경 밖에서도 찍힌다"는 제보는 버그가 아니라 현재 사양입니다.**

### 근태 정산 확정 흐름

1. 근로자가 `WorkerPortal`에서 현장 QR을 스캔 → `submit_attendance` RPC → `attendance` 행 생성/갱신
2. 관리자가 `AttendanceTab`에서 조회 → `calculateDailyBreakdown()`이 정규/연장/휴일/휴일연장/야간/공수 6종으로 자동 분해
3. 관리자가 값을 검토·수정 후 **확정** → `confirmAttendanceBreakdown()`이 기존 `attendance_segments`를 지우고 새로 INSERT
4. 엑셀 발행 및 집계는 확정된 segments를 우선 사용, 없으면 자동 계산값 사용

`AttendanceBreakdownValues`(앱) ↔ `attendance_segments.segment_type`(DB) 매핑은 `SupabaseContext.tsx`의 `segmentsToBreakdown()`에 있습니다. **segment_type을 추가하면 이 함수도 반드시 수정해야 합니다.**

주의: DB `check` 제약은 segment_type 8종을 허용하지만, `confirmAttendanceBreakdown()`이 실제로 쓰는 것은 `standard` / `weekday_ot` / `holiday` / `holiday_ot` / `night` **5종뿐**입니다. 일용직용 `early_morning` / `afternoon_ot` / `evening_ot`는 읽기(`segmentsToBreakdown`)만 지원되고 쓰이는 경로가 없습니다. 공수(`man_days`)도 `standard` 행에 전량 몰아서 기록합니다.

### 급여 계산 — `payrollCalculator.ts`

`calculatePayroll(worker, settings, input)` 하나가 4개 고용유형을 모두 처리합니다. 통상시급은 `getOrdinaryHourlyRate()`가 유형별로 산출(월급제는 `hourlyOrdinaryMonthlyHours`=209로 나눔). 월급제는 `has_vehicle`이 true일 때만 자가운전보조금을 비과세로 분리합니다.

### 타임존 — `datetime.ts`

DB는 `timestamptz`, 프런트엔드의 표시·판정은 `settings.site.timezone`(기본 `Asia/Seoul`) 기준. **`new Date().getHours()` 같은 로컬 시각 직접 접근을 새로 추가하지 마세요.** `getZonedClockMinutes` / `getZonedYmd` / `zonedWallTimeToUtcIso`를 사용합니다.

**단, `submit_attendance` RPC 안에는 `AT TIME ZONE 'Asia/Seoul'`이 SQL로 하드코딩되어 있습니다** (006에서 도입). 즉 타각 시 근무일자(`work_date`) 결정은 `settings.site.timezone` 설정을 무시하고 항상 KST로 계산합니다. 타임존을 실제로 바꿀 일이 생기면 프런트엔드만 고쳐서는 안 되고 이 RPC도 함께 수정해야 합니다.

### 엑셀 — `excelExporter.ts`

`exportLaborLedger`(노무대장) / `exportPayslips`(급여명세서) / `exportAttendanceBook`(근태부) 3종. 노무대장은 근로자 1인당 구분 6행(출근/퇴근/연장/휴일/휴일연장/야간) 구조입니다.

---

## 6. 알려진 상태 · 미구현

### 미구현

- **`payroll_records` 테이블이 UI에 연결되어 있지 않음** — 스키마·RLS는 준비됐지만 `SimulatorTab`은 여전히 화면상 모의 계산만 하고 결과를 저장하지 않습니다. 급여 확정·이력 관리를 하려면 여기부터.
- **연차 관리** — `annualLeave` 설정값만 있고 발생/소진 추적 화면 없음
- **은행 이체 연동** — 계좌 정보 수집만, 펌뱅킹 API 없음
- **연말정산 / 원천징수영수증** 없음
- **테스트 0건 / CI 없음** — 검증 수단은 `npm run lint`(tsc)뿐

### 정리 대상 (동작에는 영향 없음)

- `src/data/defaults.ts`의 **`MOCK_WORKERS`·`DEFAULT_HOLIDAYS`는 어디서도 import되지 않는 죽은 코드**입니다. 시드는 `supabase/seed.sql`이 담당합니다. (`MOCK_WORKERS`에는 주민번호·계좌번호 형식의 더미 데이터가 들어 있습니다.)
- **미사용 의존성 4종:** `@google/genai`, `express`, `dotenv`, `autoprefixer` — 소스 참조 0건. `package.json`의 `clean` 스크립트도 존재하지 않는 `server.js`를 지웁니다.
- `SupabaseContext.tsx` 말미의 `useFirebase` / `FirebaseProvider` 별칭 — Firebase 시절 하위호환용
- **`checkinCode`가 `types.ts`의 `SiteSettings`에 선언되어 있지 않습니다.** 그 탓에 `SettingsTab.tsx`·`SupabaseContext.tsx`에서 `(settings.site as any).checkinCode` 형태의 캐스팅이 6군데 쓰입니다. `SiteSettings`에 `checkinCode?: string`을 추가하면 전부 제거됩니다.
- `package.json`의 `name`이 `react-example` (AI Studio 템플릿 잔재)

### 하드코딩된 값

- 회사명 `"씨엠(CM)건설"`, 현장 주소 `"충남 당진시 신평면 신평로 45"` — `defaults.ts` 및 `seed.sql`
- 인증 도메인 `admin.cm.local` / `worker.cm.local` — `auth.ts` + `handle_new_auth_user()` 트리거 **양쪽에 박혀 있음.** 바꾸려면 둘 다 고쳐야 합니다.
- `ExpiryTab.tsx`: 만료 알림 임계값 `ALERT_WINDOW_DAYS = 60`, 개인정보 보존 `PRIVACY_RETENTION_YEARS = 2`
- `App.tsx` 푸터의 "CM건설 Workforce & Payroll Registry Portal"
- `WorkerTab.tsx`: 신규 등록 기본값 (월급 3,000,000 / 시급 12,000 / 일급 180,000 / 사번 포맷 `CM-{year}-{nnn}`)

---

## 7. 작업 시 주의사항

- **DB 변경은 반드시 새 마이그레이션 파일로.** `schema.sql`을 직접 수정하지 마세요 — 이미 배포된 DB에는 반영되지 않습니다. 다음 번호는 `011_`입니다.
- **RPC 함수를 고칠 때는 최신 정의를 찾아 전체를 재작성.** `create_or replace`가 누적되어 있어 부분 수정이 불가능합니다.
- 컬럼 추가 시 손대야 하는 곳: 마이그레이션 SQL → `types.ts` → `SupabaseContext.tsx`의 `dbToWorker()` 어댑터 → `create_worker_with_account` RPC → `WorkerTab.tsx` 폼. **하나라도 빠지면 조용히 값이 유실됩니다.**
- 모든 mutation은 `settings_history`에 로그를 남기는 패턴 — 신규 CRUD 추가 시 동일 패턴 유지.
- DB는 `snake_case`, 앱은 `camelCase`. 변환 지점은 `SupabaseContext.tsx`의 어댑터 함수뿐입니다.
- 주민번호는 평문으로 조회되지 않습니다 (`dbToWorker`가 빈 문자열 반환). 수정 화면에서 필요할 때만 `get_resident_number` RPC로 별도 조회합니다.
- **PWA는 자동 갱신됩니다.** `registerType: "prompt"`이지만 `main.tsx`의 `onNeedRefresh`가 확인 없이 즉시 `updateSW(true)`를 호출하고, 1시간 주기 + 탭 활성화 시점에 업데이트를 확인합니다. 현장 단말이 옛 캐시에 머물러 출퇴근이 안 되던 문제 때문에 의도적으로 이렇게 되어 있으니 되돌리지 마세요. 버전 확인은 화면에 표시되는 `__APP_VERSION__`으로.
- 변경 후에는 최소한 `npm run lint`를 통과시키세요.
