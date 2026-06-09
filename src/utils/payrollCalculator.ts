import { AllSettings, Worker } from "../types";

function floorToTen(amount: number): number {
  return Math.floor(amount / 10) * 10;
}

export function getOrdinaryHourlyRate(worker: Worker, settings: AllSettings): number {
  if (worker.employmentType === "salary") {
    return worker.salarySettings.hourlyRate || 0;
  }

  if (worker.employmentType === "hourly") {
    return settings.workTime.hourlyOrdinaryWageRate || worker.salarySettings.hourlyRate || 10320;
  }

  return worker.salarySettings.dailyRate / settings.workTime.standardDailyHours;
}

export function getHourlyOrdinaryMonthlyBase(settings: AllSettings): number {
  const rate = settings.workTime.hourlyOrdinaryWageRate || 10320;
  const hours = settings.workTime.hourlyOrdinaryMonthlyHours || 209;
  return rate * hours;
}

export interface MonthlySimulationInput {
  standardDays: number; // normal working days (e.g. 20 days)
  earlyMorningDays: number; // 조출 일수
  afternoonOvertimeDays: number; // 연장1단계 일수
  eveningOvertimeDays: number; // 연장2단계 일수
  holidayDays: number; // 휴일 근무 일수
  nightHours: number; // 야간 시간 총 시간 (hourly, salary, daily, etc.)
  overtimeHoursWeekly: number; // 시급제/월급제용 연장근로 시간
  cashAdvanceInput: number; // 월 가불금
}

export interface PayrollCalculationResult {
  basePay: number; // 기본급
  ordinaryHourlyRate: number; // 통상시급
  allowances: {
    meal: number;
    transport: number;
    phone: number;
    total: number;
  };
  overtimePay: number; // 연장 수당 (hourly/salary) or 공수 가산 단가
  holidayPay: number; // 휴일 수당
  nightPay: number; // 야간 가산 수당
  grossSalary: number; // 총지급액

  deductions: {
    nationalPension: number; // 국민연금
    healthInsurance: number; // 건강보험
    longTermCare: number; // 장기요양보험
    employmentInsurance: number; // 고용보험
    incomeTax: number; // 소득세 (근로소득세, 일용소득세, 사업소득세)
    localIncomeTax: number; // 지방소득세
    housingFee: number; // 숙소공제
    cashAdvance: number; // 가불금
    customDeductionsTotal: number; // 기타 공제
    total: number;
  };

  netPay: number; // 실지급액 (세후)
  totalManDays: number; // 총 공수 (daily worker)
}

/**
 * Calculates allowances for a worker. Takes custom worker definition, falling back to corporate settings.
 */
export function getWorkerAllowances(worker: Worker, settings: AllSettings) {
  const meal =
    worker.salarySettings.allowances.meal !== null
      ? worker.salarySettings.allowances.meal
      : settings.allowanceDefaults.meal;

  const transport =
    worker.salarySettings.allowances.transport !== null
      ? worker.salarySettings.allowances.transport
      : settings.allowanceDefaults.transport;

  const phone =
    worker.salarySettings.allowances.phone !== null
      ? worker.salarySettings.allowances.phone
      : settings.allowanceDefaults.phone;

  return {
    meal,
    transport,
    phone,
    total: meal + transport + phone,
  };
}

/**
 * Calculates payroll for a specific worker and a monthly shift profile using current settings.
 */
