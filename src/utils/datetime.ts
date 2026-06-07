// 시간대(타임존) 인식 날짜·시각 유틸.
//
// 출퇴근 시각은 서버(submit_attendance RPC)가 timestamptz(절대시각)로 저장한다.
// 화면 표시와 근로시간 분해 계산은 "기기 로컬 타임존"이 아니라 현장 설정 타임존
// (기본 Asia/Seoul)을 기준으로 일관되게 처리해야 한다. 이 모듈이 그 변환을 담당한다.

import type { AllSettings } from "../types";

export const DEFAULT_TIME_ZONE = "Asia/Seoul";

export const TIME_ZONE_OPTIONS: { value: string; label: string }[] = [
  { value: "Asia/Seoul", label: "대한민국 표준시 (Asia/Seoul, UTC+9)" },
  { value: "Asia/Shanghai", label: "중국 표준시 (Asia/Shanghai, UTC+8)" },
  { value: "Asia/Ho_Chi_Minh", label: "베트남 (Asia/Ho_Chi_Minh, UTC+7)" },
  { value: "Asia/Phnom_Penh", label: "캄보디아 (Asia/Phnom_Penh, UTC+7)" },
  { value: "Asia/Yangon", label: "미얀마 (Asia/Yangon, UTC+6:30)" },
  { value: "Asia/Kathmandu", label: "네팔 (Asia/Kathmandu, UTC+5:45)" },
  { value: "UTC", label: "협정 세계시 (UTC)" },
];

/** 설정에서 적용할 타임존을 읽는다. 미설정 시 Asia/Seoul. */
export function getAppTimeZone(settings?: AllSettings | null): string {
  const tz = settings?.site?.timezone;
  return tz && tz.length > 0 ? tz : DEFAULT_TIME_ZONE;
}

/** 주어진 절대시각(Date)을 해당 타임존의 "자정 기준 분(分)"으로 환산한다. (0~1439) */
export function getZonedClockMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

/** 주어진 절대시각(Date)을 해당 타임존 기준 "YYYY-MM-DD" 로 변환한다. */
export function getZonedYmd(date: Date, timeZone: string): string {
  // en-CA 로케일은 YYYY-MM-DD 포맷을 제공한다.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** ISO 시각 문자열을 해당 타임존 기준 "HH:MM" 으로 표시한다. */
export function formatZonedTime(iso: string | null, timeZone: string, fallback = "--:--"): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/** 특정 절대시각(date) 시점에서 해당 타임존이 UTC 대비 갖는 오프셋(ms). 동쪽(UTC+)이면 양수. */
function getZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const map: Record<string, string> = {};
  parts.forEach((p) => {
    if (p.type !== "literal") map[p.type] = p.value;
  });
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second)
  );
  return asUtc - date.getTime();
}

/**
 * "YYYY-MM-DD" + "HH:MM" 을 해당 타임존의 벽시계 시각으로 해석해 UTC ISO 문자열로 변환한다.
 * (관리자 수동 입력처럼 사람이 친 "08:00"을 현장 타임존의 08:00 으로 저장하기 위함)
 */
export function zonedWallTimeToUtcIso(dateStr: string, timeStr: string, timeZone: string): string {
  const naiveUtcMs = new Date(`${dateStr}T${timeStr}:00Z`).getTime();
  const offset = getZoneOffsetMs(new Date(naiveUtcMs), timeZone);
  return new Date(naiveUtcMs - offset).toISOString();
}
