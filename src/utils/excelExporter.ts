import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { AllSettings, Worker, Holiday } from "../types";
import { AttendanceRecord } from "../context/SupabaseContext";
import { getWorkerAllowances } from "./payrollCalculator";

// ============================================================
// 공통 헬퍼
// ============================================================

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function fmtHHMM(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

function isHolidayDate(date: Date, holidays: Holiday[]): boolean {
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return true;
  const key = ymd(date);
  return holidays.some((h) => h.date === key);
}

// 분 단위 [start, end) 겹침 길이 (분)
function overlapMin(aStart: number, aEnd: number, bStart: number, bEnd: number): number {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

// "HH:MM" → 분
function hhmmToMin(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

/**
 * 하루 출퇴근 시각을 기본/연장/휴일/휴일연장/심야 시간으로 분해.
 * - 점심시간이 출퇴근 범위에 포함되면 1시간 차감
 * - 평일: 기본 = min(net, 8h), 연장 = max(0, net - 8h)
 * - 휴일: 휴일 = min(net, 8h), 휴일연장 = max(0, net - 8h)
 * - 심야: 22:00~06:00 범위에 걸친 분량 (별도 표기, 합산에서 빠지지 않음 — 참고용)
 */
function splitDayHours(
  checkInISO: string | null,
  checkOutISO: string | null,
  isHoliday: boolean,
  settings: AllSettings
): { base: number; overtime: number; holiday: number; holidayOvertime: number; night: number } {
  if (!checkInISO || !checkOutISO) {
    return { base: 0, overtime: 0, holiday: 0, holidayOvertime: 0, night: 0 };
  }

  const inDate = new Date(checkInISO);
  const outDate = new Date(checkOutISO);

  // 같은 날 기준 분 단위 (자정 넘김은 +1440)
  const baseMid = new Date(inDate.getFullYear(), inDate.getMonth(), inDate.getDate()).getTime();
  const startMin = (inDate.getTime() - baseMid) / 60000;
  let endMin = (outDate.getTime() - baseMid) / 60000;
  if (endMin <= startMin) endMin += 1440;

  // 점심시간 (보통 12:00-13:00) 겹침 차감
  const lunchStart = hhmmToMin(settings.workTime.lunchStart);
  const lunchEnd = hhmmToMin(settings.workTime.lunchEnd);
  const lunchOverlap = overlapMin(startMin, endMin, lunchStart, lunchEnd);

  // 심야 (22:00 - 06:00 다음날)
  const nightStartMin = hhmmToMin(settings.overtimeRules.nightStart); // 22:00 → 1320
  const nightEndMin = hhmmToMin(settings.overtimeRules.nightEnd);     // 06:00 → 360
  // 야간 윈도우: [22:00, 30:00) (=06:00 익일)
  const nightOverlap = overlapMin(startMin, endMin, nightStartMin, 1440 + nightEndMin)
    + overlapMin(startMin, endMin, 0, nightEndMin); // 당일 0~6시 부분
  const nightHours = nightOverlap / 60;

  const netMin = endMin - startMin - lunchOverlap;
  const netHours = Math.max(0, netMin / 60);
  const std = settings.workTime.standardDailyHours;

  if (isHoliday) {
    return {
      base: 0,
      overtime: 0,
      holiday: Math.min(netHours, std),
      holidayOvertime: Math.max(0, netHours - std),
      night: nightHours,
    };
  }
  return {
    base: Math.min(netHours, std),
    overtime: Math.max(0, netHours - std),
    holiday: 0,
    holidayOvertime: 0,
    night: nightHours,
  };
}

const THIN = { style: "thin" as const, color: { argb: "FF94A3B8" } };
const ALL_BORDERS = { top: THIN, left: THIN, right: THIN, bottom: THIN };

function setHeader(cell: ExcelJS.Cell) {
  cell.font = { bold: true, size: 10 };
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  cell.border = ALL_BORDERS;
}

function setCell(cell: ExcelJS.Cell, value: any, opts: Partial<{ bold: boolean; numFmt: string; align: "left" | "center" | "right" }> = {}) {
  cell.value = value;
  cell.border = ALL_BORDERS;
  cell.alignment = { horizontal: opts.align || "center", vertical: "middle", wrapText: true };
  if (opts.bold) cell.font = { bold: true };
  if (opts.numFmt) cell.numFmt = opts.numFmt;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ============================================================
// 1) 노무대장 (통합 1시트) — 26년5월노무대장_Rev01.xlsx 양식
// ============================================================

export interface ExportContext {
  year: number;
  month: number; // 1-12
  workers: Worker[];
  records: AttendanceRecord[];
  holidays: Holiday[];
  settings: AllSettings;
  companyName?: string;
}

interface WorkerDayTotals {
  inAt: string | null;
  outAt: string | null;
  isHoliday: boolean;
  base: number;
  overtime: number;
  holiday: number;
  holidayOvertime: number;
  night: number;
}

interface WorkerMonthAggregate {
  worker: Worker;
  byDay: Map<number, WorkerDayTotals>; // day-of-month → totals
  workedDays: number;                  // 출근 일수
  totalBase: number;
  totalOvertime: number;
  totalHoliday: number;
  totalHolidayOvertime: number;
  totalNight: number;
}

function aggregateMonth(ctx: ExportContext): WorkerMonthAggregate[] {
  const monthKey = `${ctx.year}-${pad2(ctx.month)}`;
  const dim = daysInMonth(ctx.year, ctx.month);

  // 휴일 판정 캐시 (해당 월)
  const holidayByDay = new Map<number, boolean>();
  for (let d = 1; d <= dim; d++) {
    holidayByDay.set(d, isHolidayDate(new Date(ctx.year, ctx.month - 1, d), ctx.holidays));
  }

  // worker id → 일자 → record
  const byWorker = new Map<string, Map<number, AttendanceRecord>>();
  for (const r of ctx.records) {
    if (!r.workDate.startsWith(monthKey)) continue;
    const day = parseInt(r.workDate.slice(8, 10), 10);
    if (!byWorker.has(r.workerId)) byWorker.set(r.workerId, new Map());
    byWorker.get(r.workerId)!.set(day, r);
  }

  return ctx.workers.map((w) => {
    const dayMap = byWorker.get(w.id!) || new Map();
    const byDay = new Map<number, WorkerDayTotals>();
    let workedDays = 0;
    let tB = 0, tO = 0, tH = 0, tHO = 0, tN = 0;

    for (let d = 1; d <= dim; d++) {
      const isH = holidayByDay.get(d)!;
      const rec = dayMap.get(d);
      const parts = splitDayHours(rec?.checkInAt || null, rec?.checkOutAt || null, isH, ctx.settings);
      if (rec?.checkInAt) workedDays += 1;
      byDay.set(d, {
        inAt: rec?.checkInAt || null,
        outAt: rec?.checkOutAt || null,
        isHoliday: isH,
        ...parts,
      });
      tB += parts.base;
      tO += parts.overtime;
      tH += parts.holiday;
      tHO += parts.holidayOvertime;
      tN += parts.night;
    }

    return {
      worker: w,
      byDay,
      workedDays,
      totalBase: round2(tB),
      totalOvertime: round2(tO),
      totalHoliday: round2(tH),
      totalHolidayOvertime: round2(tHO),
      totalNight: round2(tN),
    };
  });
}

function empTypeLabel(t: Worker["employmentType"]): string {
  return t === "salary" ? "월급" : t === "hourly" ? "시급" : t === "daily" ? "일용" : "사업";
}

function unitRate(w: Worker): number {
  if (w.employmentType === "salary") return w.salarySettings.monthlyBase;
  if (w.employmentType === "hourly") return w.salarySettings.hourlyRate;
  return w.salarySettings.dailyRate;
}

export async function exportLaborLedger(ctx: ExportContext): Promise<void> {
  const dim = daysInMonth(ctx.year, ctx.month);
  const wb = new ExcelJS.Workbook();
  wb.creator = "Workforce Core";
  wb.created = new Date();
  const ws = wb.addWorksheet(`${ctx.year}년${ctx.month}월전체`, {
    views: [{ state: "frozen", xSplit: 13, ySplit: 4 }],
    pageSetup: { orientation: "landscape", paperSize: 9, fitToPage: true },
  });

  const companyName = ctx.companyName || ctx.settings.site.companyName || "회사명";

  // ── 1행: 제목
  const title = `${ctx.year}년 ${ctx.month}월 노무대장`;
  const titleRow = ws.getRow(1);
  titleRow.getCell(1).value = `▣ ${companyName}`;
  titleRow.getCell(1).font = { bold: true, size: 12 };
  const titleCell = ws.getCell(1, 14);
  titleCell.value = title;
  titleCell.font = { bold: true, size: 16 };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  const paymentDay = ctx.settings.site.paymentDay;
  const payDate = new Date(ctx.year, ctx.month, paymentDay); // 다음 달 paymentDay
  const payInfo = ws.getCell(2, 14);
  payInfo.value = `지급일 : ${payDate.getFullYear()}년 ${payDate.getMonth() + 1}월 ${paymentDay}일`;
  payInfo.font = { bold: true };

  // ── 헤더 (3행, 4행)
  // 기본 정보: A=NO, B=사번, C=이름, D=영문이름, E=고용형태, F=주민번호, G=입사일, H=퇴사일, I=계좌, J=연락처, K=주소, L=직무, M=구분
  const fixedHeaders = [
    "NO", "사번", "이름", "영문이름", "고용형태", "주민등록번호", "입사일", "퇴사일",
    "계좌번호", "연락처", "주소", "직무", "구분",
  ];
  for (let i = 0; i < fixedHeaders.length; i++) {
    ws.mergeCells(3, i + 1, 4, i + 1);
    const c = ws.getCell(3, i + 1);
    c.value = fixedHeaders[i];
    setHeader(c);
  }

  // 일자 헤더: col 14 (N) 부터 14 + dim - 1
  const dayStartCol = 14;
  for (let d = 1; d <= dim; d++) {
    const col = dayStartCol + d - 1;
    ws.mergeCells(3, col, 4, col);
    const c = ws.getCell(3, col);
    c.value = new Date(ctx.year, ctx.month - 1, d);
    c.numFmt = "m/d";
    setHeader(c);
    ws.getColumn(col).width = 7;
  }

  // 요약 컬럼: 일수, 형태, 단가, 기본급/연장, 식대/휴일, 자가운전/휴일연장, 통신비/심야, 직책수당/기타, 합계, 국민연금/고용보험, 건강보험/소득세, 장기요양/지방소득세, 숙소료/가불, 기타, 합계, 실지급액, 비고
  const summaryStartCol = dayStartCol + dim;
  const summaryTopBottom: [string, string][] = [
    ["일수", ""],         // +0
    ["형태", ""],         // +1
    ["단가", ""],         // +2
    ["기본급", "연장수당"],      // +3
    ["식대", "휴일수당"],        // +4
    ["자가운전", "휴일연장"],     // +5
    ["통신비", "심야수당"],      // +6
    ["직책수당", "기타"],        // +7
    ["지급계", ""],       // +8
    ["국민연금", "고용보험"],     // +9 — 공제
    ["건강보험", "소득세"],       // +10
    ["장기요양", "지방소득세"],   // +11
    ["숙소료", "가불금"],        // +12
    ["기타", ""],         // +13
    ["공제계", ""],       // +14
    ["실지급액", ""],     // +15
    ["비고", ""],         // +16
  ];
  summaryTopBottom.forEach(([top, bot], i) => {
    const col = summaryStartCol + i;
    if (bot === "") {
      ws.mergeCells(3, col, 4, col);
      const c = ws.getCell(3, col);
      c.value = top;
      setHeader(c);
    } else {
      const t = ws.getCell(3, col);
      t.value = top; setHeader(t);
      const b = ws.getCell(4, col);
      b.value = bot; setHeader(b);
    }
    ws.getColumn(col).width = 11;
  });

  // 지급내역/공제내역 상단 그룹 라벨 (2행)
  // 일수~지급계 = summaryStartCol ~ summaryStartCol+8
  ws.mergeCells(2, summaryStartCol + 3, 2, summaryStartCol + 8);
  const payGroupCell = ws.getCell(2, summaryStartCol + 3);
  payGroupCell.value = "지 급 내 역";
  payGroupCell.font = { bold: true };
  payGroupCell.alignment = { horizontal: "center" };
  payGroupCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };

  ws.mergeCells(2, summaryStartCol + 9, 2, summaryStartCol + 14);
  const dedGroupCell = ws.getCell(2, summaryStartCol + 9);
  dedGroupCell.value = "공 제 내 역";
  dedGroupCell.font = { bold: true };
  dedGroupCell.alignment = { horizontal: "center" };
  dedGroupCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };

  // ── 데이터 ── 근로자 1명 = 3행 (출근 / 퇴근 / 연장 or 공수)
  const agg = aggregateMonth(ctx);
  let row = 5;

  agg.forEach((a, idx) => {
    const w = a.worker;
    const r1 = row;       // 출근
    const r2 = row + 1;   // 퇴근
    const r3 = row + 2;   // 연장/공수

    // 고정 정보 — 3행 병합 (A ~ L = 12개)
    const fixedValues: (string | number)[] = [
      idx + 1,
      w.workerId,
      w.name,
      w.englishName || "",
      empTypeLabel(w.employmentType),
      w.residentNumber || "",
      w.joinDate || "",
      w.retireDate || "",
      w.bankSettings ? `${w.bankSettings.bankName || ""} ${w.bankSettings.accountNo || ""}`.trim() : "",
      w.phone || "",
      w.address || "",
      w.duty || "",
    ];
    fixedValues.forEach((v, i) => {
      ws.mergeCells(r1, i + 1, r3, i + 1);
      setCell(ws.getCell(r1, i + 1), v, { align: i <= 1 ? "center" : "left" });
    });

    // M열 (구분) — 3행 각각
    const isDaily = w.employmentType === "daily" || w.employmentType === "business";
    setCell(ws.getCell(r1, 13), "출근", { bold: true });
    setCell(ws.getCell(r2, 13), "퇴근", { bold: true });
    setCell(ws.getCell(r3, 13), isDaily ? "공수" : "연장", { bold: true });

    // 일자별
    for (let d = 1; d <= dim; d++) {
      const col = dayStartCol + d - 1;
      const day = a.byDay.get(d)!;
      setCell(ws.getCell(r1, col), day.inAt ? fmtHHMM(day.inAt) : "");
      setCell(ws.getCell(r2, col), day.outAt ? fmtHHMM(day.outAt) : "");

      const otOrManDays = isDaily
        ? (day.inAt ? (day.isHoliday ? ctx.settings.dailyWorkerRules.holidayRate : 1) : 0) // 단순화: 공수 1.0 or 휴일가산
        : round2(day.overtime + day.holiday + day.holidayOvertime);
      setCell(ws.getCell(r3, col), otOrManDays || "");

      if (day.isHoliday) {
        // 휴일 컬럼 살짝 음영
        [r1, r2, r3].forEach((rr) => {
          ws.getCell(rr, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7ED" } };
        });
      }
    }

    // 요약 영역
    const allowances = getWorkerAllowances(w, ctx.settings);
    const unit = unitRate(w);
    const empType = empTypeLabel(w.employmentType);

    // 기본급 / 연장수당 추정 (단순화 — 시뮬레이터의 정밀 계산은 별도 탭에서)
    let basePay = 0;
    let overtimePay = 0;
    let holidayPay = 0;
    let holidayOTPay = 0;
    let nightPay = 0;

    if (w.employmentType === "salary") {
      basePay = w.salarySettings.monthlyBase;
      const hr = basePay / 209;
      overtimePay = a.totalOvertime * hr * ctx.settings.overtimeRules.weekdayOvertimeRate;
      holidayPay = a.totalHoliday * hr * ctx.settings.overtimeRules.holidayRate;
      holidayOTPay = a.totalHolidayOvertime * hr * ctx.settings.overtimeRules.holidayOvertimeRate;
      nightPay = a.totalNight * hr * ctx.settings.overtimeRules.nightRate;
    } else if (w.employmentType === "hourly") {
      const hr = w.salarySettings.hourlyRate;
      basePay = a.totalBase * hr;
      overtimePay = a.totalOvertime * hr * ctx.settings.overtimeRules.weekdayOvertimeRate;
      holidayPay = a.totalHoliday * hr * ctx.settings.overtimeRules.holidayRate;
      holidayOTPay = a.totalHolidayOvertime * hr * ctx.settings.overtimeRules.holidayOvertimeRate;
      nightPay = a.totalNight * hr * ctx.settings.overtimeRules.nightRate;
    } else {
      // 일용/사업: 단가 × 공수
      basePay = a.workedDays * unit;
    }

    // 4대보험 / 세금 (간이)
    const taxable = basePay + overtimePay + holidayPay + holidayOTPay + nightPay;
    let nps = 0, hi = 0, ltc = 0, ei = 0, it = 0, lit = 0;
    if (w.employmentType === "salary" || w.employmentType === "hourly") {
      nps = Math.floor(taxable * ctx.settings.insuranceRates.nationalPensionRate);
      hi = Math.floor(taxable * ctx.settings.insuranceRates.healthInsuranceRate);
      ltc = Math.floor(hi * ctx.settings.insuranceRates.longTermCareRate);
      ei = Math.floor(taxable * ctx.settings.insuranceRates.employmentInsuranceRate);
      let r = 0.015;
      if (taxable > 4000000) r = 0.045; else if (taxable > 2500000) r = 0.03;
      it = Math.floor(taxable * r);
      lit = Math.floor(it * ctx.settings.taxRules.localTaxRate);
    } else if (w.employmentType === "daily") {
      const taxFree = ctx.settings.taxRules.dailyWorkerTaxFreeLimit;
      const tr = ctx.settings.taxRules.dailyWorkerTaxRate;
      const dailyTax = Math.max(0, unit - taxFree) * tr * 0.45;
      it = Math.floor(dailyTax * a.workedDays);
      lit = Math.floor(it * ctx.settings.taxRules.localTaxRate);
    } else {
      it = Math.floor(basePay * ctx.settings.taxRules.businessIncomeRate / (1 + ctx.settings.taxRules.localTaxRate));
      lit = Math.floor(it * ctx.settings.taxRules.localTaxRate);
    }

    const housing = w.deductionSettings.housingFee || 0;
    const advance = w.deductionSettings.cashAdvance || 0;
    const customDed = (w.deductionSettings.customDeductions || []).reduce((s, x) => s + (x.amount || 0), 0);

    const grossSum = Math.floor(taxable + allowances.meal + allowances.transport + allowances.phone);
    const dedSum = nps + hi + ltc + ei + it + lit + housing + advance + customDed;
    const netPay = Math.max(0, grossSum - dedSum);

    const NUM = "#,##0";

    // 일수 (3행 병합)
    ws.mergeCells(r1, summaryStartCol + 0, r3, summaryStartCol + 0);
    setCell(ws.getCell(r1, summaryStartCol + 0), a.workedDays, { bold: true });

    // 형태
    ws.mergeCells(r1, summaryStartCol + 1, r3, summaryStartCol + 1);
    setCell(ws.getCell(r1, summaryStartCol + 1), empType);

    // 단가
    ws.mergeCells(r1, summaryStartCol + 2, r3, summaryStartCol + 2);
    setCell(ws.getCell(r1, summaryStartCol + 2), unit, { numFmt: NUM, align: "right" });

    // 기본급 (r1) / 연장수당 (r2)
    setCell(ws.getCell(r1, summaryStartCol + 3), Math.floor(basePay), { numFmt: NUM, align: "right" });
    setCell(ws.getCell(r2, summaryStartCol + 3), Math.floor(overtimePay), { numFmt: NUM, align: "right" });

    // 식대 (r1) / 휴일수당 (r2)
    setCell(ws.getCell(r1, summaryStartCol + 4), allowances.meal, { numFmt: NUM, align: "right" });
    setCell(ws.getCell(r2, summaryStartCol + 4), Math.floor(holidayPay), { numFmt: NUM, align: "right" });

    // 자가운전 (r1) / 휴일연장 (r2)
    setCell(ws.getCell(r1, summaryStartCol + 5), allowances.transport, { numFmt: NUM, align: "right" });
    setCell(ws.getCell(r2, summaryStartCol + 5), Math.floor(holidayOTPay), { numFmt: NUM, align: "right" });

    // 통신비 (r1) / 심야수당 (r2)
    setCell(ws.getCell(r1, summaryStartCol + 6), allowances.phone, { numFmt: NUM, align: "right" });
    setCell(ws.getCell(r2, summaryStartCol + 6), Math.floor(nightPay), { numFmt: NUM, align: "right" });

    // 직책수당 (r1) / 기타 (r2) — 미구현, 0
    setCell(ws.getCell(r1, summaryStartCol + 7), 0, { numFmt: NUM, align: "right" });
    setCell(ws.getCell(r2, summaryStartCol + 7), 0, { numFmt: NUM, align: "right" });

    // 지급계 (3행 병합)
    ws.mergeCells(r1, summaryStartCol + 8, r3, summaryStartCol + 8);
    setCell(ws.getCell(r1, summaryStartCol + 8), grossSum, { numFmt: NUM, bold: true, align: "right" });

    // 공제 영역
    setCell(ws.getCell(r1, summaryStartCol + 9), nps, { numFmt: NUM, align: "right" });
    setCell(ws.getCell(r2, summaryStartCol + 9), ei, { numFmt: NUM, align: "right" });

    setCell(ws.getCell(r1, summaryStartCol + 10), hi, { numFmt: NUM, align: "right" });
    setCell(ws.getCell(r2, summaryStartCol + 10), it, { numFmt: NUM, align: "right" });

    setCell(ws.getCell(r1, summaryStartCol + 11), ltc, { numFmt: NUM, align: "right" });
    setCell(ws.getCell(r2, summaryStartCol + 11), lit, { numFmt: NUM, align: "right" });

    setCell(ws.getCell(r1, summaryStartCol + 12), housing, { numFmt: NUM, align: "right" });
    setCell(ws.getCell(r2, summaryStartCol + 12), advance, { numFmt: NUM, align: "right" });

    // 기타 (3행 병합)
    ws.mergeCells(r1, summaryStartCol + 13, r3, summaryStartCol + 13);
    setCell(ws.getCell(r1, summaryStartCol + 13), customDed, { numFmt: NUM, align: "right" });

    // 공제계 (3행 병합)
    ws.mergeCells(r1, summaryStartCol + 14, r3, summaryStartCol + 14);
    setCell(ws.getCell(r1, summaryStartCol + 14), dedSum, { numFmt: NUM, bold: true, align: "right" });

    // 실지급액 (3행 병합)
    ws.mergeCells(r1, summaryStartCol + 15, r3, summaryStartCol + 15);
    setCell(ws.getCell(r1, summaryStartCol + 15), netPay, { numFmt: NUM, bold: true, align: "right" });

    // 비고 (3행 병합)
    ws.mergeCells(r1, summaryStartCol + 16, r3, summaryStartCol + 16);
    setCell(ws.getCell(r1, summaryStartCol + 16), w.nationality && w.nationality !== "대한민국" ? w.nationality : "");

    row += 3;
  });

  // 컬럼 너비 조정 (고정 영역)
  ws.getColumn(1).width = 5;   // NO
  ws.getColumn(2).width = 10;  // 사번
  ws.getColumn(3).width = 12;  // 이름
  ws.getColumn(4).width = 16;  // 영문
  ws.getColumn(5).width = 8;   // 형태
  ws.getColumn(6).width = 16;  // 주민
  ws.getColumn(7).width = 12;  // 입사
  ws.getColumn(8).width = 12;  // 퇴사
  ws.getColumn(9).width = 22;  // 계좌
  ws.getColumn(10).width = 14; // 연락
  ws.getColumn(11).width = 22; // 주소
  ws.getColumn(12).width = 10; // 직무
  ws.getColumn(13).width = 6;  // 구분

  const buf = await wb.xlsx.writeBuffer();
  saveAs(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${ctx.year}년${ctx.month}월_노무대장.xlsx`
  );
}

// ============================================================
// 2) 출퇴근명부 (4시트) — 2605-외국인근로자 출퇴근명부.xlsx 양식
// ============================================================

export async function exportAttendanceBook(ctx: ExportContext): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Workforce Core";
  wb.created = new Date();

  // ── Sheet 1: 1.설정(통합) ──
  const wsSet = wb.addWorksheet("1.설정(통합)");
  const settingRows: { label: string; pick: (w: Worker) => any }[] = [
    { label: "기본 정보", pick: () => "" },
    { label: "입 사 일", pick: (w) => w.joinDate ? new Date(w.joinDate) : "" },
    { label: "사원코드", pick: (w) => w.workerId },
    { label: "부서명", pick: (w) => w.department },
    { label: "성명", pick: (w) => w.name },
    { label: "직급", pick: (w) => w.duty },
    { label: "예금주", pick: (w) => w.bankSettings?.holder || "" },
    { label: "계좌번호", pick: (w) => w.bankSettings?.accountNo || "" },
    { label: "기본 시급", pick: (w) => w.salarySettings.hourlyRate },
    { label: "연장/휴일 가산율", pick: () => ctx.settings.overtimeRules.weekdayOvertimeRate },
    { label: "휴일연장 가산율", pick: () => ctx.settings.overtimeRules.holidayOvertimeRate },
    { label: "심야 가산율", pick: () => ctx.settings.overtimeRules.nightRate },
    { label: "점심시간(시간)", pick: () => ctx.settings.workTime.lunchDuration },
    { label: "변동/고정 수당", pick: () => "" },
    { label: "성과금", pick: () => 0 },
    { label: "식대", pick: (w) => w.salarySettings.allowances.meal ?? ctx.settings.allowanceDefaults.meal },
    { label: "자가운전보조비", pick: (w) => w.salarySettings.allowances.transport ?? ctx.settings.allowanceDefaults.transport },
    { label: "숙소료", pick: (w) => w.deductionSettings.housingFee || 0 },
    { label: "가불금", pick: (w) => w.deductionSettings.cashAdvance || 0 },
  ];

  // 헤더 (1행): 항목 | 근로자1 | 근로자2 | ...
  const hdr1 = wsSet.getRow(1);
  setCell(hdr1.getCell(1), "항목", { bold: true });
  hdr1.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  ctx.workers.forEach((w, i) => {
    const c = hdr1.getCell(2 + i);
    setCell(c, w.name, { bold: true });
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  });

  settingRows.forEach((rdef, ri) => {
    const r = wsSet.getRow(2 + ri);
    setCell(r.getCell(1), rdef.label, { align: "left", bold: rdef.label === "기본 정보" || rdef.label === "변동/고정 수당" });
    if (rdef.label === "기본 정보" || rdef.label === "변동/고정 수당") {
      r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
    }
    ctx.workers.forEach((w, i) => {
      const v = rdef.pick(w);
      const c = r.getCell(2 + i);
      setCell(c, v, { align: typeof v === "number" ? "right" : "center", numFmt: typeof v === "number" ? "#,##0" : undefined });
      if (v instanceof Date) c.numFmt = "yyyy-mm-dd";
    });
  });

  wsSet.getColumn(1).width = 20;
  for (let i = 0; i < ctx.workers.length; i++) wsSet.getColumn(2 + i).width = 16;

  // ── Sheet 2: 2.공휴일리스트 ──
  const wsHol = wb.addWorksheet("2.공휴일리스트");
  setHeader(wsHol.getCell(1, 1)); wsHol.getCell(1, 1).value = "날짜";
  setHeader(wsHol.getCell(1, 2)); wsHol.getCell(1, 2).value = "공휴일명";
  const sortedHolidays = [...ctx.holidays].sort((a, b) => a.date.localeCompare(b.date));
  sortedHolidays.forEach((h, i) => {
    const r = wsHol.getRow(2 + i);
    setCell(r.getCell(1), new Date(h.date), { align: "center" });
    r.getCell(1).numFmt = "yyyy-mm-dd";
    setCell(r.getCell(2), h.name, { align: "left" });
  });
  wsHol.getColumn(1).width = 14;
  wsHol.getColumn(2).width = 18;

  // ── Sheet 3: 3.출퇴근기록부(통합) ──
  const wsAtt = wb.addWorksheet("3.출퇴근기록부(통합)", {
    views: [{ state: "frozen", xSplit: 3, ySplit: 3 }],
  });
  const dim = daysInMonth(ctx.year, ctx.month);
  const agg = aggregateMonth(ctx); // 동일 로직 재사용

  // 1행: 연도/월
  const r1 = wsAtt.getRow(1);
  setCell(r1.getCell(1), "▶ 연도/월 입력", { bold: true, align: "left" });
  r1.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
  setCell(r1.getCell(5), "연도:", { bold: true });
  setCell(r1.getCell(6), ctx.year);
  setCell(r1.getCell(7), "월:", { bold: true });
  setCell(r1.getCell(8), ctx.month);

  // 2행: 근로자명 (7컬럼씩 병합) — D부터 시작
  // A,B,C = 일/요일/휴일
  ws_mergeHeader(wsAtt, 2, 1, 3, "고정");
  wsAtt.mergeCells(2, 1, 2, 3);
  setHeader(wsAtt.getCell(2, 1));
  wsAtt.getCell(2, 1).value = "공통";

  agg.forEach((a, idx) => {
    const startCol = 4 + idx * 7;
    wsAtt.mergeCells(2, startCol, 2, startCol + 6);
    setHeader(wsAtt.getCell(2, startCol));
    wsAtt.getCell(2, startCol).value = a.worker.name;
  });

  // 3행: 컬럼 헤더 — 일, 요일, 휴일, [출근, 퇴근, 기본, 연장, 휴일, 휴일연장, 심야] × n
  const fixedColHdrs = ["일", "요일", "휴일"];
  fixedColHdrs.forEach((h, i) => {
    setHeader(wsAtt.getCell(3, i + 1));
    wsAtt.getCell(3, i + 1).value = h;
  });
  const perWorkerHdrs = ["출근", "퇴근", "기본", "연장", "휴일", "휴일연장", "심야"];
  agg.forEach((_, idx) => {
    const startCol = 4 + idx * 7;
    perWorkerHdrs.forEach((h, i) => {
      setHeader(wsAtt.getCell(3, startCol + i));
      wsAtt.getCell(3, startCol + i).value = h;
    });
  });

  // 데이터 행 (각 일자)
  for (let d = 1; d <= dim; d++) {
    const row = 3 + d;
    const date = new Date(ctx.year, ctx.month - 1, d);
    const dow = WEEKDAY_KO[date.getDay()];
    const isH = isHolidayDate(date, ctx.holidays);

    const dc = wsAtt.getCell(row, 1);
    setCell(dc, date, { align: "center" });
    dc.numFmt = "m/d";
    setCell(wsAtt.getCell(row, 2), dow);
    setCell(wsAtt.getCell(row, 3), isH ? "휴일" : "평일");
    if (isH) {
      for (let cc = 1; cc <= 3; cc++) wsAtt.getCell(row, cc).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7ED" } };
    }

    agg.forEach((a, idx) => {
      const startCol = 4 + idx * 7;
      const day = a.byDay.get(d)!;
      const inS = day.inAt ? fmtHHMM(day.inAt) : "";
      const outS = day.outAt ? fmtHHMM(day.outAt) : "";
      setCell(wsAtt.getCell(row, startCol + 0), inS);
      setCell(wsAtt.getCell(row, startCol + 1), outS);
      setCell(wsAtt.getCell(row, startCol + 2), day.base ? round2(day.base) : (day.inAt ? 0 : ""));
      setCell(wsAtt.getCell(row, startCol + 3), day.overtime ? round2(day.overtime) : (day.inAt && !isH ? 0 : ""));
      setCell(wsAtt.getCell(row, startCol + 4), day.holiday ? round2(day.holiday) : (day.inAt && isH ? 0 : ""));
      setCell(wsAtt.getCell(row, startCol + 5), day.holidayOvertime ? round2(day.holidayOvertime) : (day.inAt && isH ? 0 : ""));
      setCell(wsAtt.getCell(row, startCol + 6), day.night ? round2(day.night) : (day.inAt ? 0 : ""));
      if (isH) {
        for (let i = 0; i < 7; i++) wsAtt.getCell(row, startCol + i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7ED" } };
      }
    });
  }

  // 합계 행
  const sumRow = 3 + dim + 1;
  wsAtt.mergeCells(sumRow, 1, sumRow, 3);
  const sumLabel = wsAtt.getCell(sumRow, 1);
  setCell(sumLabel, "합  계", { bold: true });
  sumLabel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };

  agg.forEach((a, idx) => {
    const startCol = 4 + idx * 7;
    setCell(wsAtt.getCell(sumRow, startCol + 0), "", { bold: true });
    setCell(wsAtt.getCell(sumRow, startCol + 1), "", { bold: true });
    setCell(wsAtt.getCell(sumRow, startCol + 2), a.totalBase, { bold: true });
    setCell(wsAtt.getCell(sumRow, startCol + 3), a.totalOvertime, { bold: true });
    setCell(wsAtt.getCell(sumRow, startCol + 4), a.totalHoliday, { bold: true });
    setCell(wsAtt.getCell(sumRow, startCol + 5), a.totalHolidayOvertime, { bold: true });
    setCell(wsAtt.getCell(sumRow, startCol + 6), a.totalNight, { bold: true });
    for (let i = 0; i < 7; i++) {
      wsAtt.getCell(sumRow, startCol + i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
    }
  });

  wsAtt.getColumn(1).width = 8;
  wsAtt.getColumn(2).width = 5;
  wsAtt.getColumn(3).width = 6;
  for (let i = 0; i < agg.length; i++) {
    const sc = 4 + i * 7;
    wsAtt.getColumn(sc + 0).width = 8;  // 출근
    wsAtt.getColumn(sc + 1).width = 8;  // 퇴근
    wsAtt.getColumn(sc + 2).width = 6;  // 기본
    wsAtt.getColumn(sc + 3).width = 6;  // 연장
    wsAtt.getColumn(sc + 4).width = 6;  // 휴일
    wsAtt.getColumn(sc + 5).width = 7;  // 휴일연장
    wsAtt.getColumn(sc + 6).width = 6;  // 심야
  }

  // ── Sheet 4: 4.급여명세서 — 첫 근로자 기준 1장 ──
  const wsPay = wb.addWorksheet("4.급여명세서");
  const first = ctx.workers[0];
  const firstAgg = agg[0];
  if (first && firstAgg) {
    wsPay.mergeCells(1, 2, 1, 19);
    const title = wsPay.getCell(1, 2);
    title.value = `${ctx.year}년 ${ctx.month}월 급여명세서`;
    title.font = { bold: true, size: 14 };
    title.alignment = { horizontal: "center", vertical: "middle" };

    const allowances = getWorkerAllowances(first, ctx.settings);
    const hr = first.salarySettings.hourlyRate;
    const basePay = Math.floor(firstAgg.totalBase * hr);
    const otPay = Math.floor(firstAgg.totalOvertime * hr * ctx.settings.overtimeRules.weekdayOvertimeRate);
    const holPay = Math.floor(firstAgg.totalHoliday * hr * ctx.settings.overtimeRules.holidayRate);
    const holOTPay = Math.floor(firstAgg.totalHolidayOvertime * hr * ctx.settings.overtimeRules.holidayOvertimeRate);
    const nightPay = Math.floor(firstAgg.totalNight * hr * ctx.settings.overtimeRules.nightRate);
    const taxable = basePay + otPay + holPay + holOTPay + nightPay;
    const nps = Math.floor(taxable * ctx.settings.insuranceRates.nationalPensionRate);
    const hi = Math.floor(taxable * ctx.settings.insuranceRates.healthInsuranceRate);
    const ltc = Math.floor(hi * ctx.settings.insuranceRates.longTermCareRate);
    const ei = Math.floor(taxable * ctx.settings.insuranceRates.employmentInsuranceRate);
    const housing = first.deductionSettings.housingFee || 0;
    const advance = first.deductionSettings.cashAdvance || 0;
    const grossSum = taxable + allowances.meal + allowances.transport + allowances.phone;
    const dedSum = nps + hi + ltc + ei + housing + advance;
    const net = Math.max(0, grossSum - dedSum);

    const NUM = "#,##0";
    const writeLR = (row: number, label: string, amt: number, rLabel: string, rAmt: number | "") => {
      setCell(wsPay.getCell(row, 2), label, { align: "left" });
      setCell(wsPay.getCell(row, 8), amt, { numFmt: NUM, align: "right" });
      setCell(wsPay.getCell(row, 12), rLabel, { align: "left" });
      setCell(wsPay.getCell(row, 18), rAmt as any, { numFmt: NUM, align: "right" });
    };

    setCell(wsPay.getCell(2, 2), `사원코드 : ${first.workerId}`, { align: "left" });
    setCell(wsPay.getCell(2, 7), `이름 : ${first.name}`, { align: "left" });
    setCell(wsPay.getCell(2, 12), `입사일 : ${first.joinDate}`, { align: "left" });
    setCell(wsPay.getCell(3, 2), `부서 : ${first.department}`, { align: "left" });
    setCell(wsPay.getCell(3, 7), `직급 : ${first.duty}`, { align: "left" });
    setCell(wsPay.getCell(3, 12), `지급일 : ${ctx.year}년 ${ctx.month + 1 > 12 ? 1 : ctx.month + 1}월 ${ctx.settings.site.paymentDay}일`, { align: "left" });

    setCell(wsPay.getCell(5, 2), "지 급 내 역", { bold: true });
    setCell(wsPay.getCell(5, 12), "공 제 내 역", { bold: true });

    writeLR(6, "기본급", basePay, "국민연금", nps);
    writeLR(7, "연장수당", otPay, "건강보험", hi);
    writeLR(8, "휴일수당", holPay, "장기요양", ltc);
    writeLR(9, "휴일연장수당", holOTPay, "고용보험", ei);
    writeLR(10, "심야수당", nightPay, "소득세", 0);
    writeLR(11, "성과금", 0, "지방소득세", 0);
    writeLR(12, "식대", allowances.meal, "숙소료", housing);
    writeLR(13, "자가운전보조비", allowances.transport, "가불금", advance);

    setCell(wsPay.getCell(15, 2), "지급액 계", { bold: true, align: "left" });
    setCell(wsPay.getCell(15, 8), grossSum, { numFmt: NUM, bold: true, align: "right" });
    setCell(wsPay.getCell(15, 12), "공제액 계", { bold: true, align: "left" });
    setCell(wsPay.getCell(15, 18), dedSum, { numFmt: NUM, bold: true, align: "right" });

    setCell(wsPay.getCell(17, 12), "실 지 급 액", { bold: true, align: "left" });
    setCell(wsPay.getCell(17, 18), net, { numFmt: NUM, bold: true, align: "right" });

    setCell(wsPay.getCell(19, 2), `예금주: ${first.bankSettings?.holder || ""}`, { align: "left" });
    setCell(wsPay.getCell(19, 8), `계좌번호: ${first.bankSettings?.accountNo || ""}`, { align: "left" });

    wsPay.mergeCells(21, 2, 21, 19);
    const thanks = wsPay.getCell(21, 2);
    thanks.value = "귀하의 노고에 감사드립니다.";
    thanks.alignment = { horizontal: "center" };
    thanks.font = { italic: true };

    wsPay.getColumn(2).width = 14;
    for (let i = 3; i <= 19; i++) wsPay.getColumn(i).width = 10;
  }

  const buf = await wb.xlsx.writeBuffer();
  saveAs(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${ctx.year}년${ctx.month}월_출퇴근명부.xlsx`
  );
}

// 사용되지 않는 헬퍼 정리 (린트 통과용)
function ws_mergeHeader(_ws: ExcelJS.Worksheet, _r1: number, _c1: number, _c2: number, _label: string) { /* noop */ }
