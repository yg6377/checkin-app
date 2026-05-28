import type { WorkTimeSettings } from "../types";

function hhmmToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return hours * 60 + minutes;
}

function overlapMinutes(start: number, end: number, windowStart: number, windowEnd: number): number {
  return Math.max(0, Math.min(end, windowEnd) - Math.max(start, windowStart));
}

export function calculateWorkedHours(
  checkInISO: string | null,
  checkOutISO: string | null,
  workTime?: WorkTimeSettings
): number {
  if (!checkInISO || !checkOutISO) return 0;

  const checkIn = new Date(checkInISO);
  const checkOut = new Date(checkOutISO);
  if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) return 0;

  const startOfCheckInDay = new Date(
    checkIn.getFullYear(),
    checkIn.getMonth(),
    checkIn.getDate()
  ).getTime();
  const startMinutes = (checkIn.getTime() - startOfCheckInDay) / 60_000;
  let endMinutes = (checkOut.getTime() - startOfCheckInDay) / 60_000;
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
