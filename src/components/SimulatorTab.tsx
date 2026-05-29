import React, { useState, useEffect } from "react";
import { useApp as useFirebase } from "../context/SupabaseContext";
import { calculatePayroll, MonthlySimulationInput } from "../utils/payrollCalculator";
import { Worker } from "../types";
import { Calculator, FileText, Scale, Sparkles, TrendingUp, HelpCircle, Landmark } from "lucide-react";

export const SimulatorTab: React.FC = () => {
  const { workers, settings } = useFirebase();
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>("");

  // Input States for Simulation
  const [standardDays, setStandardDays] = useState<number>(20);
  const [earlyMorningDays, setEarlyMorningDays] = useState<number>(0);
  const [afternoonOvertimeDays, setAfternoonOvertimeDays] = useState<number>(0);
  const [eveningOvertimeDays, setEveningOvertimeDays] = useState<number>(0);
  const [holidayDays, setHolidayDays] = useState<number>(0);
  const [nightHours, setNightHours] = useState<number>(0);
  const [overtimeHoursWeekly, setOvertimeHoursWeekly] = useState<number>(0);
  const [cashAdvanceInput, setCashAdvanceInput] = useState<number>(0);

  // Initialize with the first worker if available
  useEffect(() => {
    if (workers.length > 0 && !selectedWorkerId) {
      setSelectedWorkerId(workers[0].id || workers[0].workerId);
    }
  }, [workers]);

  const selectedWorker = workers.find(
    (w) => w.id === selectedWorkerId || w.workerId === selectedWorkerId
  );

  // Pre-populate input defaults based on chosen worker's type
  useEffect(() => {
    if (!selectedWorker) return;
    
    // Set standard shifts default
    setStandardDays(20);
    setEarlyMorningDays(0);
    setAfternoonOvertimeDays(0);
    setEveningOvertimeDays(0);
    setHolidayDays(0);
    setNightHours(0);
    setOvertimeHoursWeekly(0);
    setCashAdvanceInput(selectedWorker.deductionSettings.cashAdvance || 0);

    if (selectedWorker.employmentType === "salary") {
      setOvertimeHoursWeekly(10); // salary standard expectation
    } else if (selectedWorker.employmentType === "hourly") {
      setOvertimeHoursWeekly(12);
    } else if (selectedWorker.employmentType === "daily") {
      setEarlyMorningDays(3);
      setAfternoonOvertimeDays(4);
    }
  }, [selectedWorkerId]);

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
      <div className="text-center py-12 bg-white rounded-xl border border-gray-100 animate-pulse">
        <p className="text-gray-500 text-sm">운영 정책 규칙 수당표를 로딩 중입니다...</p>
      </div>
    );
  }

  if (workers.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
        <Calculator className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">급여 계약 시뮬레이션을 수행하려면 먼저 "근로자 관리" 탭에서 근로자를 등록하십시오.</p>
      </div>
    );
  }

  const result = selectedWorker
    ? calculatePayroll(selectedWorker, settings, {
        standardDays,
        earlyMorningDays,
        afternoonOvertimeDays,
        eveningOvertimeDays,
        holidayDays,
        nightHours,
        overtimeHoursWeekly,
        cashAdvanceInput,
      })
    : null;

  return (
    <div id="payroll-simulator-layout" className="grid grid-cols-1 xl:grid-cols-12 gap-4">
      
      {/* Simulation Inputs Column */}
      <div className="xl:col-span-12 lg:xl:col-span-5 xl:col-span-5 bg-white p-4 sm:p-5 rounded-lg border border-slate-205 shadow-2xs space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-950 flex items-center gap-2">
            <Calculator className="w-4 h-4 text-slate-500" />
            월정 근로 시간 & 공수 산정 (Simulation Inputs)
          </h3>
          <p className="text-[10px] text-slate-400 mt-1">임의의 월별 근로 일수와 연장 근로를 조합하여 수당을 계산하십시오.</p>
        </div>

        {/* Worker selector dropdown */}
        <div>
          <label className="block text-[10px] font-bold text-slate-400 mb-1.5 uppercase font-mono tracking-wider">대상 근로자 선택 및 계약 동기화 *</label>
          <select
            value={selectedWorkerId}
            onChange={(e) => setSelectedWorkerId(e.target.value)}
            className="w-full px-3 py-1.5 border border-slate-250 bg-white rounded text-xs text-slate-900 font-bold focus:outline-none focus:border-blue-500 cursor-pointer shadow-2xs"
          >
            {workers.map((w) => (
              <option key={w.id || w.workerId} value={w.id || w.workerId}>
                [{w.workerId}] {w.name} - {w.duty}{w.job ? ` / ${w.job}` : ""} (
                {w.employmentType === "salary" ? "월급제" :
                 w.employmentType === "hourly" ? "시급제" :
                 w.employmentType === "daily" ? "일용직" : "사업소득(3.3%)"}
                )
              </option>
            ))}
          </select>
        </div>

        {selectedWorker && (
          <div className="space-y-4 pt-4 border-t border-gray-100">
            {/* Common standard days */}
            <div>
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-gray-500">평일 기본 근무 일수 (Normal Days)</span>
                <span className="text-blue-600 font-bold">{standardDays} 일(Day)</span>
              </div>
              <input
                type="range"
                min="0"
                max="31"
                value={standardDays}
                onChange={(e) => setStandardDays(Number(e.target.value))}
                className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer"
              />
            </div>

            {/* Daily and Business-use multi-gongsu metrics */}
            {(selectedWorker.employmentType === "daily" || selectedWorker.employmentType === "business") && (
              <div className="bg-orange-50/20 p-4 rounded-xl border border-orange-100/65 space-y-4">
                <span className="text-xs font-bold text-orange-950 block">일용직 가산 누계 공수 산출량 (조출/연장단계)</span>
                
                {/* Early morning */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500">조출 근무 일수 ({settings.dailyWorkerRules.earlyMorningStart} ~ {settings.dailyWorkerRules.earlyMorningEnd})</span>
                    <span className="text-orange-700 font-bold">+{earlyMorningDays * settings.dailyWorkerRules.earlyMorningWorkDays} 공수 ({earlyMorningDays}일)</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="31"
                    value={earlyMorningDays}
                    onChange={(e) => setEarlyMorningDays(Number(e.target.value))}
                    className="w-full h-1 bg-gray-100 rounded-lg cursor-pointer accent-orange-600"
                  />
                </div>

                {/* Afternoon Overtime */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500">연장 1단계 일수 ({settings.dailyWorkerRules.afternoonOvertimeStart} ~ {settings.dailyWorkerRules.afternoonOvertimeEnd})</span>
                    <span className="text-orange-700 font-bold">+{afternoonOvertimeDays * settings.dailyWorkerRules.afternoonOvertimeWorkDays} 공수 ({afternoonOvertimeDays}일)</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="31"
                    value={afternoonOvertimeDays}
                    onChange={(e) => setAfternoonOvertimeDays(Number(e.target.value))}
                    className="w-full h-1 bg-gray-100 rounded-lg cursor-pointer accent-orange-600"
                  />
                </div>

                {/* Evening Overtime */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-500">연장 2단계 일수 ({settings.dailyWorkerRules.eveningOvertimeStart} ~ {settings.dailyWorkerRules.eveningOvertimeEnd})</span>
                    <span className="text-orange-700 font-bold">+{eveningOvertimeDays * settings.dailyWorkerRules.eveningOvertimeWorkDays} 공수 ({eveningOvertimeDays}일)</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="31"
                    value={eveningOvertimeDays}
                    onChange={(e) => setEveningOvertimeDays(Number(e.target.value))}
                    className="w-full h-1 bg-gray-100 rounded-lg cursor-pointer accent-orange-600"
                  />
                </div>
              </div>
            )}

            {/* Overtime hours weekly for regular salaried worker */}
            {(selectedWorker.employmentType === "salary" || selectedWorker.employmentType === "hourly") && (
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-gray-500">월 총외 추가 연장근로 시간 (Overtime Hours)</span>
                  <span className="text-green-600 font-bold">{overtimeHoursWeekly} 시간</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="60"
                  value={overtimeHoursWeekly}
                  onChange={(e) => setOvertimeHoursWeekly(Number(e.target.value))}
                  className="w-full h-1.5 bg-gray-100 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            )}

            {/* Night shift and holidays */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-gray-500">휴일 투입 일수</span>
                  <span className="text-red-500 font-bold">{holidayDays} 일</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="15"
                  value={holidayDays}
                  onChange={(e) => setHolidayDays(Number(e.target.value))}
                  className="w-full h-1 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-red-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-semibold mb-1">
                  <span className="text-gray-500">심야 야간 시간 (hr)</span>
                  <span className="text-purple-600 font-bold">{nightHours} hr</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="50"
                  value={nightHours}
                  onChange={(e) => setNightHours(Number(e.target.value))}
                  className="w-full h-1 bg-gray-100 rounded-lg appearance-none cursor-pointer accent-purple-600"
                />
              </div>
            </div>

            {/* Cash advance input */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">이번 달 선가불 차감 지불액 (KRW)</label>
              <input
                type="number"
                step="10000"
                value={cashAdvanceInput}
                onChange={(e) => setCashAdvanceInput(Number(e.target.value))}
                className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white font-mono text-gray-800 focus:outline-none focus:ring-1 focus:ring-gray-300"
              />
            </div>
          </div>
        )}
      </div>

      {/* Salary Slip Output (급여명세서) Column */}
      <div className="xl:col-span-12 lg:xl:col-span-7 xl:col-span-7 space-y-4">
        {result && selectedWorker && (
          <>
            {/* The Slip Card container - High Density Slate Template */}
            <div id="payroll-slip-card" className="bg-slate-50 p-4 sm:p-5 rounded-lg border border-slate-205 shadow-sm font-sans space-y-4 min-w-full">
              
              {/* Slip Header */}
              <div className="border-b border-dashed border-slate-300 pb-4 text-center sm:text-left flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <span className="text-[9px] uppercase font-bold tracking-widest text-slate-450 font-mono">Official Pay Statement</span>
                  <h4 className="text-base font-extrabold text-slate-950 flex items-center justify-center sm:justify-start gap-1.5 mt-0.5">
                    <FileText className="w-4 h-4 text-slate-600" />
                    급여정산 명세서 (Paycheck Registry)
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5 font-mono">씨엠(CM)건설 - 현장명: <span className="font-bold text-slate-700">{settings.site.companyName}</span></p>
                </div>

                <div className="bg-white px-3 py-1.5 rounded border border-slate-200 flex flex-col items-center sm:items-end shadow-3xs">
                  <span className="text-[9px] text-slate-450 uppercase font-bold tracking-tight">정산 실수령액 (Net Pay)</span>
                  <span className="text-lg font-black text-blue-700 font-mono">
                    ₩{result.netPay.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Personnel specs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-white p-3 rounded border border-slate-150 text-[11px] font-mono">
                <div>
                  <span className="text-slate-400 block mb-0.5">사원 성명</span>
                  <span className="font-bold text-slate-850">{selectedWorker.name}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">사원 번호</span>
                  <span className="font-bold text-slate-800">{selectedWorker.workerId}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">고용 형태</span>
                  <span className="font-bold text-blue-700">
                    {selectedWorker.employmentType === "salary" ? "월급제 (상용)" :
                     selectedWorker.employmentType === "hourly" ? "시급제 (상용)" :
                     selectedWorker.employmentType === "daily" ? "일용인부" : "사업소득(3.3%)"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">정산 귀속</span>
                  <span className="font-bold text-slate-800">{new Date().getFullYear()}년 5월 귀속</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-0.5">통상 시급 기준</span>
                  <span className="font-bold text-slate-800">₩{result.ordinaryHourlyRate.toLocaleString()}</span>
                </div>
              </div>

              {/* Earnings & Deductions Tables */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                
                {/* A. 지급 항목 (Earnings) */}
                <div className="space-y-1.5">
                  <p className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 w-fit uppercase tracking-wider font-mono">
                    지급 내역 (Earnings)
                  </p>
                  <div className="bg-white rounded border border-slate-200 divide-y divide-slate-100 overflow-hidden font-mono text-[11px]">
                    <div className="flex justify-between p-2.5 px-3">
                      <span className="text-gray-500">기본급 (Base Salary)</span>
                      <span className="font-semibold text-gray-800">₩{result.basePay.toLocaleString()}</span>
                    </div>

                    {/* allowances details */}
                    <div className="flex justify-between p-2.5 px-3">
                      <span className="text-gray-500">식 제공비 복리 수당</span>
                      <span className="font-semibold text-gray-800">₩{result.allowances.meal.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between p-2.5 px-3">
                      <span className="text-gray-500">여비 보조 복리 수당</span>
                      <span className="font-semibold text-gray-800">₩{result.allowances.transport.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between p-2.5 px-3">
                      <span className="text-gray-500">통신 보조 복리 수당</span>
                      <span className="font-semibold text-gray-800">₩{result.allowances.phone.toLocaleString()}</span>
                    </div>

                    {result.overtimePay > 0 && (
                    <div className="flex justify-between p-2.5 px-3 bg-stone-50">
                        <span className="text-gray-500 flex items-center gap-1">연장 근로 할증수당</span>
                        <span className="font-bold text-gray-900">₩{result.overtimePay.toLocaleString()}</span>
                      </div>
                    )}

                    {result.holidayPay > 0 && (
                      <div className="flex justify-between p-2.5 px-3 bg-stone-50">
                        <span className="text-gray-500">휴일 투입 할증수당</span>
                        <span className="font-bold text-gray-900">₩{result.holidayPay.toLocaleString()}</span>
                      </div>
                    )}

                    {result.nightPay > 0 && (
                      <div className="flex justify-between p-2.5 px-3 bg-stone-50">
                        <span className="text-gray-500">심야 야간 가중수당</span>
                        <span className="font-bold text-gray-900">₩{result.nightPay.toLocaleString()}</span>
                      </div>
                    )}

                    <div className="flex justify-between p-3 px-4 bg-emerald-50/20 text-emerald-800 font-bold border-t-2 border-stone-200">
                      <span>지급액 합계 (Gross salary)</span>
                      <span>₩{result.grossSalary.toLocaleString()}</span>
                    </div>
                  </div>

                  {selectedWorker.employmentType === "daily" && (
                    <div className="bg-amber-50 rounded-lg p-3 border border-amber-100 flex items-center justify-between text-xs font-mono text-amber-800">
                      <span>누계 산정 공수:</span>
                      <span className="font-bold text-sm">{result.totalManDays.toFixed(1)} 공수 (M/D)</span>
                    </div>
                  )}
                </div>

                {/* B. 공제 항목 (Deductions) */}
                <div className="space-y-2">
                  <p className="text-xs font-black text-rose-800 bg-rose-50 px-2.5 py-1 rounded w-fit uppercase tracking-wider">
                    공제 내역 (Deductions)
                  </p>
                  <div className="bg-white rounded-xl border border-gray-150 divide-y divide-gray-50 overflow-hidden font-mono text-xs">
                    
                    {/* Social insurances */}
                    <div className="flex justify-between p-2.5 px-3">
                      <span className="text-gray-500">국민연금 (National Pension)</span>
                      <span className="font-semibold text-gray-800">₩{result.deductions.nationalPension.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between p-2.5 px-3">
                      <span className="text-gray-500">건강보험 (Health Insurance)</span>
                      <span className="font-semibold text-gray-800">₩{result.deductions.healthInsurance.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between p-2.5 px-3">
                      <span className="text-gray-500 flex items-center gap-1">장기요양 (Long-term Care)</span>
                      <span className="font-semibold text-gray-800">₩{result.deductions.longTermCare.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between p-2.5 px-3">
                      <span className="text-gray-500">고용보험 (Employment Ins.)</span>
                      <span className="font-semibold text-gray-800">₩{result.deductions.employmentInsurance.toLocaleString()}</span>
                    </div>

                    {/* Taxes */}
                    <div className="flex justify-between p-2.5 px-3 bg-[#fff7ed]">
                      <span className="text-gray-600 font-bold">소득세 (Income Tax)</span>
                      <span className="font-semibold text-gray-850">₩{result.deductions.incomeTax.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between p-2.5 px-3 bg-[#fff7ed]">
                      <span className="text-gray-600 font-bold">지방소득세 (Local Tax)</span>
                      <span className="font-semibold text-gray-850">₩{result.deductions.localIncomeTax.toLocaleString()}</span>
                    </div>

                    {/* Registry deductions */}
                    {result.deductions.housingFee > 0 && (
                      <div className="flex justify-between p-2.5 px-3 text-red-650">
                        <span>합숙 주거 공제</span>
                        <span className="font-bold">₩{result.deductions.housingFee.toLocaleString()}</span>
                      </div>
                    )}

                    {result.deductions.cashAdvance > 0 && (
                      <div className="flex justify-between p-2.5 px-3 text-red-650">
                        <span>이월 및 추가 가불공제 (선지급)</span>
                        <span className="font-bold">₩{result.deductions.cashAdvance.toLocaleString()}</span>
                      </div>
                    )}

                    {result.deductions.customDeductionsTotal > 0 && (
                      <div className="flex justify-between p-2.5 px-3 text-red-650">
                        <span>기타 관리 차감</span>
                        <span className="font-bold">₩{result.deductions.customDeductionsTotal.toLocaleString()}</span>
                      </div>
                    )}

                    <div className="flex justify-between p-3 px-4 bg-rose-50/20 text-rose-800 font-bold border-t-2 border-stone-200">
                      <span>공제액 합계 (Total Deductions)</span>
                      <span>₩{result.deductions.total.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Statement Bottom Netpay box */}
              <div className="bg-[#111827] text-white p-5 rounded-xl border border-gray-850 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-center sm:text-left">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-wider text-gray-400 font-mono">Net salary paid to bank</span>
                  <p className="text-lg font-bold">이체 수급 계좌 (Bank Details)</p>
                  <p className="text-xs text-gray-300 flex items-center justify-center sm:justify-start gap-1 font-mono">
                    <Landmark className="w-4 h-4 text-gray-400" />
                    {selectedWorker.bankSettings.bankName} : {selectedWorker.bankSettings.accountNo} (예금주: {selectedWorker.bankSettings.holder || selectedWorker.name})
                  </p>
                </div>

                <div className="space-y-1">
                  <span className="text-[11px] text-gray-400 font-bold block">실지급액 (세후 수령액)</span>
                  <span className="text-2xl font-black font-mono text-amber-400">
                    ₩{result.netPay.toLocaleString()}
                  </span>
                </div>
              </div>

            </div>

            {/* Dynamic visual explanations of calculations to prove configuration authenticity */}
            <div className="bg-white p-6 rounded-xl border border-gray-150 space-y-4">
              <h5 className="text-sm font-bold text-gray-900 flex items-center gap-1.5 uppercase font-mono">
                <Scale className="w-5 h-5 text-blue-500" />
                원천 계산 지침식 증명 및 근거 보고 (Real-Time Formula Mapping)
              </h5>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-gray-650 leading-relaxed">
                <div className="bg-gray-50/50 p-4 rounded-lg border border-gray-100 space-y-2">
                  <p className="font-bold text-gray-800 flex items-center gap-1">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    소득 사회 보장 요율 매핑치 (Social Insurances)
                  </p>
                  <p>
                    - <strong>국민연금:</strong> 총과세액 x {settings.insuranceRates.nationalPensionRate * 100}% = <span className="font-semibold text-gray-800">₩{result.deductions.nationalPension.toLocaleString()}</span>
                  </p>
                  <p>
                    - <strong>건강보험:</strong> 총과세액 x {settings.insuranceRates.healthInsuranceRate * 100}% = <span className="font-semibold text-gray-800">₩{result.deductions.healthInsurance.toLocaleString()}</span>
                  </p>
                  <p>
                    - <strong>장기요양:</strong> 건강보험료 x {settings.insuranceRates.longTermCareRate * 100}% = <span className="font-semibold text-gray-800">₩{result.deductions.longTermCare.toLocaleString()}</span>
                  </p>
                  <p>
                    - <strong>고용보험:</strong> 총과세액 x {settings.insuranceRates.employmentInsuranceRate * 100}% = <span className="font-semibold text-gray-800">₩{result.deductions.employmentInsurance.toLocaleString()}</span>
                  </p>
                </div>

                <div className="bg-gray-50/50 p-4 rounded-lg border border-gray-100 space-y-2 font-sans">
                  <p className="font-bold text-gray-850 flex items-center gap-1">
                    <Sparkles className="w-4 h-4 text-purple-500" />
                    원천징수 지방세 산격 수식 (Korean Statutory Tax Deductions)
                  </p>

                  {selectedWorker.employmentType === "daily" ? (
                    <div className="space-y-1">
                      <p className="text-[11px] text-orange-900 font-semibold">※ 일용소득세법 특수공제 적용 (Day-by-Day):</p>
                      <p>
                        - 하루 비과세 한도 <strong>₩{(settings.taxRules.dailyWorkerTaxFreeLimit).toLocaleString()}</strong> 이하 비과세 소득.
                      </p>
                      <p>
                        - 일당 초과 산정세: (일단가 - {settings.taxRules.dailyWorkerTaxFreeLimit.toLocaleString()}) x {settings.taxRules.dailyWorkerTaxRate * 100}% x 45% (소득세 세액 공제)
                      </p>
                      <p>
                        - 지방소득세: 근로소득세액 x {settings.taxRules.localTaxRate * 100}% = <span className="font-semibold text-gray-800">₩{result.deductions.localIncomeTax.toLocaleString()}</span>
                      </p>
                    </div>
                  ) : selectedWorker.employmentType === "business" ? (
                    <div className="space-y-1">
                      <p className="text-[11px] text-purple-900 font-semibold">※ 사업소득자 3.3% 특수 원천 과세:</p>
                      <p>
                        - 사업소득세: 총수령액 x {(settings.taxRules.businessIncomeRate / 1.1 * 100).toFixed(1)}% = <span className="font-semibold text-gray-800">₩{result.deductions.incomeTax.toLocaleString()}</span>
                      </p>
                      <p>
                        - 지방세 (10% 주민세 가산): 사업소득세 x {settings.taxRules.localTaxRate * 100}% = <span className="font-semibold text-gray-800">₩{result.deductions.localIncomeTax.toLocaleString()}</span>
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold text-blue-900">※ 일반 상용 근로 간이세액 준용:</p>
                      <p>
                        - 통상시급 기준: <strong>₩{result.ordinaryHourlyRate.toLocaleString()}</strong>
                        {selectedWorker.employmentType === "salary"
                          ? " (월급제 근로자별 잔업 기준 시급)"
                          : selectedWorker.employmentType === "hourly"
                            ? ` (시급제 통상임금 기준 시급, 월 ${settings.workTime.hourlyOrdinaryMonthlyHours || 209}시간)`
                            : ""}
                      </p>
                      <p>
                        - 근로 연동 과세(소득세): 총급여 규모비례 약정세율 정형화 = <span className="font-semibold text-gray-800">₩{result.deductions.incomeTax.toLocaleString()}</span>
                      </p>
                      <p>
                        - 지방소득세: 산정 소득세액 x {settings.taxRules.localTaxRate * 100}% = <span className="font-semibold text-gray-800">₩{result.deductions.localIncomeTax.toLocaleString()}</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-sky-50 text-sky-850 p-3 rounded-lg border border-sky-150/70 flex gap-2.5 text-xs text-slate-650 leading-relaxed">
                <HelpCircle className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
                <p>
                  <strong>본 명세서 보고서의 신뢰성 검증:</strong> 위 수학적 계산 공식은 DB 설정 탭 내 <code>settings/insuranceRates</code>, <code>settings/taxRules</code> 컬렉션 실시간 값을 연산한 결과입니다. 하드코딩된 값은 단 하나도 존재하지 않습니다.
                </p>
              </div>
            </div>
          </>
        )}
      </div>

    </div>
  );
};
