import { AllSettings, Worker } from "../types";

export interface MonthlySimulationInput {
  standardDays: number; // normal working days (e.g. 20 days)
  earlyMorningDays: number; // 조출 일수
  afternoonOvertimeDays: number; // 연장1단계 일수
  eveningOvertimeDays: number; // 연장2단계 일수
  holidayDays: number; // 휴일 근무 일수
  nightHours: number; // 심야 시간 총 시간 (hourly, salary, daily, etc.)
  overtimeHoursWeekly: number; // 시급제/월급제용 연장근로 시간
  cashAdvanceInput: number; // 월 가불금
}

export interface PayrollCalculationResult {
  basePay: number; // 기본급
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

  // 1. Calculate Gross Pay before taxes/insurances based on Employment Type
  if (type === "salary") {
    // 월급제 (Salaried Worker): Uses fixed monthly salary
    basePay = worker.salarySettings.monthlyBase;

    // OT hourly rate = monthlyBase / 209 (standard Korean hourly divisor) * rate
    const standardHourlyDivisor = 209;
    const computedHourlyRate = basePay / standardHourlyDivisor;

    // Overtime pay (using rate from settings/overtimeRules)
    overtimePay = input.overtimeHoursWeekly * computedHourlyRate * settings.overtimeRules.weekdayOvertimeRate;

    // Holiday working pay
    holidayPay = input.holidayDays * (settings.workTime.standardDailyHours) * computedHourlyRate * settings.overtimeRules.holidayRate;

    // Night duty allowance (gets nightRate additional multiplier)
    nightPay = input.nightHours * computedHourlyRate * settings.overtimeRules.nightRate;

  } else if (type === "hourly") {
    // 시급제 (Hourly Worker): Multiplies hourly rate by simulated work hours
    const hr = worker.salarySettings.hourlyRate;
    const stdWorkHours = input.standardDays * settings.workTime.standardDailyHours;

    basePay = stdWorkHours * hr;

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

  // Include allowance defaults or overrides
  const allowanceSum = allowances.total;
  const grossSalary = basePay + overtimePay + holidayPay + nightPay + allowanceSum;

  // 2. Calculations for Deductions (Korean social security and taxes)
  let nationalPension = 0;
  let healthInsurance = 0;
  let longTermCare = 0;
  let employmentInsurance = 0;
  let incomeTax = 0;
  let localIncomeTax = 0;

  // Base income for tax calculations (typically gross except non-taxable meal/etc., let's use gross base pay for simplification)
  const taxableSalary = basePay + overtimePay + holidayPay + nightPay;

  if (type === "salary" || type === "hourly") {
    // 4 major social insurances apply to Salary & Hourly regular contracts
    nationalPension = Math.floor(taxableSalary * settings.insuranceRates.nationalPensionRate);
    healthInsurance = Math.floor(taxableSalary * settings.insuranceRates.healthInsuranceRate);
    longTermCare = Math.floor(healthInsurance * settings.insuranceRates.longTermCareRate);
    employmentInsurance = Math.floor(taxableSalary * settings.insuranceRates.employmentInsuranceRate);

    // Standard simplified income tax approximation for illustration (let's use standard sliding scale or simplified 1.5% tax for display)
    // Dynamic calculation: Let's do a basic salary tax of 1.5% to 6% depending on salary
    let estimatedTaxRate = 0.015;
    if (taxableSalary > 4000000) estimatedTaxRate = 0.045;
    else if (taxableSalary > 2500000) estimatedTaxRate = 0.03;

    incomeTax = Math.floor(taxableSalary * estimatedTaxRate);
    localIncomeTax = Math.floor(incomeTax * settings.taxRules.localTaxRate);

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
    incomeTax = Math.floor(dailyTaxAmount * impliedWorkedDays);
    localIncomeTax = Math.floor(incomeTax * settings.taxRules.localTaxRate);

  } else if (type === "business") {
    // Freelancer/Business Income: Flat rate of 3% business income tax + 0.3% local income tax (total 3.3%)
    const rate = settings.taxRules.businessIncomeRate; // e.g. 0.033
    const businessIncomeTaxOnly = rate / (1 + settings.taxRules.localTaxRate); // approx flat tax structure

    incomeTax = Math.floor(grossSalary * businessIncomeTaxOnly);
    localIncomeTax = Math.floor(incomeTax * settings.taxRules.localTaxRate);
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
    basePay: Math.floor(basePay),
    allowances: {
      meal: allowances.meal,
      transport: allowances.transport,
      phone: allowances.phone,
      total: allowances.total,
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
