import type {
  AllSettings,
  AttendanceSnapRule,
  Holiday,
  SnapDayType,
  SnapKind,
  WorkTimeSettings,
  Worker,
} from "../types";
import { DEFAULT_TIME_ZONE, getAppTimeZone, getZonedClockMinutes } from "./datetime";

function hhmmToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return hours * 60 + minutes;
}

function overlapMinutes(start: number, end: number, windowStart: number, windowEnd: number): number {
  return Math.max(0, Math.min(end, windowEnd) - Math.max(start, windowStart));
}

/**
 * 근무일의 요일 유형을 4분류로 판정한다.
 * 공휴일 등록일이면 'holiday'가 일/토요일보다 우선한다.
 */
export function getDayType(workDate: string, holidays: Holiday[]): SnapDayType {
  if (holidays.some((h) => h.date === workDate)) return "holiday";
  const parsed = new Date(`${workDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "weekday";
  const day = parsed.getDay();
  if (day === 0) return "sunday";
  if (day === 6) return "saturday";
  return "weekday";
}

/**
 * 타각 시각(설정 타임존 벽시계 분)을 보정 규칙에 따라 인정 시각으로 스냅한다.
 * dayType/kind가 일치하고 raw 시각이 [fromTime, toTime] 구간에 드는 첫 규칙의 snapTo로 보정.
 * 매칭되는 규칙이 없으면 raw 그대로 반환(구간 밖은 보정하지 않음).
 */
export function snapClockMinutes(
  rawMinutes: number,
  dayType: SnapDayType,
  kind: SnapKind,
  snapRules?: AttendanceSnapRule[]
): number {
  if (!snapRules || snapRules.length === 0) return rawMinutes;
  // raw는 0~1439로 정규화해서 비교 (자정 넘김 +1440이 들어와도 안전)
  const raw = ((rawMinutes % 1440) + 1440) % 1440;
  for (const rule of snapRules) {
    if (rule.dayType !== dayType || rule.kind !== kind) continue;
    const from = hhmmToMinutes(rule.fromTime);
    const to = hhmmToMinutes(rule.toTime);
    const inRange = from <= to ? raw >= from && raw <= to : raw >= from || raw <= to; // from>to: 자정 넘김 구간
    if (inRange) return hhmmToMinutes(rule.snapTo);
  }
  return rawMinutes;
}

export function calculateWorkedHours(
  checkInISO: string | null,
  checkOutISO: string | null,
  workTime?: WorkTimeSettings,
  timeZone: string = DEFAULT_TIME_ZONE
): number {
  if (!checkInISO || !checkOutISO) return 0;

  const checkIn = new Date(checkInISO);
  const checkOut = new Date(checkOutISO);
  if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) return 0;

  // 설정 타임존 기준 벽시계 분(分)으로 환산 (기기 로컬 타임존 무관)
  const startMinutes = getZonedClockMinutes(checkIn, timeZone);
  let endMinutes = getZonedClockMinutes(checkOut, timeZone);
  if (endMinutes <= startMinutes) endMinutes += 1440;

  let breakMinutes = 0;
  if (workTime?.lunchStart && workTime?.lunchEnd) {
    const lunchStart = hhmmToMinutes(workTime.lunchStart);
    let lunchEnd = hhmmToMinutes(workTime.lunchEnd);
    if (lunchEnd <= lunchStart) lunchEnd += 1440;

    breakMinutes += overlapMinutes(startMinutes, endMinutes, lunchStart, lunchEnd);

    if (endMinutes > 1440) {
      breakMinutes += overlapMinutes(startMinutes, endMinutes, lunchStart + 1440, lunchEnd + 1440);
    }
  }

  return Math.max(0, (endMinutes - startMinutes - breakMinutes) / 60);
}

/**
 * 해당 근무일이 휴일인지 판정한다.
 * 기준: 일요일(getDay() === 0) 또는 holidays 컬렉션에 등록된 날짜.
 */
export function isHolidayDate(workDate: string, holidays: Holiday[]): boolean {
  const parsed = new Date(`${workDate}T00:00:00`);
  if (!Number.isNaN(parsed.getTime()) && parsed.getDay() === 0) return true;
  return holidays.some((h) => h.date === workDate);
}

export interface DailyBreakdown {
  workHours: number; // 총 근무(점심 제외)
  regularHours: number; // 소정근로 (평일, standardDailyHours 한도)
  overtimeHours: number; // 연장 (평일, 소정 초과분)
  holidayHours: number; // 휴일근로 (휴일, standardDailyHours 한도)
  holidayOvertimeHours: number; // 휴일연장 (휴일, 소정 초과분)
  nightHours: number; // 야간 (22~06시 겹침, 가산 개념이라 위 값과 중첩됨)
  manDays: number; // 공수 (일용/사업소득자용)
}

const EMPTY_BREAKDOWN: DailyBreakdown = {
  workHours: 0,
  regularHours: 0,
  overtimeHours: 0,
  holidayHours: 0,
  holidayOvertimeHours: 0,
  nightHours: 0,
  manDays: 0,
};

/**
 * 출퇴근 시각을 설정값 기준으로 일별 근로시간/공수로 분해한다.
 *
 * 주의: 정밀한 노동법 산정(주 단위 연장 합산, 통상임금 환산 등)이 아니라
 * 설정값(소정시간/야간시간대/공수규칙) 기반의 화면 표시용 근사 분해다.
 */
export function calculateDailyBreakdown(
  checkInISO: string | null,
  checkOutISO: string | null,
  dayType: SnapDayType,
  employmentType: Worker["employmentType"],
  settings: AllSettings
): DailyBreakdown {
  if (!checkInISO || !checkOutISO) return { ...EMPTY_BREAKDOWN };

  const checkIn = new Date(checkInISO);
  const checkOut = new Date(checkOutISO);
  if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) {
    return { ...EMPTY_BREAKDOWN };
  }

  const { workTime, overtimeRules, dailyWorkerRules } = settings;
  const timeZone = getAppTimeZone(settings);
  const isHoliday = dayType !== "weekday";

  // 설정 타임존 기준 벽시계 분(分)으로 환산 후, 타각 보정 규칙으로 인정 시각 스냅
  const startMinutes = snapClockMinutes(
    getZonedClockMinutes(checkIn, timeZone),
    dayType,
    "in",
    overtimeRules.snapRules
  );
  let endMinutes = snapClockMinutes(
    getZonedClockMinutes(checkOut, timeZone),
    dayType,
    "out",
    overtimeRules.snapRules
  );
  // 자정 넘김 보정은 스냅 적용 후에 수행
  if (endMinutes <= startMinutes) endMinutes += 1440;

  // 점심시간 차감
  let breakMinutes = 0;
  if (workTime.lunchStart && workTime.lunchEnd) {
    const lunchStart = hhmmToMinutes(workTime.lunchStart);
    let lunchEnd = hhmmToMinutes(workTime.lunchEnd);
    if (lunchEnd <= lunchStart) lunchEnd += 1440;
    breakMinutes += overlapMinutes(startMinutes, endMinutes, lunchStart, lunchEnd);
    if (endMinutes > 1440) {
      breakMinutes += overlapMinutes(startMinutes, endMinutes, lunchStart + 1440, lunchEnd + 1440);
    }
  }

  const netHours = Math.max(0, (endMinutes - startMinutes - breakMinutes) / 60);

  // 야간 시간대(예: 22:00~06:00) 겹침 — 가산 개념이라 별도 집계
  const nightStart = hhmmToMinutes(overtimeRules.nightStart);
  let nightEnd = hhmmToMinutes(overtimeRules.nightEnd);
  if (nightEnd <= nightStart) nightEnd += 1440;
  let nightMinutes = overlapMinutes(startMinutes, endMinutes, nightStart, nightEnd);
  // 전날 야간대(00:00 이전부터 이어지는 06:00까지)와 익일 야간대 모두 검사
  nightMinutes += overlapMinutes(startMinutes, endMinutes, nightStart - 1440, nightEnd - 1440);
  nightMinutes += overlapMinutes(startMinutes, endMinutes, nightStart + 1440, nightEnd + 1440);
  const nightHours = Math.max(0, nightMinutes / 60);

  // ── 일용/사업소득자: 공수(man-day) 분해 ──
  if (employmentType === "daily" || employmentType === "business") {
    let manDays = 1.0; // 출퇴근 기록이 있으면 기본 1.0공수

    const inWindow = (startHHMM: string, endHHMM: string): boolean => {
      const ws = hhmmToMinutes(startHHMM);
      let we = hhmmToMinutes(endHHMM);
      if (we <= ws) we += 1440;
      return overlapMinutes(startMinutes, endMinutes, ws, we) > 0;
    };

    if (inWindow(dailyWorkerRules.earlyMorningStart, dailyWorkerRules.earlyMorningEnd)) {
      manDays += dailyWorkerRules.earlyMorningWorkDays;
    }
    if (inWindow(dailyWorkerRules.afternoonOvertimeStart, dailyWorkerRules.afternoonOvertimeEnd)) {
      manDays += dailyWorkerRules.afternoonOvertimeWorkDays;
    }
    if (inWindow(dailyWorkerRules.eveningOvertimeStart, dailyWorkerRules.eveningOvertimeEnd)) {
      manDays += dailyWorkerRules.eveningOvertimeWorkDays;
    }
    if (isHoliday) manDays *= dailyWorkerRules.holidayRate;

    return {
      ...EMPTY_BREAKDOWN,
      workHours: netHours,
      nightHours,
      manDays,
    };
  }

  // ── 월급/시급: 시간 분해 ──
  const standardHours = workTime.standardDailyHours || 8;
  if (isHoliday) {
    return {
      ...EMPTY_BREAKDOWN,
      workHours: netHours,
      holidayHours: Math.min(netHours, standardHours),
      holidayOvertimeHours: Math.max(0, netHours - standardHours),
      nightHours,
    };
  }

  return {
    ...EMPTY_BREAKDOWN,
    workHours: netHours,
    regularHours: Math.min(netHours, standardHours),
    overtimeHours: Math.max(0, netHours - standardHours),
    nightHours,
  };
}
