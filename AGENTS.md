# AGENTS.md

이 파일은 Codex가 본 저장소에서 작업할 때 참고하는 가이드입니다.

## 1. 프로젝트 개요

**이름:** 현장 노무 & 임금 정책 관리 종합망 (Workforce Core v4.2)
**출처:** Google AI Studio (`ai.studio/apps/69731864-fb29-4c36-a2d9-2b3515a4c2f1`)에서 생성된 프로토타입
**도메인:** 건설 현장 노무 관리 — 근로자 등록, 임금 정책(연장/야간/휴일 가산, 4대보험, 세금) 설정, 급여 시뮬레이션
**디렉터리명:** `출퇴근앱` (출퇴근 기능 자체는 미구현 — 아래 5번 참고)

### 기술 스택

| 영역 | 사용 기술 |
|---|---|
| 프레임워크 | React 19 + TypeScript 5.8 |
| 빌드 | Vite 6 |
| 스타일 | Tailwind CSS 4 (`@tailwindcss/vite`) |
| 아이콘/모션 | lucide-react, motion |
| 인증/DB | Firebase 12 (Auth + Firestore) |
| 기타 | @google/genai (설치만 됨, 사용처 없음), express (사용 안 함), dotenv |

### 실행

```bash
npm install
npm run dev    # vite, 포트 3000
npm run build
npm run lint   # tsc --noEmit
```

## 2. 파일 구조

```
출퇴근앱/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── .env.example
├── firebase-applet-config.json     # Firebase 실제 자격 정보 (커밋됨)
├── firebase-blueprint.json         # Firebase 리소스 청사진
├── firestore.rules                 # 실제 적용본
├── DRAFT_firestore.rules           # 초안 (firestore.rules와 동일 내용)
├── security_spec.md
├── README.md                       # AI Studio 기본 템플릿
└── src/
    ├── main.tsx
    ├── App.tsx                     # 로그인 게이트 + 3개 탭 라우팅
    ├── index.css
    ├── firebase.ts                 # Firebase 초기화, OperationType, 에러 핸들러
    ├── types.ts                    # AllSettings, Worker, Holiday, SettingsHistory
    ├── context/
    │   └── FirebaseContext.tsx     # Auth + Firestore CRUD + 실시간 리스너 + 시딩
    ├── components/
    │   ├── WorkerTab.tsx           # 근로자 CRUD (895 lines)
    │   ├── SettingsTab.tsx         # 글로벌 임금 정책 설정 (1265 lines)
    │   └── SimulatorTab.tsx        # 월 급여 시뮬레이터 (551 lines)
    ├── utils/
    │   └── payrollCalculator.ts    # 급여 계산 로직 (274 lines)
    └── data/
        └── defaults.ts             # DEFAULT_SETTINGS, DEFAULT_HOLIDAYS, MOCK_WORKERS
```

### 데이터 모델 (Firestore 컬렉션)

- `settings/{category}` — `workTime`, `overtimeRules`, `dailyWorkerRules`, `insuranceRates`, `taxRules`, `allowanceDefaults`, `site`, `annualLeave` 8개 문서
- `workers/{workerId}` — 근로자 (월급/시급/일용/사업소득 4유형)
- `holidays/{id}` — 공휴일 + 사용자 지정 휴일
- `settingsHistory/{id}` — 모든 변경에 대한 감사 로그

## 3. 하드코딩된 값 목록

본 앱은 "설정 지향형 / 하드코딩 회피"를 표방하지만, 실제로는 다음 값들이 코드에 박혀 있습니다.

### `src/data/defaults.ts` — 시드 데이터 (Firestore 미초기화 시 자동 시딩)

- **회사명:** `"씨엠(CM)건설"` / **현장 주소:** `"충남 당진시 신평면 신평로 45"`
- **현장 GPS:** `lat: 37.1234, lng: 126.4567` (실제 좌표 아닌 더미값)
- **허용 반경:** 100m / **급여 지급일:** 15일
- **표준 근무:** 출근 08:00, 퇴근 17:00, 점심 12:00–13:00, 일 8h / 주 40h
- **가산 요율:** 평일 연장 1.5, 휴일 1.5, 휴일연장 2.0, 야간 +0.5 (22:00–06:00)
- **일용직 공수:** 조출(05–08) 0.5공수, 오후연장(17–19:30) 0.5, 야간연장(19:30–22) 0.5
- **4대보험 요율:** 국민연금 4.5%, 건강보험 3.545%, 장기요양 12.95%, 고용보험 0.9%, 적용일 `2026-01-01`
- **세금:** 사업소득 3.3%, 일용 비과세 한도 15만원, 일용세율 6%, 지방소득세 10%
- **수당 기본값:** 식대 20만, 교통 20만, 통신 10만
- **연차:** 1년차 11일 / 2년차 15일 / 최대 25일 / 월별 발생
- **MOCK_WORKERS 4명:** 김철수(CM-2026-001), 박동근(002), 이민우(003), John Doe(004) — 주민번호·계좌번호·전화번호·비밀번호까지 실제 형식으로 박혀 있음
- **공휴일:** 2026–2030년 8개씩 총 40개 항목

### `src/firebase.ts` & `firebase-applet-config.json` (커밋된 비밀)

