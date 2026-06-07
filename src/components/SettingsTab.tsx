import React, { useState } from "react";
import { useApp as useFirebase } from "../context/SupabaseContext";
import { AllSettings, Holiday } from "../types";
import { DEFAULT_DEPARTMENT_OPTIONS, DEFAULT_JOB_OPTIONS, DEFAULT_RANK_OPTIONS } from "../constants/workerOptions";
import { DEFAULT_TIME_ZONE, TIME_ZONE_OPTIONS } from "../utils/datetime";
import {
  Settings,
  Building,
  Clock,
  Coins,
  Shield,
  HeartHandshake,
  Calendar,
  Layers,
  History,
  Save,
  Plus,
  Trash2,
  MapPin,
  ChevronRight,
  Info,
  QrCode,
  RefreshCw,
  Printer,
} from "lucide-react";
import QRCode from "qrcode";

export const SettingsTab: React.FC = () => {
  const { settings, updateSetting, holidays, addHoliday, deleteHoliday, history, regenerateSiteCheckinCode } = useFirebase();
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [qrError, setQrError] = useState<string>("");
  const [regenerating, setRegenerating] = useState(false);

  // settings.site.checkinCode 가 바뀌면 QR 이미지 재생성
  React.useEffect(() => {
    const code = (settings?.site as any)?.checkinCode as string | undefined;
    if (!code) {
      setQrDataUrl("");
      return;
    }
    QRCode.toDataURL(code, { width: 320, margin: 2, errorCorrectionLevel: "M" })
      .then(setQrDataUrl)
      .catch((e) => setQrError(String(e)));
  }, [settings]);

  const handleRegenerateQr = async () => {
    const hasCode = !!(settings?.site as any)?.checkinCode;
    if (hasCode && !window.confirm("기존 QR 코드는 즉시 무효화되고 새 코드로 교체됩니다. 진행할까요?")) {
      return;
    }
    setRegenerating(true);
    setQrError("");
    try {
      await regenerateSiteCheckinCode();
    } catch (e: any) {
      setQrError(e.message || "QR 발급 실패");
    } finally {
      setRegenerating(false);
    }
  };

  const handlePrintQr = () => {
    if (!qrDataUrl) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><title>현장 출퇴근 QR</title>
      <style>
        body { font-family: -apple-system, sans-serif; text-align: center; padding: 40px; }
        h1 { font-size: 24px; margin-bottom: 8px; }
        p { color: #666; font-size: 12px; margin-bottom: 24px; }
        img { border: 1px solid #ddd; padding: 16px; background: white; }
        small { display: block; margin-top: 16px; color: #999; }
      </style>
      </head><body>
        <h1>${settings?.site?.companyName || ""} 현장 출퇴근 QR</h1>
        <p>${settings?.site?.siteAddress || ""}</p>
        <img src="${qrDataUrl}" alt="현장 QR" />
        <small>스마트폰 앱에서 출근/퇴근 버튼을 눌러 이 QR을 스캔하세요.</small>
      </body></html>
    `);
    win.document.close();
    setTimeout(() => win.print(), 250);
  };
  const [activeSubTab, setActiveSubTab] = useState<string>("site");
  const [selectedYear, setSelectedYear] = useState<number>(2026);

  // Holiday forms
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayName, setNewHolidayName] = useState("");
  const [newDepartmentOption, setNewDepartmentOption] = useState("");
  const [newRankOption, setNewRankOption] = useState("");
  const [newJobOption, setNewJobOption] = useState("");

  // Map settings
  const [mapWidth] = useState(500);
  const [mapHeight] = useState(250);

  if (
    !settings ||
    !settings.site ||
    !settings.workTime ||
    !settings.overtimeRules ||
    !settings.dailyWorkerRules ||
    !settings.insuranceRates ||
    !settings.taxRules ||
    !settings.allowanceDefaults ||
    !settings.annualLeave
  ) {
    return (
      <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto mb-4"></div>
        <p className="text-gray-500 text-sm">회사 및 운영 정책 Firestore 구성을 취득 중...</p>
      </div>
    );
  }

  // Handle map canvas click to change GPS marker
  const handleMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Map X,Y to pseudo GPS offsets centered around lat:37.1234, lng:126.4567
    const latSpan = 0.05;
    const lngSpan = 0.1;
    
    const calculatedLat = 37.1234 - ((y / mapHeight) - 0.5) * latSpan;
    const calculatedLng = 126.4567 + ((x / mapWidth) - 0.5) * lngSpan;

    updateSetting("site", {
      ...settings.site,
      siteLocation: {
        lat: Number(calculatedLat.toFixed(5)),
        lng: Number(calculatedLng.toFixed(5)),
      },
    });
  };

  const saveWorkTime = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const updated = {
      ...settings.workTime,
      defaultCheckIn: data.get("defaultCheckIn") as string,
      defaultCheckOut: data.get("defaultCheckOut") as string,
      lunchStart: data.get("lunchStart") as string,
      lunchEnd: data.get("lunchEnd") as string,
      lunchDuration: Number(data.get("lunchDuration")),
      standardDailyHours: Number(data.get("standardDailyHours")),
      standardWeeklyHours: Number(data.get("standardWeeklyHours")),
    };
    updateSetting("workTime", updated);
    alert("시공 근무 기획 일과 설정이 성공적으로 저장되었습니다.");
  };

  const getWorkOptionList = (key: "departments" | "ranks" | "jobs", fallback: string[]) => {
    const values = settings.workTime[key];
    return values?.length ? values : fallback;
  };

  const updateWorkOptionList = (key: "departments" | "ranks" | "jobs", next: string[]) => {
    updateSetting("workTime", {
      ...settings.workTime,
      [key]: next,
    });
  };

  const addWorkOption = (
    key: "departments" | "ranks" | "jobs",
    fallback: string[],
    value: string,
    clear: (value: string) => void
  ) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const current = getWorkOptionList(key, fallback);
    if (current.includes(trimmed)) {
      clear("");
      return;
    }
    updateWorkOptionList(key, [...current, trimmed]);
    clear("");
  };

  const removeWorkOption = (key: "departments" | "ranks" | "jobs", fallback: string[], value: string) => {
    const current = getWorkOptionList(key, fallback);
    if (!window.confirm(`${value} 옵션을 삭제할까요? 기존 근로자에게 저장된 값은 유지됩니다.`)) return;
    updateWorkOptionList(key, current.filter((item) => item !== value));
  };

  const renderWorkOptionEditor = (
    title: string,
    key: "departments" | "ranks" | "jobs",
    fallback: string[],
    value: string,
    setValue: (next: string) => void,
    placeholder: string
  ) => {
    const options = getWorkOptionList(key, fallback);

    return (
      <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-bold text-gray-900">{title}</h4>
          <span className="text-[11px] font-mono text-gray-400">{options.length}개</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {options.map((option) => (
            <span
              key={option}
              className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700"
            >
              {option}
              <button
                type="button"
                onClick={() => removeWorkOption(key, fallback, option)}
                className="text-slate-400 hover:text-rose-600"
                title={`${option} 삭제`}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addWorkOption(key, fallback, value, setValue);
              }
            }}
            placeholder={placeholder}
            className="min-w-0 flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
          />
          <button
            type="button"
            onClick={() => addWorkOption(key, fallback, value, setValue)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800"
          >
            <Plus className="w-3.5 h-3.5" /> 추가
          </button>
        </div>
      </div>
    );
  };

  const saveOrdinaryWage = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const updated = {
      ...settings.workTime,
      hourlyOrdinaryWageRate: Number(data.get("hourlyOrdinaryWageRate")) || 10320,
      hourlyOrdinaryMonthlyHours: Number(data.get("hourlyOrdinaryMonthlyHours")) || 209,
    };
    updateSetting("workTime", updated);
    alert("통상임금 기준 설정이 저장되었습니다.");
  };

  const saveOvertime = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const updated = {
      weekdayOvertimeRate: Number(data.get("weekdayOvertimeRate")),
      holidayRate: Number(data.get("holidayRate")),
      holidayOvertimeRate: Number(data.get("holidayOvertimeRate")),
      nightRate: Number(data.get("nightRate")),
      nightStart: data.get("nightStart") as string,
      nightEnd: data.get("nightEnd") as string,
    };
    updateSetting("overtimeRules", updated);
    alert("할증 기준 정책 설정이 안전하게 기안 및 보정되었습니다.");
  };

  const saveDailyRules = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const updated = {
      earlyMorningStart: data.get("earlyMorningStart") as string,
      earlyMorningEnd: data.get("earlyMorningEnd") as string,
      earlyMorningWorkDays: Number(data.get("earlyMorningWorkDays")),
      afternoonOvertimeStart: data.get("afternoonOvertimeStart") as string,
      afternoonOvertimeEnd: data.get("afternoonOvertimeEnd") as string,
      afternoonOvertimeWorkDays: Number(data.get("afternoonOvertimeWorkDays")),
      eveningOvertimeStart: data.get("eveningOvertimeStart") as string,
      eveningOvertimeEnd: data.get("eveningOvertimeEnd") as string,
      eveningOvertimeWorkDays: Number(data.get("eveningOvertimeWorkDays")),
      holidayRate: Number(data.get("holidayRate")),
    };
    updateSetting("dailyWorkerRules", updated);
    alert("일용 노임 공수 정량 산격 기준이 즉각 보강되었습니다.");
  };

  const saveInsurance = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const updated = {
      nationalPensionRate: Number(data.get("nationalPensionRate")) / 100,
      healthInsuranceRate: Number(data.get("healthInsuranceRate")) / 100,
      longTermCareRate: Number(data.get("longTermCareRate")) / 100,
      employmentInsuranceRate: Number(data.get("employmentInsuranceRate")) / 100,
      effectiveFrom: data.get("effectiveFrom") as string,
    };
    updateSetting("insuranceRates", updated);
    alert("4대보험 및 원천 징수 연동 비율 징수가 법령에 맞춰 개정되었습니다.");
  };

  const saveTaxes = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const updated = {
      businessIncomeRate: Number(data.get("businessIncomeRate")) / 100,
      dailyWorkerTaxFreeLimit: Number(data.get("dailyWorkerTaxFreeLimit")),
      dailyWorkerTaxRate: Number(data.get("dailyWorkerTaxRate")) / 100,
      localTaxRate: Number(data.get("localTaxRate")) / 100,
    };
    updateSetting("taxRules", updated);
    alert("소득 세율 및 일용 면세 기준 수정 정책이 저장되었습니다.");
  };

  const saveAllowances = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const updated = {
      meal: Number(data.get("meal")),
      transport: Number(data.get("transport")),
      phone: Number(data.get("phone")),
    };
    updateSetting("allowanceDefaults", updated);
    alert("전직원 보조 수당 기준 수당 테이블이 수정되었습니다.");
  };

  const saveAnnualLeave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    const updated = {
      firstYearDays: Number(data.get("firstYearDays")),
      secondYearDays: Number(data.get("secondYearDays")),
      maxDays: Number(data.get("maxDays")),
      accrualMethod: data.get("accrualMethod") as "monthly" | "yearly",
    };
    updateSetting("annualLeave", updated);
    alert("근로기준법 연정 연차 휴일 산정 자격이 수정 완료되었습니다.");
  };

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHolidayDate || !newHolidayName) return;
    try {
      await addHoliday({
        date: newHolidayDate,
        name: newHolidayName,
        type: "custom",
      });
      setNewHolidayDate("");
      setNewHolidayName("");
    } catch (err: any) {
      alert("휴일 추가 실패: " + err.message);
    }
  };

  const handleDeleteHoliday = async (holiday: Holiday) => {
    const kindLabel = holiday.type === "public" ? "공휴일" : "회사지정공휴일";
    if (!holiday.id) return;
    if (!window.confirm(`${holiday.date} ${holiday.name} ${kindLabel}을(를) 삭제하시겠습니까?`)) {
      return;
    }
    try {
      await deleteHoliday(holiday.id);
    } catch (err: any) {
      alert("휴일 삭제 실패: " + err.message);
    }
  };

  const filteredHolidays = holidays.filter((h) => h.date.startsWith(String(selectedYear)));

  // Simple pseudo calendar block display for the selected year
  const months_ko = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];

  return (
    <div id="settings-tab-layout" className="grid grid-cols-1 lg:grid-cols-4 gap-4">
      
      {/* Sidebar Sub Tab Switchers - High Density Layout */}
      <div className="lg:col-span-1 bg-white p-3 rounded-lg border border-slate-200 shadow-xs space-y-1 h-fit">
        <p className="text-[10px] font-bold text-slate-400 px-3.5 uppercase tracking-wider mb-2 font-mono">운영 정책 설정 탭</p>
        
        <button
          onClick={() => setActiveSubTab("site")}
          className={`w-full flex items-center justify-between text-left text-xs px-3 py-2 rounded-md transition font-semibold cursor-pointer ${
            activeSubTab === "site" ? "bg-slate-900 text-white border-l-4 border-blue-600 shadow-sm font-bold" : "text-slate-650 hover:bg-slate-50"
          }`}
        >
          <span className="flex items-center gap-2"><Building className="w-3.5 h-3.5 text-blue-500" /> 탭 1: 회사/현장 정보</span>
          <ChevronRight className="w-3 h-3 opacity-60" />
        </button>

        <button
          onClick={() => setActiveSubTab("workTime")}
          className={`w-full flex items-center justify-between text-left text-xs px-3 py-2 rounded-md transition font-semibold cursor-pointer ${
            activeSubTab === "workTime" ? "bg-slate-900 text-white border-l-4 border-blue-600 shadow-sm font-bold" : "text-slate-650 hover:bg-slate-50"
          }`}
        >
          <span className="flex items-center gap-2"><Clock className="w-3.5 h-3.5 text-blue-500" /> 탭 2: 근무 시간 규칙</span>
          <ChevronRight className="w-3 h-3 opacity-60" />
        </button>

        <button
          onClick={() => setActiveSubTab("overtime")}
          className={`w-full flex items-center justify-between text-left text-xs px-3 py-2 rounded-md transition font-semibold cursor-pointer ${
            activeSubTab === "overtime" ? "bg-slate-900 text-white border-l-4 border-blue-600 shadow-sm font-bold" : "text-slate-650 hover:bg-slate-50"
          }`}
        >
          <span className="flex items-center gap-2"><Coins className="w-3.5 h-3.5 text-blue-500" /> 탭 3: 수당 가산율</span>
          <ChevronRight className="w-3 h-3 opacity-60" />
        </button>

        <button
          onClick={() => setActiveSubTab("ordinaryWage")}
          className={`w-full flex items-center justify-between text-left text-xs px-3 py-2 rounded-md transition font-semibold cursor-pointer ${
            activeSubTab === "ordinaryWage" ? "bg-slate-900 text-white border-l-4 border-blue-600 shadow-sm font-bold" : "text-slate-650 hover:bg-slate-50"
          }`}
        >
          <span className="flex items-center gap-2"><Coins className="w-3.5 h-3.5 text-blue-500" /> 탭 4: 통상임금 기준</span>
          <ChevronRight className="w-3 h-3 opacity-60" />
        </button>

        <button
          onClick={() => setActiveSubTab("insuranceTax")}
          className={`w-full flex items-center justify-between text-left text-xs px-3 py-2 rounded-md transition font-semibold cursor-pointer ${
            activeSubTab === "insuranceTax" ? "bg-slate-900 text-white border-l-4 border-blue-600 shadow-sm font-bold" : "text-slate-650 hover:bg-slate-50"
          }`}
        >
          <span className="flex items-center gap-2"><Shield className="w-3.5 h-3.5 text-blue-500" /> 탭 5: 4대보험 & 세율</span>
          <ChevronRight className="w-3 h-3 opacity-60" />
        </button>

        <button
          onClick={() => setActiveSubTab("allowance")}
          className={`w-full flex items-center justify-between text-left text-xs px-3 py-2 rounded-md transition font-semibold cursor-pointer ${
            activeSubTab === "allowance" ? "bg-slate-900 text-white border-l-4 border-blue-600 shadow-sm font-bold" : "text-slate-650 hover:bg-slate-50"
          }`}
        >
          <span className="flex items-center gap-2"><HeartHandshake className="w-3.5 h-3.5 text-blue-500" /> 탭 6: 수당 기본값</span>
          <ChevronRight className="w-3 h-3 opacity-60" />
        </button>

        <button
          onClick={() => setActiveSubTab("calendar")}
          className={`w-full flex items-center justify-between text-left text-xs px-3 py-2 rounded-md transition font-semibold cursor-pointer ${
            activeSubTab === "calendar" ? "bg-slate-900 text-white border-l-4 border-blue-600 shadow-sm font-bold" : "text-slate-650 hover:bg-slate-50"
          }`}
        >
          <span className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5 text-blue-500" /> 탭 7: 공휴일 관리</span>
          <ChevronRight className="w-3 h-3 opacity-60" />
        </button>

        <button
          onClick={() => setActiveSubTab("annualLeave")}
          className={`w-full flex items-center justify-between text-left text-xs px-3 py-2 rounded-md transition font-semibold cursor-pointer ${
            activeSubTab === "annualLeave" ? "bg-slate-900 text-white border-l-4 border-blue-600 shadow-sm font-bold" : "text-slate-650 hover:bg-slate-50"
          }`}
        >
          <span className="flex items-center gap-2"><Layers className="w-3.5 h-3.5 text-blue-500" /> 탭 8: 연차 설정</span>
          <ChevronRight className="w-3 h-3 opacity-60" />
        </button>

        <div className="pt-2.5 border-t border-slate-100">
          <button
            onClick={() => setActiveSubTab("history")}
            className={`w-full flex items-center justify-between text-left text-xs px-3 py-2 rounded-md transition font-semibold cursor-pointer ${
              activeSubTab === "history" ? "bg-blue-650 text-white border-l-4 border-blue-405 shadow-sm font-bold" : "bg-blue-50/70 text-blue-700 hover:bg-blue-105"
            }`}
          >
            <span className="flex items-center gap-2"><History className="w-3.5 h-3.5" /> 탭 1별: 설정 변경 이력</span>
            <ChevronRight className="w-3 h-3 opacity-60" />
          </button>
        </div>
      </div>

      {/* Main Configuration form layouts - High Density Frame */}
      <div className="lg:col-span-3 bg-white p-5 rounded-lg border border-slate-205 shadow-xs max-w-full overflow-hidden">
        
        {/* SUB TAB 1: SITE & GEOLOCATOR SETTINGS */}
        {activeSubTab === "site" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Building className="w-5 h-5 text-gray-500" />
                회사 정보 및 건설현장 지리 정보 (Site Settings)
              </h3>
              <p className="text-xs text-gray-400 mt-1">회사명, 공용 주소, 및 가용 출퇴근 GPS 체크인 반경을 구성합니다.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">회사 및 현장명 *</label>
                  <input
                    type="text"
                    value={settings.site.companyName}
                    onChange={(e) => updateSetting("site", { ...settings.site, companyName: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">현장 주소 *</label>
                  <input
                    type="text"
                    value={settings.site.siteAddress}
                    onChange={(e) => updateSetting("site", { ...settings.site, siteAddress: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">현장 GPS 지좌 기준점 Lat / Lng</label>
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="number"
                      step="0.00001"
                      value={settings.site.siteLocation.lat}
                      onChange={(e) => updateSetting("site", {
                        ...settings.site,
                        siteLocation: { ...settings.site.siteLocation, lat: Number(e.target.value) }
                      })}
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono"
                    />
                    <input
                      type="number"
                      step="0.00001"
                      value={settings.site.siteLocation.lng}
                      onChange={(e) => updateSetting("site", {
                        ...settings.site,
                        siteLocation: { ...settings.site.siteLocation, lng: Number(e.target.value) }
                      })}
                      className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">
                    인증 허용 출퇴근 반경 (Allowed Radius): <span className="text-blue-600 font-extrabold">{settings.site.allowedRadius}m</span>
                  </label>
                  <input
                    type="range"
                    min="50"
                    max="1000"
                    step="50"
                    value={settings.site.allowedRadius}
                    onChange={(e) => updateSetting("site", { ...settings.site, allowedRadius: Number(e.target.value) })}
                    className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                    <span>50m (초타이트)</span>
                    <span>1,000m (광역 인정)</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">매달 정기 급여 지급일 (Payment Day)</label>
                  <select
                    value={settings.site.paymentDay}
                    onChange={(e) => updateSetting("site", { ...settings.site, paymentDay: Number(e.target.value) })}
                    className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white"
                  >
                    {[5, 10, 15, 20, 25, 30].map(day => (
                      <option key={day} value={day}>매달 {day}일 지급</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">현장 표준 시간대 (Time Zone)</label>
                  <select
                    value={settings.site.timezone || DEFAULT_TIME_ZONE}
                    onChange={(e) => updateSetting("site", { ...settings.site, timezone: e.target.value })}
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white"
                  >
                    {TIME_ZONE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-gray-400 mt-1">
                    출퇴근 시각 표시와 근로시간(연장·야간·휴일·공수) 계산이 이 시간대를 기준으로 처리됩니다. 한국 현장은 Asia/Seoul 권장.
                  </p>
                </div>
              </div>

              {/* Pseudo Location Map */}
              <div className="space-y-3">
                <span className="block text-xs font-semibold text-gray-500 mb-1">
                  GPS 가상 위성 지도 (지도 클릭 위치가 출적 체크인 기준점으로 주소 지정됩니다)
                </span>
                <div className="relative border border-gray-200 rounded-xl overflow-hidden bg-sky-50 shadow-inner flex flex-col items-center justify-center">
                  
                  {/* Styled Interactive SVG Map Grid */}
                  <svg
                    width="100%"
                    height={mapHeight}
                    onClick={handleMapClick}
                    className="cursor-crosshair select-none bg-emerald-50/20"
                    id="site-gps-widget"
                  >
                    {/* Background decoration grid */}
                    <defs>
                      <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                        <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="0.8" />
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid)" />

                    {/* Virtual Roadlines */}
                    <path d="M 0 100 Q 250 80 500 120" fill="none" stroke="#cbd5e1" strokeWidth="15" opacity="0.6"/>
                    <path d="M 120 0 Q 150 120 180 250" fill="none" stroke="#cbd5e1" strokeWidth="10" opacity="0.6"/>

                    {/* Blue Location Area Radius (allowedRadius / max 1000m scaling) */}
                    <circle
                      cx={mapWidth / 2}
                      cy={mapHeight / 2}
                      r={Math.min(100, Math.max(25, (settings.site.allowedRadius / 1000) * 120))}
                      fill="#3b82f6"
                      fillOpacity="0.12"
                      stroke="#2563eb"
                      strokeWidth="1.5"
                      strokeDasharray="4"
                    />

                    {/* GPS Pin */}
                    <circle cx={mapWidth / 2} cy={mapHeight / 2} r="6" fill="#ef4444" stroke="#ffffff" strokeWidth="2" />
                    
                    {/* Text Overlay */}
                    <text x="15" y="25" fill="#475569" fontSize="10" fontFamily="monospace">
                      [현장 중심좌 기준 GPS 전개]
                    </text>
                  </svg>

                  <div className="absolute bottom-3 left-3 bg-white/90 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-gray-200 font-mono text-[11px] text-gray-700 shadow-sm">
                    <p className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-red-500" />
                      COORD: {settings.site.siteLocation.lat}, {settings.site.siteLocation.lng}
                    </p>
                  </div>
                </div>
                <p className="text-[11px] text-gray-400 italic">
                  * 위성 지도 내 중심점을 둘러싼 점선은 지정된 반경({settings.site.allowedRadius}m)의 GPS 출퇴근 인가 권역입니다.
                </p>
              </div>
            </div>

            {/* 현장 출퇴근 QR */}
            <div className="border-t border-gray-100 mt-6 pt-6 space-y-4">
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-gray-500" />
                  현장 출퇴근 QR 코드
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  근로자가 출근/퇴근 시 스캔할 QR 코드입니다. 인쇄해서 현장 입구에 부착하세요.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-50 border border-gray-150 rounded-xl p-6 flex flex-col items-center justify-center">
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt="현장 QR" className="w-48 h-48 border border-gray-200 bg-white p-2 rounded-lg" />
                  ) : (
                    <div className="w-48 h-48 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-center text-gray-400 text-xs px-4">
                      <QrCode className="w-10 h-10 mb-2" />
                      아직 QR 코드가<br />발급되지 않았습니다.
                    </div>
                  )}
                  {(settings.site as any)?.checkinCode && (
                    <p className="mt-3 text-[10px] font-mono text-gray-400">
                      코드: {(settings.site as any).checkinCode}
                    </p>
                  )}
                </div>

                <div className="space-y-3 text-xs text-gray-600">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
                    <p className="font-semibold text-amber-900 mb-1">⚠️ 운영 안내</p>
                    <ul className="space-y-1 text-amber-800 text-[11px]">
                      <li>• 재발급 시 <b>기존 QR은 즉시 무효화</b>됩니다.</li>
                      <li>• 새 QR을 인쇄해 현장에 다시 부착해야 합니다.</li>
                      <li>• 분실/유출이 의심되면 즉시 재발급하세요.</li>
                    </ul>
                  </div>

                  <button
                    onClick={handleRegenerateQr}
                    disabled={regenerating}
                    className="w-full flex items-center justify-center gap-2 bg-slate-900 text-white px-4 py-2.5 rounded-lg text-sm font-bold hover:bg-slate-800 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${regenerating ? "animate-spin" : ""}`} />
                    {(settings.site as any)?.checkinCode ? "QR 재발급" : "QR 최초 발급"}
                  </button>

                  <button
                    onClick={handlePrintQr}
                    disabled={!qrDataUrl}
                    className="w-full flex items-center justify-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Printer className="w-4 h-4" />
                    인쇄용 페이지 열기
                  </button>

                  {qrError && (
                    <p className="text-rose-600 text-[11px] font-mono">{qrError}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SUB TAB 2: WORKING HOURS REGULAR CONTRACTS */}
        {activeSubTab === "workTime" && (
          <form onSubmit={saveWorkTime} className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <Clock className="w-5 h-5 text-gray-500" />
                기본 정근 일과 시간 규정 (Work Time Constants)
              </h3>
              <p className="text-xs text-gray-400 mt-1">상용근로자(월급제/시급제)의 표준 일일 출퇴근 시간 및 점심 비공수 시간을 통지합니다.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">기본 출근 지정시간 *</label>
                    <input
                      type="time"
                      name="defaultCheckIn"
                      defaultValue={settings.workTime.defaultCheckIn}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">기본 퇴근 지정시간 *</label>
                    <input
                      type="time"
                      name="defaultCheckOut"
                      defaultValue={settings.workTime.defaultCheckOut}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">휴게(점심) 시작 *</label>
                    <input
                      type="time"
                      name="lunchStart"
                      defaultValue={settings.workTime.lunchStart}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">휴게(점심) 종료 *</label>
                    <input
                      type="time"
                      name="lunchEnd"
                      defaultValue={settings.workTime.lunchEnd}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">총 점심시간 시간 (hr) *</label>
                    <input
                      type="number"
                      step="0.5"
                      name="lunchDuration"
                      defaultValue={settings.workTime.lunchDuration}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">하루 표준 근무 시간 (hr) *</label>
                    <input
                      type="number"
                      name="standardDailyHours"
                      defaultValue={settings.workTime.standardDailyHours}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">주당 표준 소정 근무 (hr) *</label>
                    <input
                      type="number"
                      name="standardWeeklyHours"
                      defaultValue={settings.workTime.standardWeeklyHours}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100 flex flex-col justify-between">
                <div className="space-y-3">
                  <span className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-blue-500" /> 표준 공수 산정 가이드라인
                  </span>
                  <div className="text-xs text-gray-650 space-y-2 leading-relaxed">
                    <p>
                      - 본 근무 규정은 시뮬레이터에서 일반 상용 근로자(월급제/시급제)의 <strong>연장 및 주휴 주급 계산식</strong>에 전제 비율을 부여합니다.
                    </p>
                    <p>
                      - 점심 시간인 <strong>{settings.workTime.lunchStart} ~ {settings.workTime.lunchEnd} ({settings.workTime.lunchDuration}시간)</strong> 동안의 체류 시간은 실 근로 시간 산정에서 규정대로 제외됩니다.
                    </p>
                    <p>
                      - 수당 수정 시, 이력 관리 카테고리 <code>workTime</code>에 감사 로그가 자동으로 등재되어 근로감독 검사에 상시 대비합니다.
                    </p>
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white py-2 px-4 rounded-lg text-sm font-semibold hover:bg-gray-800 transition"
                >
                  <Save className="w-4 h-4" /> 일과 시간 보정안 저장
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-gray-500" />
                  근로자 분류 옵션
                </h3>
                <p className="text-xs text-gray-400 mt-1">근로자 등록 화면에서 선택하는 소속부서/팀, 직급, 직무 목록입니다.</p>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {renderWorkOptionEditor(
                  "소속부서/팀",
                  "departments",
                  DEFAULT_DEPARTMENT_OPTIONS,
                  newDepartmentOption,
                  setNewDepartmentOption,
                  "예: 품질부"
                )}
                {renderWorkOptionEditor(
                  "직급",
                  "ranks",
                  DEFAULT_RANK_OPTIONS,
                  newRankOption,
                  setNewRankOption,
                  "예: 선임"
                )}
                {renderWorkOptionEditor(
                  "직무",
                  "jobs",
                  DEFAULT_JOB_OPTIONS,
                  newJobOption,
                  setNewJobOption,
                  "예: 검사"
                )}
              </div>
            </div>
          </form>
        )}

        {/* SUB TAB 3: OVERTIME MULTIPLIERS */}
        {activeSubTab === "overtime" && (
          <div className="space-y-6">
            <form onSubmit={saveOvertime}>
              <div>
                <h3 className="text-lg font-bold text-gray-950 flex items-center gap-2">
                  <Coins className="w-5 h-5 text-gray-500" />
                  수당 가산 할증 기준 규정 (Overtime & Night Multipliers)
                </h3>
                <p className="text-xs text-gray-400 mt-1">출퇴근 정책 외 부가 연장 및 야간 근로 시간에 대해 지출할 할증 비율입니다.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-5">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">평일 연장 근로 배율 *</label>
                    <input
                      type="number"
                      step="0.1"
                      name="weekdayOvertimeRate"
                      defaultValue={settings.overtimeRules.weekdayOvertimeRate}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono"
                      required
                    />
                    <span className="text-[10px] text-gray-400">근로기준법 최저 기준 1.5배 이상 권장</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">휴일 근로 기본 배율 *</label>
                    <input
                      type="number"
                      step="0.1"
                      name="holidayRate"
                      defaultValue={settings.overtimeRules.holidayRate}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">휴일 연장 근로 기본 배율 *</label>
                    <input
                      type="number"
                      step="0.1"
                      name="holidayOvertimeRate"
                      defaultValue={settings.overtimeRules.holidayOvertimeRate}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">심야 인정 구간 (시작) *</label>
                      <input
                        type="time"
                        name="nightStart"
                        defaultValue={settings.overtimeRules.nightStart}
                        className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">심야 인정 구간 (종료) *</label>
                      <input
                        type="time"
                        name="nightEnd"
                        defaultValue={settings.overtimeRules.nightEnd}
                        className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1">야간 근로 심야 배율 *</label>
                    <input
                      type="number"
                      step="0.1"
                      name="nightRate"
                      defaultValue={settings.overtimeRules.nightRate}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono"
                      required
                    />
                    <span className="text-[10px] text-gray-400">근로기준법 기준 0.5배 가산 적용</span>
                  </div>

                  <button
                    type="submit"
                    className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white py-2 px-4 rounded-lg text-sm font-semibold hover:bg-gray-800 transition shadow mt-10"
                  >
                    <Save className="w-4 h-4" /> 가산 가중치 규정 저장
                  </button>
                </div>
              </div>
            </form>

            {/* Daily worker detailed time frame공수 standards */}
            <form onSubmit={saveDailyRules} className="pt-6 border-t border-gray-150">
              <div>
                <h4 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                  <Coins className="w-4 h-4 text-orange-500" />
                  일용직 / 사업소득자 가산 공수 산격 기준 (Daily Labor Multipliers)
                </h4>
                <p className="text-[11px] text-gray-400">조출(새벽) 및 오후, 저녁 야간 연장 투입에 대한 시간대별 누적 공수 기준입니다.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                <div className="space-y-4 bg-orange-50/10 p-4 rounded-xl border border-orange-100">
                  <p className="text-xs font-semibold text-orange-850">A. 새벽 작업 (조출 조항)</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] text-gray-405">조출 개시</label>
                      <input type="time" name="earlyMorningStart" defaultValue={settings.dailyWorkerRules.earlyMorningStart} className="w-full px-2 py-1 border border-gray-200 rounded text-xs bg-white" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-405">조출 종료</label>
                      <input type="time" name="earlyMorningEnd" defaultValue={settings.dailyWorkerRules.earlyMorningEnd} className="w-full px-2 py-1 border border-gray-200 rounded text-xs bg-white" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-410">가산 공수 *</label>
                      <input type="number" step="0.1" name="earlyMorningWorkDays" defaultValue={settings.dailyWorkerRules.earlyMorningWorkDays} className="w-full px-2 py-1 border border-gray-200 rounded text-xs bg-white font-mono" />
                    </div>
                  </div>
                </div>

                <div className="space-y-4 bg-orange-50/10 p-4 rounded-xl border border-orange-100">
                  <p className="text-xs font-semibold text-orange-850">B. 오후 연장 작업 (연장 1단계)</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] text-gray-405">연장1 개시</label>
                      <input type="time" name="afternoonOvertimeStart" defaultValue={settings.dailyWorkerRules.afternoonOvertimeStart} className="w-full px-2 py-1 border border-gray-200 rounded text-xs bg-white" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-405">연장1 종료</label>
                      <input type="time" name="afternoonOvertimeEnd" defaultValue={settings.dailyWorkerRules.afternoonOvertimeEnd} className="w-full px-2 py-1 border border-gray-200 rounded text-xs bg-white" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-410">가산 공수 *</label>
                      <input type="number" step="0.1" name="afternoonOvertimeWorkDays" defaultValue={settings.dailyWorkerRules.afternoonOvertimeWorkDays} className="w-full px-2 py-1 border border-gray-200 rounded text-xs bg-white font-mono" />
                    </div>
                  </div>
                </div>

                <div className="space-y-4 bg-orange-50/10 p-4 rounded-xl border border-orange-100">
                  <p className="text-xs font-semibold text-orange-850">C. 저녁 야간 연장 (연장 2단계)</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] text-gray-405">연장2 개시</label>
                      <input type="time" name="eveningOvertimeStart" defaultValue={settings.dailyWorkerRules.eveningOvertimeStart} className="w-full px-2 py-1 border border-gray-200 rounded text-xs bg-white" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-405">연장2 종료</label>
                      <input type="time" name="eveningOvertimeEnd" defaultValue={settings.dailyWorkerRules.eveningOvertimeEnd} className="w-full px-2 py-1 border border-gray-200 rounded text-xs bg-white" />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-410">가산 공수 *</label>
                      <input type="number" step="0.1" name="eveningOvertimeWorkDays" defaultValue={settings.dailyWorkerRules.eveningOvertimeWorkDays} className="w-full px-2 py-1 border border-gray-200 rounded text-xs bg-white font-mono" />
                    </div>
                  </div>
                </div>

                <div className="space-y-4 bg-gray-50 p-4 rounded-xl border border-gray-205 flex flex-col justify-between">
                  <div>
                    <label className="block text-xs font-semibold text-gray-650">일용 연장 휴일 배율 지정</label>
                    <input type="number" step="0.1" name="holidayRate" defaultValue={settings.dailyWorkerRules.holidayRate} className="w-full mt-1.5 px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white font-mono" />
                    <span className="text-[10px] text-gray-400">일용 근로자가 빨간 날 근무 시 적용되는 1일 투입 기본 배율 수당입니다. (통상 1.0)</span>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-orange-600 text-white font-semibold text-sm py-2 px-4 rounded-lg hover:bg-orange-500 transition shadow"
                  >
                    일용직 타임 배점 가산 저장
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {activeSubTab === "ordinaryWage" && (
          <form onSubmit={saveOrdinaryWage} className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-gray-950 flex items-center gap-2">
                <Coins className="w-5 h-5 text-gray-500" />
                시급제 통상임금 기준
              </h3>
              <p className="text-xs text-gray-400 mt-1">시급제 근로자를 월급제처럼 고정 월급으로 계산할 때 사용할 통상임금 기준을 설정합니다.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">시급제 통상임금 기준 시급</label>
                  <input
                    type="number"
                    name="hourlyOrdinaryWageRate"
                    defaultValue={settings.workTime.hourlyOrdinaryWageRate ?? 10320}
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono"
                    min="0"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">월 기준 시간</label>
                  <input
                    type="number"
                    name="hourlyOrdinaryMonthlyHours"
                    defaultValue={settings.workTime.hourlyOrdinaryMonthlyHours ?? 209}
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono"
                    min="1"
                    required
                  />
                  <span className="text-[10px] text-gray-400">고정 월급 산정식은 `기준 시급 × 월 기준 시간`입니다. 현재 기본값은 209시간입니다.</span>
                </div>
              </div>

              <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100 space-y-3 text-xs text-gray-700 leading-relaxed">
                <p className="font-semibold text-gray-900">운영 메모</p>
                <p>- 월급제는 `고정 월급 + 잔업수당` 구조로 계산됩니다.</p>
                <p>- 월급제 잔업수당은 근로자별 `시급` 입력값을 기준으로 계산됩니다.</p>
                <p>- 시급제는 여기서 설정한 `통상임금 기준 시급 × 월 기준 시간`으로 고정 월급을 계산합니다.</p>
                <p>- 현재 요청하신 기본값은 `10,320원 × 209시간 = 2,156,880원`입니다.</p>
              </div>
            </div>

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 bg-gray-900 text-white py-2 px-4 rounded-lg text-sm font-semibold hover:bg-gray-800 transition"
            >
              <Save className="w-4 h-4" /> 통상임금 기준 저장
            </button>
          </form>
        )}

        {/* SUB TAB 4: TAX & SOCIAL INSURANCE RATES */}
        {activeSubTab === "insuranceTax" && (
          <div className="space-y-6">
            
            {/* Social Insurances */}
            <form onSubmit={saveInsurance}>
              <div>
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-gray-500" />
                  정부고시 4대 사회 보험 요율 규정 (Social Insurance Rates)
                </h3>
                <p className="text-xs text-gray-400 mt-1">상용 급여 정산 공제에 정량 매핑되는 근로자 자부담분 원천징수 요율입니다.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">국민연금 근로자 요율 (%) *</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        name="nationalPensionRate"
                        defaultValue={Number((settings.insuranceRates.nationalPensionRate * 100).toFixed(3))}
                        className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono pr-8"
                        required
                      />
                      <span className="absolute right-3 top-2 text-xs text-gray-400">%</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">건강보험 근로자 요율 (%) *</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.001"
                        name="healthInsuranceRate"
                        defaultValue={Number((settings.insuranceRates.healthInsuranceRate * 100).toFixed(4))}
                        className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono pr-8"
                        required
                      />
                      <span className="absolute right-3 top-2 text-xs text-gray-400">%</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">장기요양보험 근로자 요율 (건보료 대비 비율 %) *</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        name="longTermCareRate"
                        defaultValue={Number((settings.insuranceRates.longTermCareRate * 100).toFixed(3))}
                        className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono pr-8"
                        required
                      />
                      <span className="absolute right-3 top-2 text-xs text-gray-400">%</span>
                    </div>
                    <span className="text-[10px] text-gray-400">건강보험료 산액 기준 고시 배당 요율</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">고용보험 근로자 요율 (%) *</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        name="employmentInsuranceRate"
                        defaultValue={Number((settings.insuranceRates.employmentInsuranceRate * 100).toFixed(3))}
                        className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono pr-8"
                        required
                      />
                      <span className="absolute right-3 top-2 text-xs text-gray-400">%</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">보험요율 적용 고시 시작일 *</label>
                    <input
                      type="date"
                      name="effectiveFrom"
                      defaultValue={settings.insuranceRates.effectiveFrom}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-blue-700 text-white font-semibold text-sm py-2 px-4 rounded-lg hover:bg-blue-600 transition shadow mt-5"
                  >
                    4대보험 공제 요율 개정 적용
                  </button>
                </div>
              </div>
            </form>

            {/* Income Taxes for freelancer & daily labor */}
            <form onSubmit={saveTaxes} className="pt-6 border-t border-gray-150">
              <div>
                <h4 className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-purple-600" />
                  소득원별 정부 원천 징수 세율 규정 (Taxation Rules)
                </h4>
                <p className="text-[11px] text-gray-400">일용 근로 자진 면제 혜택 한도 및 프리랜서 사업소득 원천 세율입니다.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">사업소득자(외주 3.3%) 소득세율 (%) *</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.1"
                        name="businessIncomeRate"
                        defaultValue={Number((settings.taxRules.businessIncomeRate * 100).toFixed(2))}
                        className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono pr-8"
                        required
                      />
                      <span className="absolute right-3 top-2 text-xs text-gray-400">%</span>
                    </div>
                    <span className="text-[10px] text-gray-400">일반적인 사업원천세 3.0% + 지방세 0.3% 포함</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-1">일용근로 소득세 최저 소득세율 (%) *</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.1"
                        name="dailyWorkerTaxRate"
                        defaultValue={Number((settings.taxRules.dailyWorkerTaxRate * 100).toFixed(2))}
                        className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono pr-8"
                        required
                      />
                      <span className="absolute right-3 top-1.5 text-xs text-gray-400">%</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 font-sans text-sm text-gray-600">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">일용직 하루 비과세 한도 (KRW) *</label>
                    <input
                      type="number"
                      name="dailyWorkerTaxFreeLimit"
                      defaultValue={settings.taxRules.dailyWorkerTaxFreeLimit}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono"
                      required
                    />
                    <span className="text-[10px] text-gray-400">현행 세법기준 150,000원 면세 한도 적용</span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">소득세 대비 지방소득세율 비율 (%) *</label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.1"
                        name="localTaxRate"
                        defaultValue={Number((settings.taxRules.localTaxRate * 100).toFixed(2))}
                        className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono pr-8"
                        required
                      />
                      <span className="absolute right-3 top-1.5 text-xs text-gray-400">%</span>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-purple-650 bg-gray-900 text-white font-semibold text-sm py-2 px-4 rounded-lg hover:bg-gray-800 transition shadow"
                  >
                    원천 징수 세무 세율 저장
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* SUB TAB 5: PUBLIC ALLOWANCES BASE DEFAULTS */}
        {activeSubTab === "allowance" && (
          <form onSubmit={saveAllowances} className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <HeartHandshake className="w-5 h-5 text-gray-500" />
                회사 공용 복리후생 수당 기본값 규산 (Corporate Allowances)
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                계약 등록 시 근로자 프로필에서 개별 할당 수당을 임의 상속하기 위한 공통 수당 기본값 테이블입니다.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-150 space-y-1">
                <label className="block text-xs font-semibold text-gray-500 mb-1">공통 기본 식대 보조금 (₩/월)</label>
                <input
                  type="number"
                  name="meal"
                  defaultValue={settings.allowanceDefaults.meal}
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono bg-white"
                  required
                />
                <span className="text-[10px] text-gray-400">현 세율 20만원 비과세 한도권장</span>
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-150 space-y-1">
                <label className="block text-xs font-semibold text-gray-500 mb-1">공통 자가운전여비 보조금 (₩/월)</label>
                <input
                  type="number"
                  name="transport"
                  defaultValue={settings.allowanceDefaults.transport}
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono bg-white"
                  required
                />
              </div>

              <div className="bg-gray-50 p-4 rounded-xl border border-gray-150 space-y-1">
                <label className="block text-xs font-semibold text-gray-500 mb-1">공통 통신비 지원금 (₩/월)</label>
                <input
                  type="number"
                  name="phone"
                  defaultValue={settings.allowanceDefaults.phone}
                  className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono bg-white"
                  required
                />
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                type="submit"
                className="flex items-center gap-2 bg-gray-900 text-white font-semibold text-sm py-2 px-6 rounded-lg hover:bg-gray-800 transition shadow"
              >
                <Save className="w-4 h-4" /> 공용 수당 기준표 저장
              </button>
            </div>
          </form>
        )}

        {/* SUB TAB 6: HOLIDAY DIRECTORY & CALENDAR LOOKUP */}
        {activeSubTab === "calendar" && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-gray-950 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-gray-500" />
                  국가지정 공휴일 및 약정 달력 (Holidays Calendar)
                </h3>
                <p className="text-xs text-gray-400 mt-1">
                  2030년까지 법정 공휴일이 기본 등록되어 있으며, 관리자 임의의 현장 휴무도 추가 및 삭제할 수 있습니다.
                </p>
              </div>

              {/* Year filter selector */}
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="px-4 py-1.5 border border-gray-200 rounded-lg text-sm bg-white font-mono font-medium focus:ring-1 focus:ring-gray-300"
              >
                {[2026, 2027, 2028, 2029, 2030].map(yr => (
                  <option key={yr} value={yr}>{yr}년 무술지정</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Add Custom holiday Form */}
              <div className="md:col-span-1 bg-gray-50 p-5 rounded-2xl border border-gray-150 space-y-4">
                <p className="text-xs font-semibold text-gray-700 flex items-center gap-1">
                  <Plus className="w-4 h-4" /> 현장 임의 관리자 휴일 추가
                </p>

                <form onSubmit={handleAddHoliday} className="space-y-3">
                  <div>
                    <label className="block text-[11px] text-gray-500">휴일 지정 일자</label>
                    <input
                      type="date"
                      value={newHolidayDate}
                      onChange={(e) => setNewHolidayDate(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-gray-500">휴일 명칭 / 사유</label>
                    <input
                      type="text"
                      placeholder="창립기념 휴무 / 동절기 폭설대비"
                      value={newHolidayName}
                      onChange={(e) => setNewHolidayName(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white"
                      required
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full flex items-center justify-center gap-1 bg-red-600 text-white font-semibold text-xs py-2 px-3 rounded-lg hover:bg-red-500 transition shadow"
                  >
                    공휴 지정 등록
                  </button>
                </form>

                <div className="pt-3 border-t border-gray-200">
                  <span className="text-[10px] text-gray-500 leading-relaxed block leading-3 bg-white p-2.5 rounded border border-gray-200/60">
                    <strong>빨간 날 규정 효과:</strong><br />
                    본 달력에 등록된 빨간 날은 급여 계산기 시뮬레이터에서 <strong>[휴일근무]</strong> 범주에 자동으로 병행 체크되어 <strong>{settings.overtimeRules.holidayRate}배의 할증</strong>을 정산합니다.
                  </span>
                </div>
              </div>

              {/* Sorted list of active year's holidays */}
              <div className="md:col-span-2 space-y-3">
                <p className="text-xs font-bold text-gray-500">
                  {selectedYear}년도 등록된 총 휴일 목록 ({filteredHolidays.length}개 일)
                </p>

                <div className="max-h-[350px] overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-100 shadow-inner bg-white">
                  {filteredHolidays.length === 0 ? (
                    <div className="text-center py-12 text-gray-400 text-sm">등록된 공지 일정이 없습니다.</div>
                  ) : (
                    filteredHolidays.map((h) => (
                      <div key={h.id} className="flex items-center justify-between p-3 px-4 hover:bg-gray-50 transition">
                        <div className="flex items-center gap-3">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded font-mono ${
                            h.type === "public" ? "bg-red-50 text-red-650 border border-red-100" : "bg-purple-50 text-purple-700 border border-purple-100"
                          }`}>
                            {h.type === "public" ? "법정국경일" : "회사지정일"}
                          </span>
                          <span className="font-mono text-sm font-medium text-gray-700">{h.date}</span>
                          <span className="text-sm text-gray-900 font-semibold">{h.name}</span>
                        </div>
                        <button
                          onClick={() => handleDeleteHoliday(h)}
                          className="text-gray-400 hover:text-red-600 p-1.5 hover:bg-gray-100 rounded-full"
                          title="휴일 삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* SUB TAB 7: LEAVE STANDARD ACCRUALS */}
        {activeSubTab === "annualLeave" && (
          <form onSubmit={saveAnnualLeave} className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-gray-950 flex items-center gap-2">
                <Layers className="w-5 h-5 text-gray-500" />
                약정 연차 휴일 산정 자격 규산 (Annual Leave Rules)
              </h3>
              <p className="text-xs text-gray-400 mt-1">상용 근로자 대상 연정 연차 및 월정 휴무 산정 약정 구조를 설정합니다.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">1년미만/1년차 연차 배정 한도 (일/월)</label>
                  <input
                    type="number"
                    name="firstYearDays"
                    defaultValue={settings.annualLeave.firstYearDays}
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono"
                    required
                  />
                  <span className="text-[10px] text-gray-400">근로기준법 기준 최하 11일 부여</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">2년차 이상 기본 부여 연차 일수 (일/년)</label>
                  <input
                    type="number"
                    name="secondYearDays"
                    defaultValue={settings.annualLeave.secondYearDays}
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono"
                    required
                  />
                  <span className="text-[10px] text-gray-400">근로기준법 최저 기준 15일</span>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">총 누계 법안 연차 상한선 (일)</label>
                  <input
                    type="number"
                    name="maxDays"
                    defaultValue={settings.annualLeave.maxDays}
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono"
                    required
                  />
                  <span className="text-[10px] text-gray-400">최대 인정 상한 (통상 25일)</span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">연차 발생 및 갱신 방식</label>
                  <select
                    name="accrualMethod"
                    defaultValue={settings.annualLeave.accrualMethod}
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white"
                  >
                    <option value="monthly">월 단위 적치 발생 (1개월 만근 시 1일)</option>
                    <option value="yearly">연 단위 일괄 부여 (회계연도 기준 일괄충전)</option>
                  </select>
                </div>

                <div className="flex justify-end pt-4">
                  <button
                    type="submit"
                    className="w-full bg-gray-900 text-white font-semibold text-sm py-2 px-4 rounded-lg hover:bg-gray-800 transition shadow"
                  >
                    연차 산정 개편 저장
                  </button>
                </div>
              </div>
            </div>
          </form>
        )}

        {/* SUB TAB 8: AUDIT TRAIL LOGS */}
        {activeSubTab === "history" && (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-bold text-gray-950 flex items-center gap-2">
                <History className="w-5 h-5 text-gray-500" />
                모든 운영 정책 변경 및 연도 감사 이력 (Audit Trail logs)
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                하드코딩 배격 원칙에 의거하여, 누가, 언제, 어떤 설정을 수정하였는지 데이터베이스에 기록된 이력 일람입니다.
              </p>
            </div>

            <div className="space-y-4 font-mono max-h-[500px] overflow-y-auto pr-2 divide-y divide-gray-100">
              {history.length === 0 ? (
                <div className="text-center py-12 text-gray-450 text-sm">아직 수집된 변경 이력이 없습니다.</div>
              ) : (
                history.map((log) => {
                  let formattedDate = "";
                  if (log.timestamp) {
                    if (log.timestamp.seconds) {
                      formattedDate = new Date(log.timestamp.seconds * 1000).toLocaleString("ko-KR");
                    } else if (typeof log.timestamp === "string") {
                      formattedDate = new Date(log.timestamp).toLocaleString("ko-KR");
                    }
                  } else {
                    formattedDate = "방금전";
                  }

                  return (
                    <div key={log.id} className="pt-4 first:pt-0 space-y-2 text-xs">
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`px-2 py-0.5 font-bold rounded text-[10px] ${
                            log.action === "update" ? "bg-amber-100 text-amber-800" :
                            log.action === "create" ? "bg-green-100 text-green-800" :
                            "bg-red-100 text-red-800"
                          }`}>
                            {log.action.toUpperCase()}
                          </span>
                          <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-bold text-[10px]">
                            {log.category}
                          </span>
                          <span className="text-gray-900 font-bold">{log.label}</span>
                        </div>
                        <span className="text-gray-400 font-medium">{formattedDate}</span>
                      </div>

                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-150 text-[11px] text-gray-700 space-y-1">
                        <p className="text-gray-550 font-medium">관리자 계정: <span className="text-gray-800 font-bold">{log.changedBy}</span></p>
                        
                        {/* Diff data view block if populated */}
                        {log.toValue && Object.keys(log.toValue).length > 0 && (
                          <div className="mt-2 text-[10px] border-t border-gray-200/50 pt-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                            {log.fromValue && Object.keys(log.fromValue).length > 0 && (
                              <div className="opacity-70">
                                <span className="text-red-500 font-bold">이전 설정값 (From):</span>
                                <pre className="bg-[#fee2e2]/30 p-2 rounded mt-1 overflow-x-auto text-[9px] max-h-24">
                                  {JSON.stringify(log.fromValue, null, 2)}
                                </pre>
                              </div>
                            )}
                            <div>
                              <span className="text-emerald-600 font-bold">새 설정값 (To):</span>
                              <pre className="bg-[#d1fae5]/30 p-2 rounded mt-1 overflow-x-auto text-[9px] max-h-24">
                                {JSON.stringify(log.toValue, null, 2)}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
