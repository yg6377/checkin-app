-- ============================================================
-- 초기 데이터 시드 v0.1
-- ============================================================
-- src/data/defaults.ts 의 DEFAULT_SETTINGS, DEFAULT_HOLIDAYS 와 동기화.
-- MOCK_WORKERS 는 시드 제외 (운영 환경에서는 관리자 화면으로 직접 등록).
-- 재실행 안전: ON CONFLICT DO NOTHING 으로 멱등성 확보.
-- ============================================================

-- ─── settings 8종 ──────────────────────────────────────────────
insert into settings (category, data) values
  ('workTime', jsonb_build_object(
    'defaultCheckIn',      '08:00',
    'defaultCheckOut',     '17:00',
    'lunchStart',          '12:00',
    'lunchEnd',            '13:00',
    'lunchDuration',       1,
    'standardDailyHours',  8,
    'standardWeeklyHours', 40,
    'hourlyOrdinaryWageRate', 10320,
    'hourlyOrdinaryMonthlyHours', 209,
    'departments', jsonb_build_array('관리부', '생산부', '영업부', '구매부'),
    'ranks', jsonb_build_array('사원', '주임', '대리', '과장', '차장', '부장', '팀장', '실장', '이사', '상무', '전무', '부사장', '사장', '대표'),
    'jobs', jsonb_build_array('관리', '사상', '용접', '취부', '절단', '도비')
  )),
  ('overtimeRules', jsonb_build_object(
    'weekdayOvertimeRate', 1.5,
    'holidayRate',         1.5,
    'holidayOvertimeRate', 2.0,
    'nightRate',           0.5,
    'nightStart',          '22:00',
    'nightEnd',            '06:00'
  )),
  ('dailyWorkerRules', jsonb_build_object(
    'earlyMorningStart',         '05:00',
    'earlyMorningEnd',           '08:00',
    'earlyMorningWorkDays',      0.5,
    'afternoonOvertimeStart',    '17:00',
    'afternoonOvertimeEnd',      '19:30',
    'afternoonOvertimeWorkDays', 0.5,
    'eveningOvertimeStart',      '19:30',
    'eveningOvertimeEnd',        '22:00',
    'eveningOvertimeWorkDays',   0.5,
    'holidayRate',               1.0
  )),
  ('insuranceRates', jsonb_build_object(
    'nationalPensionRate',     0.045,
    'healthInsuranceRate',     0.03545,
    'longTermCareRate',        0.1295,
    'employmentInsuranceRate', 0.009,
    'effectiveFrom',           '2026-01-01'
  )),
  ('taxRules', jsonb_build_object(
    'businessIncomeRate',      0.033,
    'dailyWorkerTaxFreeLimit', 150000,
    'dailyWorkerTaxRate',      0.06,
    'localTaxRate',            0.1
  )),
  ('allowanceDefaults', jsonb_build_object(
    'meal',      200000,
    'transport', 200000,
    'phone',     100000
  )),
  ('site', jsonb_build_object(
    'companyName',    '씨엠(CM)건설',
    'siteAddress',    '충남 당진시 신평면 신평로 45',
    'siteLocation',   jsonb_build_object('lat', 37.1234, 'lng', 126.4567),
    'allowedRadius',  100,
    'paymentDay',     15
  )),
  ('annualLeave', jsonb_build_object(
    'firstYearDays',  11,
    'secondYearDays', 15,
    'maxDays',        25,
    'accrualMethod',  'monthly'
  ))
on conflict (category) do nothing;


-- ─── 공휴일 2026–2030 ─────────────────────────────────────────
insert into holidays (date, name, type) values
  -- 2026
  ('2026-01-01', '신정 (새해)',         'public'),
  ('2026-03-01', '삼일절',              'public'),
  ('2026-05-05', '어린이날',            'public'),
  ('2026-06-06', '현충일',              'public'),
  ('2026-08-15', '광복절',              'public'),
  ('2026-10-03', '개천절',              'public'),
  ('2026-10-09', '한글날',              'public'),
  ('2026-12-25', '기독탄신일 (성탄절)', 'public'),
  -- 2027
  ('2027-01-01', '신정',                'public'),
  ('2027-03-01', '삼일절',              'public'),
  ('2027-05-05', '어린이날',            'public'),
  ('2027-06-06', '현충일',              'public'),
  ('2027-08-15', '광복절',              'public'),
  ('2027-10-03', '개천절',              'public'),
  ('2027-10-09', '한글날',              'public'),
  ('2027-12-25', '성탄절',              'public'),
  -- 2028
  ('2028-01-01', '신정',                'public'),
  ('2028-03-01', '삼일절',              'public'),
  ('2028-05-05', '어린이날',            'public'),
  ('2028-06-06', '현충일',              'public'),
  ('2028-08-15', '광복절',              'public'),
  ('2028-10-03', '개천절',              'public'),
  ('2028-10-09', '한글날',              'public'),
  ('2028-12-25', '성탄절',              'public'),
  -- 2029
  ('2029-01-01', '신정',                'public'),
  ('2029-03-01', '삼일절',              'public'),
  ('2029-05-05', '어린이날',            'public'),
  ('2029-06-06', '현충일',              'public'),
  ('2029-08-15', '광복절',              'public'),
  ('2029-10-03', '개천절',              'public'),
  ('2029-10-09', '한글날',              'public'),
  ('2029-12-25', '성탄절',              'public'),
  -- 2030
  ('2030-01-01', '신정',                'public'),
  ('2030-03-01', '삼일절',              'public'),
  ('2030-05-05', '어린이날',            'public'),
  ('2030-06-06', '현충일',              'public'),
  ('2030-08-15', '광복절',              'public'),
  ('2030-10-03', '개천절',              'public'),
  ('2030-10-09', '한글날',              'public'),
  ('2030-12-25', '성탄절',              'public')
on conflict (date) do nothing;