export function calculatePayroll(
  worker: Worker,
  settings: AllSettings,
  input: MonthlySimulationInput
): PayrollCalculationResult {
  const allowances = getWorkerAllowances(worker, settings);
  const type = worker.employmentType;

  let basePay = 0;
  let overtimePay = 0;
  let holidayPay = 0;
  let nightPay = 0;
  let totalManDays = 0;
  const ordinaryHourlyRate = getOrdinaryHourlyRate(worker, settings);

  // 1. Calculate Gross Pay before taxes/insurances based on Employment Type
  if (type === "salary") {
    // 월급제 (Salaried Worker): Uses fixed monthly salary
    basePay = worker.salarySettings.monthlyBase;

    // Overtime pay (using rate from settings/overtimeRules)
    overtimePay = input.overtimeHoursWeekly * ordinaryHourlyRate * settings.overtimeRules.weekdayOvertimeRate;

    // Holiday working pay
    holidayPay = input.holidayDays * (settings.workTime.standardDailyHours) * ordinaryHourlyRate * settings.overtimeRules.holidayRate;

    // Night duty allowance (gets nightRate additional multiplier)
    nightPay = input.nightHours * ordinaryHourlyRate * settings.overtimeRules.nightRate;

  } else if (type === "hourly") {
    // 시급제: 통상임금 기준으로 고정 월급을 지급하고, 추가 근로는 별도 가산
    const hr = ordinaryHourlyRate;
    basePay = getHourlyOrdinaryMonthlyBase(settings);

    // Overtime (weekday rate)
    overtimePay = input.overtimeHoursWeekly * hr * settings.overtimeRules.weekdayOvertimeRate;

    // Holiday work
    holidayPay = input.holidayDays * settings.workTime.standardDailyHours * hr * settings.overtimeRules.holidayRate;

    // Night hours
    nightPay = input.nightHours * hr * settings.overtimeRules.nightRate;

  } else if (type === "daily") {
    // 일용직 (Daily Labourer): Employs the man-day (공수) system
    const dailyUnit = worker.salarySettings.dailyRate;

    // Standard days count as 1.0 man-day each
    let stdManDays = input.standardDays * 1.0;

    // Early Morning (조출): base hours + early morning bonus (e.g. 0.5 man-day)
    const earlyMorningBonus = input.earlyMorningDays * settings.dailyWorkerRules.earlyMorningWorkDays;

    // Afternoon OT (연장 1단계): +0.5 man-day
    const afternoonBonus = input.afternoonOvertimeDays * settings.dailyWorkerRules.afternoonOvertimeWorkDays;

    // Evening OT (연장 2단계): +0.5 man-day
    const eveningBonus = input.eveningOvertimeDays * settings.dailyWorkerRules.eveningOvertimeWorkDays;

    // Holiday rate multiplier applied to holiday shifts
    const holidayManDays = input.holidayDays * settings.dailyWorkerRules.holidayRate;

    // Total calculated man-days (공수)
    totalManDays = stdManDays + earlyMorningBonus + afternoonBonus + eveningBonus + holidayManDays;

    // Base payment is total man-days multiplied by the worker's unique daily wage rate
    basePay = totalManDays * dailyUnit;

    // Allowances are typically not given to daily workers unless custom specified, but let's calculate them anyway if set
    // Night hourly computation for daily workers
    const hourlyEquivalent = dailyUnit / settings.workTime.standardDailyHours;
    nightPay = input.nightHours * hourlyEquivalent * settings.overtimeRules.nightRate;

  } else if (type === "business") {
    // 사업소득자 (3.3% Freelancer): Similar to daily workers but deducted at flat 3.3% rate
    const dailyUnit = worker.salarySettings.dailyRate;

    // Work on man-day (공수) basis as well
    let stdManDays = input.standardDays * 1.0;
    const earlyMorningBonus = input.earlyMorningDays * settings.dailyWorkerRules.earlyMorningWorkDays;
    const afternoonBonus = input.afternoonOvertimeDays * settings.dailyWorkerRules.afternoonOvertimeWorkDays;
    const eveningBonus = input.eveningOvertimeDays * settings.dailyWorkerRules.eveningOvertimeWorkDays;
    const holidayManDays = input.holidayDays * settings.dailyWorkerRules.holidayRate;

    totalManDays = stdManDays + earlyMorningBonus + afternoonBonus + eveningBonus + holidayManDays;
    basePay = totalManDays * dailyUnit;

    const hourlyEquivalent = dailyUnit / settings.workTime.standardDailyHours;
    nightPay = input.nightHours * hourlyEquivalent * settings.overtimeRules.nightRate;
  }

  // 비과세 수당 분리 (월급제만):
  // 식대/통신/(자가보유 시)자가운전보조금은 이미 월급(basePay)에 포함된 금액이다.
  // 세금 절약을 위해 이를 비과세로 떼어내 과세표준을 낮춘다 — 지급 총액(월급)은 그대로 유지한다.
  const isSalary = type === "salary";
  const variablePay = overtimePay + holidayPay + nightPay;

  // 명세서 표시용 비과세 항목 (월급제·자가 미보유면 자가운전 0)
  const displayTransport = isSalary && !worker.hasVehicle ? 0 : allowances.transport;
  const taxFreeAllowance = isSalary
    ? allowances.meal + allowances.phone + (worker.hasVehicle ? allowances.transport : 0)
    : 0;
  const cappedTaxFree = Math.min(taxFreeAllowance, basePay); // 월급 초과 방지

  const grossSalary = isSalary
    ? basePay + variablePay // 월급(수당 포함) + 변동수당. 수당을 별도로 더하지 않음
    : basePay + variablePay + allowances.total; // 그 외 고용형태: 기존처럼 수당을 가산

  // 2. Calculations for Deductions (Korean social security and taxes)
  let nationalPension = 0;
  let healthInsurance = 0;
  let longTermCare = 0;
  let employmentInsurance = 0;
  let incomeTax = 0;
  let localIncomeTax = 0;

  // 과세표준: 월급제는 비과세 분리분만큼 차감
  const taxableSalary = isSalary
    ? basePay - cappedTaxFree + variablePay
    : basePay + variablePay;

  if (type === "salary" || type === "hourly") {
    // 4 major social insurances apply to Salary & Hourly regular contracts
    nationalPension = floorToTen(taxableSalary * settings.insuranceRates.nationalPensionRate);
    healthInsurance = floorToTen(taxableSalary * settings.insuranceRates.healthInsuranceRate);
    longTermCare = floorToTen(healthInsurance * settings.insuranceRates.longTermCareRate);
    employmentInsurance = floorToTen(taxableSalary * settings.insuranceRates.employmentInsuranceRate);

    // Standard simplified income tax approximation for illustration (let's use standard sliding scale or simplified 1.5% tax for display)
    // Dynamic calculation: Let's do a basic salary tax of 1.5% to 6% depending on salary
    let estimatedTaxRate = 0.015;
    if (taxableSalary > 4000000) estimatedTaxRate = 0.045;
    else if (taxableSalary > 2500000) estimatedTaxRate = 0.03;

    incomeTax = floorToTen(taxableSalary * estimatedTaxRate);
    localIncomeTax = floorToTen(incomeTax * settings.taxRules.localTaxRate);

  } else if (type === "daily") {
    // Daily workers enjoy specific taxation: (Daily wage - 150,000 KRW tax-free limit) * 6% tax rate * 45% (which is 1 - 55% write-off deduction)
    // Calculated day-by-day.
    const dailyUnit = worker.salarySettings.dailyRate;
    const taxFreeLimit = settings.taxRules.dailyWorkerTaxFreeLimit;
    const taxRate = settings.taxRules.dailyWorkerTaxRate;

    const taxableDailyAmount = Math.max(0, dailyUnit - taxFreeLimit);
    // Calculated daily tax
    const dailyTaxAmount = taxableDailyAmount * taxRate * 0.45;

    // Total tax for standard days + additional shifts estimated
    const impliedWorkedDays = input.standardDays + input.holidayDays;
    incomeTax = floorToTen(dailyTaxAmount * impliedWorkedDays);
    localIncomeTax = floorToTen(incomeTax * settings.taxRules.localTaxRate);

  } else if (type === "business") {
    // Freelancer/Business Income: Flat rate of 3% business income tax + 0.3% local income tax (total 3.3%)
    const rate = settings.taxRules.businessIncomeRate; // e.g. 0.033
    const businessIncomeTaxOnly = rate / (1 + settings.taxRules.localTaxRate); // approx flat tax structure

    incomeTax = floorToTen(grossSalary * businessIncomeTaxOnly);
    localIncomeTax = floorToTen(incomeTax * settings.taxRules.localTaxRate);
  }

  // Deductions from registry
  const housingFee = worker.deductionSettings.housingFee || 0;
  const cashAdvance = input.cashAdvanceInput || worker.deductionSettings.cashAdvance || 0;
  const customDeductionsSum = worker.deductionSettings.customDeductions.reduce(
    (acc, curr) => acc + curr.amount,
    0
  );

  const deductionsTotal =
    nationalPension +
    healthInsurance +
    longTermCare +
    employmentInsurance +
    incomeTax +
    localIncomeTax +
    housingFee +
    cashAdvance +
    customDeductionsSum;

  const netPay = Math.max(0, grossSalary - deductionsTotal);

  return {
    // 월급제 기본급은 비과세 분리분을 뺀 '과세 기본급'으로 표시 (기본급+비과세항목 = 지급총액)
    basePay: Math.floor(isSalary ? basePay - cappedTaxFree : basePay),
    ordinaryHourlyRate: Math.floor(ordinaryHourlyRate),
    allowances: {
      meal: allowances.meal,
      transport: displayTransport,
      phone: allowances.phone,
      total: allowances.meal + displayTransport + allowances.phone,
    },
    overtimePay: Math.floor(overtimePay),
    holidayPay: Math.floor(holidayPay),
    nightPay: Math.floor(nightPay),
    grossSalary: Math.floor(grossSalary),
    deductions: {
      nationalPension,
      healthInsurance,
      longTermCare,
      employmentInsurance,
      incomeTax,
      localIncomeTax,
      housingFee,
      cashAdvance,
      customDeductionsTotal: customDeductionsSum,
      total: deductionsTotal,
    },
    netPay: Math.floor(netPay),
    totalManDays,
  };
}
