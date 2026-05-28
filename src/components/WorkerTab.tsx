import React, { useState } from "react";
import { useApp as useFirebase, WorkerCredentials } from "../context/SupabaseContext";
import { Worker } from "../types";
import { Search, UserPlus, UserCheck, ShieldAlert, CreditCard, Building, Phone, Briefcase, Trash2, Edit2, X, AlertCircle, KeyRound, Copy, Check } from "lucide-react";

const DEPARTMENT_OPTIONS = [
  "관리본부",
  "현장시공팀",
  "골조공사팀",
  "설비기공팀",
  "특수시공팀",
  "안전관리반",
  "품질관리팀",
  "전기공사팀",
];

const DUTY_OPTIONS = [
  "사원",
  "기사",
  "과장",
  "반장",
  "목수",
  "철근공",
  "용접공",
  "설비공",
  "전기공",
  "안전관리자",
];

const withCurrentOption = (options: string[], currentValue: string) => {
  if (!currentValue || options.includes(currentValue)) return options;
  return [currentValue, ...options];
};

export const WorkerTab: React.FC = () => {
  const { workers, addWorker, updateWorker, deleteWorker, resetWorkerPassword, fetchResidentNumber, settings } = useFirebase();
  const [credentialsModal, setCredentialsModal] = useState<{
    title: string;
    worker: { name: string; workerId: string };
    creds: WorkerCredentials;
  } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);

  // Form State
  const [workerId, setWorkerId] = useState("");
  const [name, setName] = useState("");
  const [englishName, setEnglishName] = useState("");
  const [nationality, setNationality] = useState("대한민국 (Korea)");
  const [residentNumber, setResidentNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [employmentType, setEmploymentType] = useState<"salary" | "hourly" | "daily" | "business">("salary");
  const [contractDate, setContractDate] = useState("");
  const [joinDate, setJoinDate] = useState("");
  const [retireDate, setRetireDate] = useState("");
  const [duty, setDuty] = useState("");
  const [department, setDepartment] = useState("");

  // Pay settings
  const [monthlyBase, setMonthlyBase] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [dailyRate, setDailyRate] = useState("");
  const [mealOverride, setMealOverride] = useState("");
  const [transportOverride, setTransportOverride] = useState("");
  const [phoneOverride, setPhoneOverride] = useState("");

  // Deductions settings
  const [housingFee, setHousingFee] = useState("");
  const [cashAdvance, setCashAdvance] = useState("");
  const [customDeductions, setCustomDeductions] = useState<{ name: string; amount: number }[]>([]);
  const [newDeductionName, setNewDeductionName] = useState("");
  const [newDeductionAmount, setNewDeductionAmount] = useState("");

  // Banking
  const [bankName, setBankName] = useState("신한은행");
  const [accountNo, setAccountNo] = useState("");
  const [holder, setHolder] = useState("");

  // App login profiles
  const [loginId, setLoginId] = useState("");
  const [initialPassword, setInitialPassword] = useState("");
  const [language] = useState<"ko">("ko");

  const [formError, setFormError] = useState("");

  // Auto generate sequential ID or format phone
  const prepareOpenAdd = () => {
    // Generate sequential mock ID
    const year = new Date().getFullYear();
    const count = workers.length + 1;
    const padded = String(count).padStart(3, "0");
    
    setEditingWorker(null);
    setWorkerId(`CM-${year}-${padded}`);
    setName("");
    setEnglishName("");
    setNationality("대한민국 (Korea)");
    setResidentNumber("");
    setPhone("");
    setAddress("");
    setEmploymentType("salary");
    setContractDate(new Date().toISOString().split("T")[0]);
    setJoinDate(new Date().toISOString().split("T")[0]);
    setRetireDate("");
    setDuty("사원");
    setDepartment("현장시공팀");

    setMonthlyBase("3000000");
    setHourlyRate("12000");
    setDailyRate("180000");
    setMealOverride("");
    setTransportOverride("");
    setPhoneOverride("");

    setHousingFee("0");
    setCashAdvance("0");
    setCustomDeductions([]);
    setNewDeductionName("");
    setNewDeductionAmount("");

    setBankName("신한은행");
    setAccountNo("");
    setHolder("");

    setLoginId("");
    setInitialPassword("");
    setFormError("");

    setIsModalOpen(true);
  };

  const handleEdit = async (worker: Worker) => {
    setEditingWorker(worker);
    setWorkerId(worker.workerId);
    setName(worker.name);
    setEnglishName(worker.englishName || "");
    setNationality(worker.nationality);
    setResidentNumber(""); // RPC로 별도 로드
    setPhone(worker.phone);
    setAddress(worker.address);
    setEmploymentType(worker.employmentType);
    setContractDate(worker.contractDate);
    setJoinDate(worker.joinDate);
    setRetireDate(worker.retireDate || "");
    setDuty(worker.duty);
    setDepartment(worker.department);

    setMonthlyBase(String(worker.salarySettings.monthlyBase));
    setHourlyRate(String(worker.salarySettings.hourlyRate));
    setDailyRate(String(worker.salarySettings.dailyRate));
    
    setMealOverride(worker.salarySettings.allowances.meal === null ? "" : String(worker.salarySettings.allowances.meal));
    setTransportOverride(worker.salarySettings.allowances.transport === null ? "" : String(worker.salarySettings.allowances.transport));
    setPhoneOverride(worker.salarySettings.allowances.phone === null ? "" : String(worker.salarySettings.allowances.phone));

    setHousingFee(String(worker.deductionSettings.housingFee || 0));
    setCashAdvance(String(worker.deductionSettings.cashAdvance || 0));
    setCustomDeductions(worker.deductionSettings.customDeductions || []);

    setBankName(worker.bankSettings.bankName);
    setAccountNo(worker.bankSettings.accountNo);
    setHolder(worker.bankSettings.holder);

    setLoginId(worker.loginId);
    setInitialPassword("");

    setFormError("");
    setIsModalOpen(true);

    // 주민등록번호는 암호화 RPC로 별도 조회
    if (worker.id) {
      fetchResidentNumber(worker.id)
        .then((rn) => setResidentNumber(rn))
        .catch(() => {}); // 조회 실패 시 빈 값 유지
    }
  };

  const addCustomDeduction = () => {
    if (!newDeductionName || !newDeductionAmount) return;
    setCustomDeductions([
      ...customDeductions,
      { name: newDeductionName, amount: Number(newDeductionAmount) },
    ]);
    setNewDeductionName("");
    setNewDeductionAmount("");
  };

  const removeCustomDeduction = (idx: number) => {
    setCustomDeductions(customDeductions.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !workerId.trim() || !phone.trim() || !loginId.trim()) {
      setFormError("필수 항목 (*표시)들을 입력해주십시오.");
      return;
    }

    const workerPayload: Worker = {
      workerId,
      name,
      englishName,
      nationality,
      residentNumber,
      phone,
      address,
      employmentType,
      contractDate,
      joinDate,
      retireDate: retireDate ? retireDate : null,
      duty,
      department,
      salarySettings: {
        monthlyBase: Number(monthlyBase) || 0,
        hourlyRate: Number(hourlyRate) || 0,
        dailyRate: Number(dailyRate) || 0,
        allowances: {
          meal: mealOverride === "" ? null : Number(mealOverride),
          transport: transportOverride === "" ? null : Number(transportOverride),
          phone: phoneOverride === "" ? null : Number(phoneOverride),
        },
      },
      deductionSettings: {
        housingFee: Number(housingFee) || 0,
        cashAdvance: Number(cashAdvance) || 0,
        customDeductions,
      },
      bankSettings: {
        bankName,
        accountNo,
        holder: holder || name, // defaults to worker's name
      },
      loginId: loginId.replace(/-/g, ""),
      initialPassword,
      language,
    };

    try {
      if (editingWorker) {
        await updateWorker(editingWorker.id || workerId, workerPayload);
        setIsModalOpen(false);
      } else {
        const creds = await addWorker(workerPayload);
        setIsModalOpen(false);
        setCredentialsModal({
          title: "근로자 등록 및 로그인 계정 발급 완료",
          worker: { name: workerPayload.name, workerId: workerPayload.workerId },
          creds,
        });
      }
    } catch (err: any) {
      setFormError(err.message || "작업 도중 오류가 발생했습니다.");
    }
  };

  const handleResetPassword = async () => {
    if (!editingWorker?.id) return;
    if (!window.confirm(`${editingWorker.name} 의 비밀번호를 재발급하시겠습니까?\n기존 비밀번호로는 더 이상 로그인할 수 없습니다.`)) return;
    try {
      const creds = await resetWorkerPassword(editingWorker.id);
      setIsModalOpen(false);
      setCredentialsModal({
        title: "비밀번호 재발급 완료",
        worker: { name: editingWorker.name, workerId: editingWorker.workerId },
        creds,
      });
    } catch (err: any) {
      setFormError(err.message || "재발급 중 오류가 발생했습니다.");
    }
  };

  const handleDelete = async (id: string, wId: string) => {
    if (window.confirm(`정말로 사번 ${wId} 근로자를 영구 삭제하시겠습니까? 관련 데이터가 소멸합니다.`)) {
      try {
        await deleteWorker(id || wId);
      } catch (err: any) {
        alert(err.message || "삭제 도중 권한 오류가 발생했습니다.");
      }
    }
  };

  const filteredWorkers = workers.filter((w) => {
    const s = searchTerm.toLowerCase();
    const matchText =
      w.name.toLowerCase().includes(s) ||
      w.workerId.toLowerCase().includes(s) ||
      w.phone.includes(s) ||
      (w.department && w.department.toLowerCase().includes(s));
    
    if (typeFilter === "all") return matchText;
    return matchText && w.employmentType === typeFilter;
  });

  const departmentOptions = withCurrentOption(DEPARTMENT_OPTIONS, department);
  const dutyOptions = withCurrentOption(DUTY_OPTIONS, duty);

  return (
    <div id="worker-tab-container" className="space-y-4">
      
      {/* Search & Actions Header bar - High Density Layout */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-white p-3 sm:px-4 rounded-lg border border-slate-200 shadow-xs">
        <div className="flex flex-1 flex-col sm:flex-row gap-2">
          {/* Search Box */}
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-3 flex items-center text-slate-400">
              <Search className="w-3.5 h-3.5" />
            </span>
            <input
              type="text"
              placeholder="이름, 사번, 연락처, 부서 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 border border-slate-250 bg-white rounded text-xs focus:outline-none focus:border-blue-500 font-mono text-slate-800 focus:ring-1 focus:ring-blue-500 shadow-2xs"
            />
          </div>

          {/* Type dropdown */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-1.5 border border-slate-250 bg-white rounded text-xs text-slate-850 font-semibold focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            <option value="all">고용형태: 전체</option>
            <option value="salary">월급제 (Regular Salary)</option>
            <option value="hourly">시급제 (Hourly Pay)</option>
            <option value="daily">일용직 (Daily Unit Wage)</option>
            <option value="business">사업소득 3.3%</option>
          </select>
        </div>

        <button
          onClick={prepareOpenAdd}
          className="flex items-center justify-center gap-1.5 bg-slate-900 text-white px-4 py-1.5 rounded text-xs font-semibold hover:bg-slate-800 transition shadow-xs cursor-pointer"
        >
          <UserPlus className="w-3.5 h-3.5" />
          신규 근로자 등록
        </button>
      </div>

      {/* Directory Grid */}
      {filteredWorkers.length === 0 ? (
        <div className="text-center py-10 bg-white rounded-lg border border-dashed border-slate-200">
          <AlertCircle className="w-9 h-9 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-500 text-xs">일치하는 근로자 기록이 없습니다.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[80px_1fr_110px_130px_120px_110px_auto] gap-x-3 px-4 py-2 bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            <span>사번</span>
            <span>이름</span>
            <span>고용형태</span>
            <span>부서 / 직위</span>
            <span>연락처</span>
            <span>급여 단가</span>
            <span></span>
          </div>
          {filteredWorkers.map((w, idx) => (
            <div
              key={w.id || w.workerId}
              className={`grid grid-cols-[80px_1fr_110px_130px_120px_110px_auto] gap-x-3 px-4 py-3 items-center text-xs transition hover:bg-slate-50 ${idx !== 0 ? "border-t border-slate-100" : ""}`}
            >
              {/* 사번 */}
              <span className="font-mono text-[10px] text-slate-500 font-bold truncate">{w.workerId}</span>

              {/* 이름 */}
              <div className="min-w-0">
                <span className="font-semibold text-slate-900">{w.name}</span>
                {w.englishName && (
                  <span className="text-[11px] text-slate-400 ml-1">({w.englishName})</span>
                )}
                {(w.deductionSettings.housingFee > 0 || w.deductionSettings.cashAdvance > 0) && (
                  <span className="ml-1 inline-flex items-center gap-0.5 text-[9px] text-rose-600 font-bold">
                    <ShieldAlert className="w-2.5 h-2.5" />공제
                  </span>
                )}
              </div>

              {/* 고용형태 */}
              <div>
                {w.employmentType === "salary" && <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-blue-50 text-blue-700 border border-blue-100">월급제</span>}
                {w.employmentType === "hourly" && <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">시급제</span>}
                {w.employmentType === "daily" && <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-orange-50 text-orange-700 border border-orange-100">일용직</span>}
                {w.employmentType === "business" && <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-purple-50 text-purple-700 border border-purple-100">사업소득</span>}
              </div>

              {/* 부서 / 직위 */}
              <span className="text-slate-500 truncate">{w.department || "—"} / {w.duty || "—"}</span>

              {/* 연락처 */}
              <span className="font-mono text-slate-700 truncate">{w.phone}</span>

              {/* 급여 단가 */}
              <div className="font-mono text-[11px]">
                {w.employmentType === "salary" && <span className="text-blue-600 font-bold">₩{w.salarySettings.monthlyBase.toLocaleString()}<span className="text-slate-400 font-normal">/월</span></span>}
                {w.employmentType === "hourly" && <span className="text-emerald-600 font-bold">₩{w.salarySettings.hourlyRate.toLocaleString()}<span className="text-slate-400 font-normal">/H</span></span>}
                {(w.employmentType === "daily" || w.employmentType === "business") && <span className="text-orange-600 font-bold">₩{w.salarySettings.dailyRate.toLocaleString()}<span className="text-slate-400 font-normal">/D</span></span>}
              </div>

              {/* 액션 버튼 */}
              <div className="flex gap-1.5 justify-end">
                <button
                  onClick={() => handleEdit(w)}
                  className="flex items-center gap-1 text-[11px] px-2 py-1 font-semibold border border-slate-200 rounded text-slate-700 hover:bg-slate-100 transition cursor-pointer whitespace-nowrap"
                >
                  <Edit2 className="w-3 h-3" />수정
                </button>
                <button
                  onClick={() => handleDelete(w.id || w.workerId, w.workerId)}
                  className="flex items-center gap-1 text-[11px] px-2 py-1 font-bold text-rose-600 border border-rose-100 rounded bg-rose-50/20 hover:bg-rose-50 transition cursor-pointer whitespace-nowrap"
                >
                  <Trash2 className="w-3 h-3" />제외
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL & SIDE DRAWER DIALOG FOR CREATING / EDITING */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl border border-gray-100 max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-150 bg-gray-50 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {editingWorker ? `근로자 프로필 정보 수정 - ${workerId}` : "신규 근로자 채용 및 정식 등록"}
                </h3>
                <p className="text-xs text-gray-500 mt-1">사번 관리 및 개별 노무 임금 단가 체결</p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-full hover:bg-gray-200 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Error area */}
            {formError && (
              <div className="m-6 mb-0 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700 text-sm">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Modal Content Scroll Area */}
            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1 space-y-6">
              
              {/* SECTION A: 기본 인적 사항 */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-gray-900 border-b pb-1.5 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-gray-500" />
                  근로자 기본 인적사항 및 신원 검격 (Required)
                </h4>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">사원번호 (관리코드) *</label>
                    <input
                      type="text"
                      value={workerId}
                      onChange={(e) => setWorkerId(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-gray-50 font-mono focus:outline-none focus:ring-1 focus:ring-gray-300"
                      disabled={editingWorker !== null}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">이름 (한글 정식명) *</label>
                    <input
                      type="text"
                      placeholder="김철수"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">영문 표기 성명 (English name)</label>
                    <input
                      type="text"
                      placeholder="Chulsoo Kim"
                      value={englishName}
                      onChange={(e) => setEnglishName(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">국적 (Nationality)</label>
                    <input
                      type="text"
                      placeholder="대한민국 / 베트남 / 중국 등"
                      value={nationality}
                      onChange={(e) => setNationality(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">주민(외국인)등록번호 / 여권번호 *</label>
                    <input
                      type="text"
                      placeholder="881024-1234567"
                      value={residentNumber}
                      onChange={(e) => setResidentNumber(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-gray-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">휴대폰 연락처 *</label>
                    <input
                      type="text"
                      placeholder="010-1234-5678"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">현재 거주지 주소</label>
                  <input
                    type="text"
                    placeholder="도로명 주소 및 상세 호수 입력"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                  />
                </div>
              </div>

              {/* SECTION B: 고용 계약 조건 */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-gray-900 border-b pb-1.5 flex items-center gap-2">
                  <Building className="w-4 h-4 text-gray-500" />
                  근무 직무 및 정식 고용 계약 형태 (Employment Profile)
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">소속 부서/팀</label>
                    <select
                      value={department}
                      onChange={(e) => setDepartment(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-gray-300"
                    >
                      <option value="">부서/팀 선택</option>
                      {departmentOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">배정 직무 / 공종</label>
                    <select
                      value={duty}
                      onChange={(e) => setDuty(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-gray-300"
                    >
                      <option value="">직무 / 공종 선택</option>
                      {dutyOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">고용 계약 유형 *</label>
                    <select
                      value={employmentType}
                      onChange={(e) => setEmploymentType(e.target.value as any)}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-1 focus:ring-gray-300"
                    >
                      <option value="salary">월급제 (월 고정 급여 - 정직원)</option>
                      <option value="hourly">시급제 (산정 기간별 시급지출)</option>
                      <option value="daily">일용직 (현장투입 공수 일당제)</option>
                      <option value="business">사업소득자 (3.3% 원천징수 대상)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">최초 근로계약 체결일</label>
                    <input
                      type="date"
                      value={contractDate}
                      onChange={(e) => setContractDate(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">정식 현장 투입일(입사일) *</label>
                    <input
                      type="date"
                      value={joinDate}
                      onChange={(e) => setJoinDate(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">계약 퇴사 지정 승인일</label>
                    <input
                      type="date"
                      value={retireDate}
                      onChange={(e) => setRetireDate(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION C: 개별 단가 및 비과세수당 정보 (급여형태 마다 보이기/가리기) */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-gray-900 border-b pb-1.5 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-gray-500" />
                  개별 임금 계약 정보 및 수당 재정의 (Individual Wage Settings)
                </h4>

                {employmentType === "salary" && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-blue-700 mb-1">정기 월 약정 기본급 (KRW) *</label>
                      <input
                        type="number"
                        placeholder="Monthly base salary"
                        value={monthlyBase}
                        onChange={(e) => setMonthlyBase(e.target.value)}
                        className="w-full px-3 py-1.5 border border-blue-200 bg-blue-50/10 rounded-lg font-mono text-sm focus:outline-none focus:ring-1 focus:ring-blue-300"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-blue-700 mb-1">잔업수당 기준 시급 (KRW) *</label>
                      <input
                        type="number"
                        placeholder="Overtime hourly basis"
                        value={hourlyRate}
                        onChange={(e) => setHourlyRate(e.target.value)}
                        className="w-full px-3 py-1.5 border border-blue-200 bg-blue-50/10 rounded-lg font-mono text-sm focus:outline-none focus:ring-1 focus:ring-blue-300"
                      />
                    </div>
                  </div>
                )}

                {employmentType === "hourly" && (
                  <div>
                    <label className="block text-xs font-semibold text-green-700 mb-1">체결 기본 시간급 (Hourly Wage, KRW) *</label>
                    <input
                      type="number"
                      placeholder="Contracted hourly rate"
                      value={hourlyRate}
                      onChange={(e) => setHourlyRate(e.target.value)}
                      className="w-full md:w-1/2 px-3 py-1.5 border border-green-200 bg-green-50/10 rounded-lg font-mono text-sm focus:outline-none focus:ring-1 focus:ring-green-400"
                    />
                  </div>
                )}

                {(employmentType === "daily" || employmentType === "business") && (
                  <div>
                    <label className="block text-xs font-semibold text-orange-700 mb-1">체결 기본 1일 일당 단가 (Daily Rate, KRW) *</label>
                    <input
                      type="number"
                      placeholder="Contracted daily worker wage rate"
                      value={dailyRate}
                      onChange={(e) => setDailyRate(e.target.value)}
                      className="w-full md:w-1/2 px-3 py-1.5 border border-orange-200 bg-orange-50/10 rounded-lg font-mono text-sm focus:outline-none focus:ring-1 focus:ring-orange-400"
                    />
                  </div>
                )}

                {/* Allowances overriders */}
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-150">
                  <p className="text-xs font-medium text-gray-500 mb-2">
                    비소득성 복리후생 보조 수당 (공유 설정 상속을 원하지 않을 시 개별 입력. 비워두면 회사 기본 설정 적용)
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">식대 (Meal Allowance)</label>
                      <input
                        type="number"
                        placeholder="회사 기본값 상속"
                        value={mealOverride}
                        onChange={(e) => setMealOverride(e.target.value)}
                        className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">자가운전보조금 (Transport)</label>
                      <input
                        type="number"
                        placeholder="회사 기본값 상속"
                        value={transportOverride}
                        onChange={(e) => setTransportOverride(e.target.value)}
                        className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">통신비 (Phone)</label>
                      <input
                        type="number"
                        placeholder="회사 기본값 상속"
                        value={phoneOverride}
                        onChange={(e) => setPhoneOverride(e.target.value)}
                        className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION D: 매월 고정 공제 설정 */}
              <div className="space-y-4 font-sans">
                <h4 className="text-sm font-semibold text-gray-900 border-b pb-1.5 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-gray-500" />
                  월별 정기 공제 내역 (주거 지원비, 가불 선금 등)
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">현장 숙소료 공제액 (월 고정 차감액, KRW)</label>
                    <input
                      type="number"
                      placeholder="기숙사 또는 숙소 거주 시 입력"
                      value={housingFee}
                      onChange={(e) => setHousingFee(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">기본 월 상환 선 가불금 (KRW)</label>
                    <input
                      type="number"
                      placeholder="매달 상시 공제할 선지급금"
                      value={cashAdvance}
                      onChange={(e) => setCashAdvance(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono"
                    />
                  </div>
                </div>

                {/* Custom deductions */}
                <div className="bg-red-50/10 p-4 rounded-xl border border-red-100">
                  <p className="text-xs font-medium text-gray-600 mb-2">기타 추가 공제 항목 개별 추가 (공과금 분담, 연수금 등)</p>
                  
                  <div className="flex gap-2 mb-3">
                    <input
                      type="text"
                      placeholder="항목명 (예: 가스 관리비)"
                      value={newDeductionName}
                      onChange={(e) => setNewDeductionName(e.target.value)}
                      className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white"
                    />
                    <input
                      type="number"
                      placeholder="차감 액수 (KRW)"
                      value={newDeductionAmount}
                      onChange={(e) => setNewDeductionAmount(e.target.value)}
                      className="w-40 px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white font-mono"
                    />
                    <button
                      type="button"
                      onClick={addCustomDeduction}
                      className="bg-gray-800 text-white text-xs px-4 py-1.5 rounded-lg font-medium hover:bg-gray-700"
                    >
                      추가
                    </button>
                  </div>

                  {customDeductions.length > 0 && (
                    <div className="space-y-1 bg-white p-2.5 rounded-lg border border-gray-200">
                      {customDeductions.map((d, idx) => (
                        <div key={idx} className="flex justify-between items-center text-xs text-gray-700 font-mono">
                          <span>{d.name} : ₩{d.amount.toLocaleString()}</span>
                          <button
                            type="button"
                            onClick={() => removeCustomDeduction(idx)}
                            className="text-red-500 hover:text-red-700 font-bold"
                          >
                            지우기
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* SECTION E: 수수 계좌 정보 */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-gray-900 border-b pb-1.5 flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-gray-500" />
                  실 수령 급여 지출 이체 계좌 정보 (Bank Account Settings)
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">송금 은행(금융기관명)</label>
                    <select
                      value={bankName}
                      onChange={(e) => setBankName(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm bg-white"
                    >
                      <option value="신한은행">신한은행</option>
                      <option value="국민은행">국민은행</option>
                      <option value="우리은행">우리은행</option>
                      <option value="하나은행">하나은행</option>
                      <option value="기업은행">기업은행</option>
                      <option value="농협은행">NH농협은행</option>
                      <option value="토스뱅크">토스뱅크</option>
                      <option value="카카오뱅크">카카오뱅크</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">계좌 번호 (실제 이체용) *</label>
                    <input
                      type="text"
                      placeholder="110-334-2212345"
                      value={accountNo}
                      onChange={(e) => setAccountNo(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-1 focus:ring-gray-300"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">예금주 성명</label>
                    <input
                      type="text"
                      placeholder="예금주 (미기입 시 근로자 성명)"
                      value={holder}
                      onChange={(e) => setHolder(e.target.value)}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-gray-300"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION F: 앱 계정 연동 설정 */}
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-gray-900 border-b pb-1.5 flex items-center gap-2">
                  <Phone className="w-4 h-4 text-gray-500" />
                  소속 근로자 현장용 모바일 앱 연동 로그인 계정 정보
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">로그인 ID *</label>
                    <input
                      type="text"
                      placeholder="예: 01034212615"
                      value={loginId}
                      onChange={(e) => setLoginId(e.target.value.replace(/-/g, ""))}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none"
                      required
                    />
                    <span className="text-[10px] text-gray-400">하이픈(-) 없이 입력. 예: 01034212615</span>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">
                      초기 비밀번호 {editingWorker ? "(수정 시 변경되지 않음)" : "(비워두면 전화번호)"}
                    </label>
                    <input
                      type="text"
                      value={initialPassword}
                      onChange={(e) => setInitialPassword(e.target.value)}
                      placeholder={editingWorker ? "" : "비워두면 전화번호 숫자를 사용"}
                      disabled={editingWorker !== null}
                      className="w-full px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-mono focus:outline-none disabled:bg-gray-50 disabled:text-gray-400"
                    />
                    {!editingWorker && (
                      <span className="text-[10px] text-gray-400">
                        근로자에게 별도로 알려주세요 (등록 후 한 번만 표시).
                      </span>
                    )}
                  </div>
                </div>
              </div>

            </form>

            {/* Modal Bottom control buttons */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex flex-wrap justify-between items-center gap-3">
              {editingWorker ? (
                <button
                  type="button"
                  onClick={handleResetPassword}
                  className="flex items-center gap-1.5 px-3 py-2 border border-amber-300 bg-amber-50 text-amber-800 rounded-lg text-xs font-bold hover:bg-amber-100"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  비밀번호 재발급
                </button>
              ) : <span />}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-100 font-medium"
                >
                  닫기 / 취소
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="px-6 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-800 shadow"
                >
                  {editingWorker ? "임금계약 수정 완료" : "근로자 정식 임용 등록"}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {credentialsModal && (
        <CredentialsModal
          title={credentialsModal.title}
          worker={credentialsModal.worker}
          creds={credentialsModal.creds}
          onClose={() => setCredentialsModal(null)}
        />
      )}
    </div>
  );
};

// ============================================================
// 자격증명 표시 모달 — 한 번만 보여주고 닫히면 다시 못 봄
// ============================================================
const CredentialsModal: React.FC<{
  title: string;
  worker: { name: string; workerId: string };
  creds: WorkerCredentials;
  onClose: () => void;
}> = ({ title, worker, creds, onClose }) => {
  const [copied, setCopied] = useState<"id" | "pw" | null>(null);
  const loginId = creds.email.split("@")[0];

  const copy = async (text: string, key: "id" | "pw") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // ignore
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 max-w-md w-full overflow-hidden">
        <div className="px-6 py-4 bg-emerald-600 text-white">
          <h3 className="text-base font-bold flex items-center gap-2">
            <KeyRound className="w-4 h-4" />
            {title}
          </h3>
          <p className="text-[11px] text-emerald-100 mt-1">
            {worker.name} (사번 {worker.workerId})
          </p>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-[11px] text-amber-900 leading-relaxed">
            <strong>⚠️ 이 비밀번호는 지금 한 번만 표시됩니다.</strong><br />
            창을 닫으면 다시 확인할 수 없으니, 근로자에게 즉시 전달하거나 안전하게 기록해주세요.
          </div>

          <div>
            <p className="text-[10px] text-gray-500 font-semibold mb-1">로그인 ID (전화번호)</p>
            <div className="flex gap-2">
              <input
                readOnly
                value={loginId}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono bg-gray-50"
              />
              <button
                onClick={() => copy(loginId, "id")}
                className="px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold hover:bg-gray-50 flex items-center gap-1"
              >
                {copied === "id" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          <div>
            <p className="text-[10px] text-gray-500 font-semibold mb-1">
              비밀번호 {creds.passwordGenerated && <span className="text-blue-600">(자동 생성됨)</span>}
            </p>
            <div className="flex gap-2">
              <input
                readOnly
                value={creds.password}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono bg-gray-50"
              />
              <button
                onClick={() => copy(creds.password, "pw")}
                className="px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold hover:bg-gray-50 flex items-center gap-1"
              >
                {copied === "pw" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-gray-900 text-white rounded-lg text-sm font-semibold hover:bg-gray-800"
          >
            확인 (창 닫기)
          </button>
        </div>
      </div>
    </div>
  );
};