- `apiKey: "AIzaSyCn6LSqU_NjCm5zrawFLOcXpN--qetrfxI"`
- `projectId: "gen-lang-client-0659045240"`
- `firestoreDatabaseId: "ai-studio-69731864-fb29-4c36-a2d9-2b3515a4c2f1"`
- `appId: "1:924103863912:web:9dbb65e773065e1fdd55dd"`

### UI 안에 박힌 값

- `App.tsx`: 헤더 텍스트 `"Workforce Core v4.2"`, 회사명 fallback `"공유 시공단"`, 푸터 `"CM건설 Workforce..."`
- `WorkerTab.tsx`: 신규 등록 시 기본값 — 월급 3,000,000 / 시급 12,000 / 일급 180,000 / 초기 비밀번호 `"password123!"` / 부서 `"현장시공팀"` / 직위 `"사원"` / 사번 포맷 `CM-{year}-{nnn}`
- `SettingsTab.tsx:61` — 지도 클릭 좌표 변환 시 `lat: 37.1234, lng: 126.4567` 중심 기준
- `SimulatorTab.tsx:37-53` — 월급제 연장 10h, 시급제 12h, 일용직 조출 3일·오후연장 4일 등 시뮬 기본값

## 4. Firebase 실제 연동 여부

**✅ 실제 연동되어 있음.** 단순 mock이 아닙니다.

| 항목 | 상태 |
|---|---|
| Firebase Auth (Google 로그인) | ✅ 실 연동 — `signInWithPopup(auth, GoogleAuthProvider)` |
| Firestore SDK | ✅ 실 연동 — `getFirestore(app, firestoreDatabaseId)` (named DB 사용) |
| 실시간 리스너 | ✅ `onSnapshot`으로 settings/workers/holidays/settingsHistory 4개 컬렉션 구독 |
| 자동 시딩 | ✅ 최초 로그인 시 `settings/site` 문서 부재 확인 후 DEFAULT/MOCK 데이터 자동 시딩 (`FirebaseContext.tsx:74-121`) |
| 감사 로그 | ✅ 모든 CRUD가 `settingsHistory`에 기록됨 |
| `firestore.rules` | 작성되어 있으나 실제 프로젝트에 배포되었는지는 코드만으로 확인 불가 |

**주의:** `firebase-applet-config.json`이 저장소에 커밋되어 있어 API 키가 공개 상태. AI Studio 생성 앱의 일반적 패턴이지만, Firebase 보안은 전적으로 Firestore Rules + Google Auth 도메인 화이트리스트에 의존.

## 5. 미구현 기능 목록

디렉터리 이름이 "출퇴근앱"이지만 **출퇴근 자체 기능은 없습니다.** UI 상 약속만 있고 구현이 빠진 영역들:

### 핵심 누락

- **출퇴근 체크인/체크아웃 기능 자체 없음** — 근로자가 GPS 기반으로 출근 도장을 찍는 화면/로직 부재
- **근태 기록 컬렉션 없음** — `attendance`, `timesheet` 등 일별 출퇴근 데이터 모델 미정의
- **모바일 앱 미존재** — 근로자 등록 화면에서 "현장용 모바일 앱 로그인 ID/비밀번호" 항목을 받지만 해당 모바일 앱은 본 저장소에 없음
- **GPS 지도** — `SettingsTab`의 지도는 "가상 위성 지도"라는 라벨 그대로, 실제 지도 SDK(Google Maps/Kakao 등) 미통합. div 클릭을 좌표로 변환하는 시뮬레이션

### 급여 워크플로 누락

- **실제 급여 명세서 발급/저장** — `SimulatorTab`은 모의 계산만 수행, 결과를 Firestore에 저장하거나 PDF로 발행하는 기능 없음
- **월별 근태 → 급여 자동 산정** — 출퇴근 데이터가 없으므로 시뮬레이터가 사용자 수동 입력(공수 일수)에 의존
- **은행 이체 연동** — 계좌 정보를 수집하지만 펌뱅킹/이체 API 없음
- **연차 관리** — `annualLeave` 설정값만 있고 연차 발생/소진 추적 화면 없음

### 부가 누락

- **연말정산 / 원천징수영수증 발급** 없음
- **다국어 i18n** — `language: "ko" | "en"` 필드만 존재, 실제 영어 번역 리소스 없음
- **`@google/genai` 미사용** — 의존성 설치만 됨, AI 기능 구현 없음
- **`express` 미사용** — `package.json`의 `clean` 스크립트가 `server.js`를 지우지만 정작 서버 코드 없음
- **테스트 코드 0건**
- **CI/CD 파이프라인 없음**
- **`.env.local` 사용처 없음** — README는 `GEMINI_API_KEY` 설정을 요구하지만 코드에서 참조하지 않음

## 6. 작업 시 주의사항

- Firestore 시딩은 `settings/site` 문서 존재 여부로만 판정. 시드 데이터를 바꾸려면 해당 문서를 먼저 삭제해야 재시딩됨.
- `firebase-applet-config.json`의 `firestoreDatabaseId`는 named database임. `getFirestore(app)`이 아니라 `getFirestore(app, databaseId)`로 호출해야 함 (`firebase.ts:9`).
- 모든 mutation은 `settingsHistory`에 로그를 남기는 패턴 — 신규 CRUD 추가 시 동일 패턴 유지.
- Worker 문서 ID는 `workerId` 필드값과 동일하게 설정함 (Firestore auto-ID 미사용).
