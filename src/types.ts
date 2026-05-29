export interface WorkTimeSettings {
  defaultCheckIn: string; // e.g., "08:00"
  defaultCheckOut: string; // e.g., "17:00"
  lunchStart: string; // e.g., "12:00"
  lunchEnd: string; // e.g., "13:00"
  lunchDuration: number; // hours, e.g., 1
  standardDailyHours: number; // e.g., 8
  standardWeeklyHours: number; // e.g., 40
  hourlyOrdinaryWageRate: number; // e.g., 10320
  hourlyOrdinaryMonthlyHours: number; // e.g., 209
  departments?: string[];
  ranks?: string[];
  jobs?: string[];
}

export interface OvertimeRulesSettings {
  weekdayOvertimeRate: number; // e.g., 1.5
  holidayRate: number; // e.g., 1.5
  holidayOvertimeRate: number; // e.g., 2.0
  nightRate: number; // e.g., 0.5 (additional)
  nightStart: string; // e.g., "22:00"
  nightEnd: string; // e.g., "06:00"
}

export interface DailyWorkerRulesSettings {
  earlyMorningStart: string; // e.g., "05:00"
  earlyMorningEnd: string; // e.g., "08:00"
  earlyMorningWorkDays: number; // e.g., 0.5
  afternoonOvertimeStart: string; // e.g., "17:00"
  afternoonOvertimeEnd: string; // e.g., "19:30"
  afternoonOvertimeWorkDays: number; // e.g., 0.5
  eveningOvertimeStart: string; // e.g., "19:30"
  eveningOvertimeEnd: string; // e.g., "22:00"
  eveningOvertimeWorkDays: number; // e.g., 0.5
  holidayRate: number; // e.g., 1.0
}

export interface InsuranceRatesSettings {
  nationalPensionRate: number; // e.g., 0.045
  healthInsuranceRate: number; // e.g., 0.03545
  longTermCareRate: number; // e.g., 0.1295 (health ratio based usually)
  employmentInsuranceRate: number; // e.g., 0.009
  effectiveFrom: string; // e.g., "2026-01-01"
}

export interface TaxRulesSettings {
  businessIncomeRate: number; // e.g., 0.033
  dailyWorkerTaxFreeLimit: number; // e.g., 150000
  dailyWorkerTaxRate: number; // e.g., 0.06
  localTaxRate: number; // e.g., 0.1 (applies as 10% of standard calculated tax)
}

export interface AllowanceDefaultsSettings {
  meal: number; // e.g., 200000
  transport: number; // e.g., 200000
  phone: number; // e.g., 100000
}

export interface SiteSettings {
  companyName: string; // "씨엠(CM)건설"
  siteAddress: string; // "충남 당진시 신평면 ..."
  siteLocation: { lat: number; lng: number };
  allowedRadius: number; // meters, e.g., 100
  paymentDay: number; // e.g., 15
}

export interface AnnualLeaveSettings {
  firstYearDays: number; // e.g., 11
  secondYearDays: number; // e.g., 15
  maxDays: number; // e.g., 25
  accrualMethod: "monthly" | "yearly";
}

export interface Holiday {
  id?: string;
  date: string; // YYYY-MM-DD
  name: string; // "추석"
  type: "public" | "custom";
}

export interface Worker {
  id?: string;
  workerId: string; // 사번 (자동 또는 수동)
  name: string;
  englishName: string;
  nationality: string;
  residentNumber: string;
  phone: string;
  address: string;
  employmentType: "salary" | "hourly" | "daily" | "business"; // 월급제, 시급제, 일용직, 사업소득자
  contractDate: string; // YYYY-MM-DD
  joinDate: string; // YYYY-MM-DD
  retireDate: string | null;
  duty: string;
  department: string;
  job: string;
  salarySettings: {
    monthlyBase: number;
    hourlyRate: number;
    dailyRate: number;
    allowances: {
      meal: number | null; // null means use settings configuration value
      transport: number | null;
      phone: number | null;
    };
  };
  deductionSettings: {
    housingFee: number; // 숙소료
    cashAdvance: number; // 가불금
    customDeductions: { name: string; amount: number }[];
  };
  bankSettings: {
    bankName: string;
    accountNo: string;
    holder: string;
  };
  loginId: string;
  initialPassword: string;
  language: "ko" | "vi" | "km" | "my" | "ne" | "zh" | "en";
}

export interface SettingsHistory {
  id?: string;
  timestamp: any; // Firestore timestamp or parseable ISO string
  changedBy: string;
  category: string; // "workTime" | "overtimeRules" | etc.
  action: "create" | "update" | "delete";
  label: string; // description of what changed
  fromValue: any;
  toValue: any;
}

export interface AllSettings {
  workTime: WorkTimeSettings;
  overtimeRules: OvertimeRulesSettings;
  dailyWorkerRules: DailyWorkerRulesSettings;
  insuranceRates: InsuranceRatesSettings;
  taxRules: TaxRulesSettings;
  allowanceDefaults: AllowanceDefaultsSettings;
  site: SiteSettings;
  annualLeave: AnnualLeaveSettings;
}
