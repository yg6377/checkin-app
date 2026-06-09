import React, { useEffect, useMemo, useState } from "react";
import { useApp, AttendanceRecord, AttendanceBreakdownValues } from "../context/SupabaseContext";
import {
  CalendarRange,
  Users,
  Filter,
  Clock,
  LogIn,
  LogOut,
  AlertCircle,
  Loader2,
  Briefcase,
  TrendingUp,
  FileSpreadsheet,
  Download,
  Pencil,
  Plus,
  Trash2,
  X,
  ChevronDown,
  ChevronRight,
  Save,
  CheckCircle2,
} from "lucide-react";
import { exportLaborLedger, exportAttendanceBook, exportPayslips } from "../utils/excelExporter";
import { calculateDailyBreakdown, getDayType, isHolidayDate } from "../utils/attendanceHours";
import { formatZonedTime, getAppTimeZone, getZonedYmd, zonedWallTimeToUtcIso } from "../utils/datetime";

// ============================================================
// 날짜 헬퍼
// ============================================================
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtHours(h: number): string {
  if (h <= 0) return "-";
  const hours = Math.floor(h);
  const minutes = Math.round((h - hours) * 60);
  return `${hours}시간 ${minutes}분`;
}

function fmtShortHours(h: number): string {
  if (h <= 0) return "-";
  return `${Number.isInteger(h) ? h.toFixed(0) : h.toFixed(1)}h`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

type Preset = "today" | "thisMonth" | "lastMonth" | "last7" | "custom";

// ============================================================
// AttendanceTab
// ============================================================
export const AttendanceTab: React.FC = () => {
  const { workers, fetchAttendance, settings, holidays, role, upsertAttendanceByAdmin, deleteAttendanceByAdmin, confirmAttendanceBreakdown } = useApp();
  const [exporting, setExporting] = useState<"" | "ledger" | "book" | "payslip">("");
  const [exportError, setExportError] = useState("");

  const tz = getAppTimeZone(settings);
  // 설정 타임존 기준 "오늘" (미체크/필터 판정용)
  const todayYmd = useMemo(() => getZonedYmd(new Date(), tz), [tz]);
  const [preset, setPreset] = useState<Preset>("today");
  const [fromDate, setFromDate] = useState<string>(todayYmd);
  const [toDate, setToDate] = useState<string>(todayYmd);
  const [workerId, setWorkerId] = useState<string>("all");

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDrafts, setConfirmDrafts] = useState<Record<string, AttendanceBreakdownValues>>({});
  const [confirmSavingId, setConfirmSavingId] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<Record<string, string>>({});

  // workers.id → Worker (근태 레코드의 workerId와 매칭해 고용 유형 판별)
  const workerById = useMemo(() => {
    const map = new Map<string, (typeof workers)[number]>();
    workers.forEach((w) => {
      if (w.id) map.set(w.id, w);
    });
    return map;
  }, [workers]);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState("");
  const [manualWorkerId, setManualWorkerId] = useState("");
  const [manualWorkDate, setManualWorkDate] = useState(todayYmd);
  const [manualCheckIn, setManualCheckIn] = useState("");
  const [manualCheckOut, setManualCheckOut] = useState("");
  const [manualNote, setManualNote] = useState("관리자 수동 입력");

  // 급여명세서 발급 대상 선택 모달
  const [payslipPickerOpen, setPayslipPickerOpen] = useState(false);
  const [payslipSelected, setPayslipSelected] = useState<Set<string>>(new Set());
  const activeWorkers = useMemo(() => workers.filter((w) => !w.retireDate), [workers]);
  const manualWorkerOptions = useMemo(() => {
    if (!manualWorkerId || activeWorkers.some((w) => w.id === manualWorkerId)) return activeWorkers;
    const selected = workers.find((w) => w.id === manualWorkerId);
    return selected ? [selected, ...activeWorkers] : activeWorkers;
  }, [activeWorkers, manualWorkerId, workers]);

  // preset 변경 시 날짜 자동 세팅
  useEffect(() => {
    const now = new Date();
    if (preset === "today") {
      setFromDate(ymd(now));
      setToDate(ymd(now));
    } else if (preset === "thisMonth") {
      setFromDate(ymd(startOfMonth(now)));
      setToDate(ymd(endOfMonth(now)));
    } else if (preset === "lastMonth") {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      setFromDate(ymd(startOfMonth(prev)));
      setToDate(ymd(endOfMonth(prev)));
    } else if (preset === "last7") {
      const from = new Date(now);
      from.setDate(now.getDate() - 6);
      setFromDate(ymd(from));
      setToDate(ymd(now));
    }
  }, [preset]);

  const runQuery = async () => {
    setLoading(true);
    setError("");
    try {
      const result = await fetchAttendance({
        fromDate,
        toDate,
        workerId: workerId === "all" ? undefined : workerId,
      });
      setRecords(result);
    } catch (e: any) {
      setError(e?.message || "조회 중 오류가 발생했습니다.");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  };

  // 마운트 시 자동 조회
  useEffect(() => {
    runQuery();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 집계
  const summary = useMemo(() => {
    const totalDays = records.filter((r) => r.checkInAt).length;
    const totalHours = records.reduce((sum, r) => sum + r.workHours, 0);
    const missingCheckout = records.filter(
      (r) => r.checkInAt && !r.checkOutAt && r.workDate < todayYmd
    ).length;
    const uniqueWorkers = new Set(records.map((r) => r.workerId)).size;
    return { totalDays, totalHours, missingCheckout, uniqueWorkers };
  }, [records, todayYmd]);

  const isMissingCheckout = (r: AttendanceRecord) =>
    r.checkInAt && !r.checkOutAt && r.workDate < todayYmd;

  const getRecordBreakdown = (r: AttendanceRecord) => {
    const worker = workerById.get(r.workerId);
    if (!worker || !r.checkInAt || !r.checkOutAt) return null;

    const holiday = isHolidayDate(r.workDate, holidays);
    const breakdown = calculateDailyBreakdown(
      r.checkInAt,
      r.checkOutAt,
      getDayType(r.workDate, holidays),
      worker.employmentType,
      settings
    );
    const isManDay = worker.employmentType === "daily" || worker.employmentType === "business";

    return { worker, holiday, breakdown, isManDay };
  };

  const getAutoConfirmValues = (r: AttendanceRecord): AttendanceBreakdownValues => {
    const detail = getRecordBreakdown(r);
    const bd = detail?.breakdown;
    return {
      regularHours: bd?.regularHours || 0,
      overtimeHours: bd?.overtimeHours || 0,
      holidayHours: bd?.holidayHours || 0,
      holidayOvertimeHours: bd?.holidayOvertimeHours || 0,
      nightHours: bd?.nightHours || 0,
      manDays: bd?.manDays || 0,
    };
  };

  const getEffectiveConfirmValues = (r: AttendanceRecord): AttendanceBreakdownValues => {
    return r.confirmedBreakdown || getAutoConfirmValues(r);
  };

  const effectiveWorkHours = (r: AttendanceRecord, values: AttendanceBreakdownValues): number => {
    if (!r.confirmedBreakdown) return getRecordBreakdown(r)?.breakdown.workHours || r.workHours;
    return values.regularHours + values.overtimeHours + values.holidayHours + values.holidayOvertimeHours;
  };

  const updateConfirmDraft = (recordId: string, key: keyof AttendanceBreakdownValues, value: string) => {
    const parsed = Math.max(0, Number(value) || 0);
    setConfirmDrafts((prev) => ({
      ...prev,
      [recordId]: {
        ...(prev[recordId] || getEffectiveConfirmValues(records.find((r) => r.id === recordId)!)),
        [key]: parsed,
      },
    }));
  };

  const resetConfirmDraftToAuto = (record: AttendanceRecord) => {
    setConfirmDrafts((prev) => ({ ...prev, [record.id]: getAutoConfirmValues(record) }));
    setConfirmError((prev) => ({ ...prev, [record.id]: "" }));
  };

  const saveConfirmedBreakdown = async (record: AttendanceRecord) => {
    const draft = confirmDrafts[record.id] || getEffectiveConfirmValues(record);
    setConfirmSavingId(record.id);
    setConfirmError((prev) => ({ ...prev, [record.id]: "" }));
    try {
      await confirmAttendanceBreakdown(record, draft);
      setConfirmDrafts((prev) => {
        const next = { ...prev };
        delete next[record.id];
        return next;
      });
      await runQuery();
    } catch (err: any) {
      setConfirmError((prev) => ({
        ...prev,
        [record.id]: err?.message || "근태 정산 확정 저장 중 오류가 발생했습니다.",
      }));
    } finally {
      setConfirmSavingId(null);
    }
  };

  // 펼침 영역: 고용 유형에 따라 시간 분해(월급/시급) 또는 공수(일용/사업소득자) 표시
  const renderBreakdown = (r: AttendanceRecord) => {
    const worker = workerById.get(r.workerId);
    if (!worker) {
      return (
        <div className="text-[11px] text-slate-400">
          근로자 정보를 찾을 수 없어 상세 분해를 표시할 수 없습니다.
        </div>
      );
    }
    if (!r.checkInAt || !r.checkOutAt) {
      return (
        <div className="text-[11px] text-slate-400">
          출근/퇴근이 모두 기록된 경우에만 상세 분해를 계산합니다.
        </div>
      );
    }

    const detail = getRecordBreakdown(r);
    if (!detail) return null;
    const { breakdown: bd, holiday, isManDay } = detail;
    const effective = getEffectiveConfirmValues(r);
    const draft = confirmDrafts[r.id] || effective;
    const isConfirmed = Boolean(r.confirmedBreakdown);
    const savedAt = r.confirmedAt ? formatZonedTime(r.confirmedAt, tz) : "";
    const saveError = confirmError[r.id];

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold text-slate-600">자동 산정 참고값</span>
            {holiday && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-bold border border-amber-200">
                휴일
              </span>
            )}
            {isManDay && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-bold border border-blue-200">
                공수 정산 대상
              </span>
            )}
          </div>
          {isConfirmed && (
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold border border-emerald-200">
              <CheckCircle2 className="w-3 h-3" />
              확정됨{savedAt ? ` · ${savedAt}` : ""}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <BreakdownCell label="근무" value={fmtHours(bd.workHours)} strong />
          <BreakdownCell label="기본" value={fmtHours(bd.regularHours)} />
          <BreakdownCell label="연장" value={fmtHours(bd.overtimeHours)} />
          <BreakdownCell label="휴일" value={fmtHours(bd.holidayHours)} />
          <BreakdownCell label="휴일연장" value={fmtHours(bd.holidayOvertimeHours)} />
          <BreakdownCell label={isManDay ? "공수" : "야간"} value={isManDay ? `${bd.manDays.toFixed(2)} 공수` : fmtHours(bd.nightHours)} />
        </div>

        {role === "admin" ? (
          <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-extrabold text-slate-900">관리자 정산 확정</p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  저장된 확정값은 급여명세서와 엑셀 산정에서 자동값보다 우선 적용됩니다.
                </p>
              </div>
              <button
                type="button"
                onClick={() => resetConfirmDraftToAuto(r)}
                className="px-2 py-1 rounded border border-slate-200 bg-slate-50 text-[10px] font-semibold text-slate-600 hover:bg-slate-100"
              >
                자동값 불러오기
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
              <ConfirmNumberInput
                label="기본"
                suffix="h"
                value={draft.regularHours}
                onChange={(v) => updateConfirmDraft(r.id, "regularHours", v)}
              />
              <ConfirmNumberInput
                label="연장"
                suffix="h"
                value={draft.overtimeHours}
                onChange={(v) => updateConfirmDraft(r.id, "overtimeHours", v)}
              />
              <ConfirmNumberInput
                label="야간"
                suffix="h"
                value={draft.nightHours}
                onChange={(v) => updateConfirmDraft(r.id, "nightHours", v)}
              />
              <ConfirmNumberInput
                label="휴일"
                suffix="h"
                value={draft.holidayHours}
                onChange={(v) => updateConfirmDraft(r.id, "holidayHours", v)}
              />
              <ConfirmNumberInput
                label="휴일연장"
                suffix="h"
                value={draft.holidayOvertimeHours}
                onChange={(v) => updateConfirmDraft(r.id, "holidayOvertimeHours", v)}
              />
              <ConfirmNumberInput
                label="공수"
                suffix="공수"
                value={draft.manDays}
                step="0.25"
                onChange={(v) => updateConfirmDraft(r.id, "manDays", v)}
              />
            </div>

            {saveError && (
              <div className="p-2 bg-rose-50 border border-rose-200 rounded text-[11px] text-rose-700 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                {saveError}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void saveConfirmedBreakdown(r)}
                disabled={confirmSavingId === r.id}
                className="px-3 py-1.5 text-xs font-bold rounded bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1.5"
              >
                {confirmSavingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                정산값 확정 저장
              </button>
            </div>
          </div>
        ) : isConfirmed ? (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            <BreakdownCell label="확정 기본" value={fmtHours(effective.regularHours)} />
            <BreakdownCell label="확정 연장" value={fmtHours(effective.overtimeHours)} />
            <BreakdownCell label="확정 야간" value={fmtHours(effective.nightHours)} />
            <BreakdownCell label="확정 휴일" value={fmtHours(effective.holidayHours)} />
            <BreakdownCell label="확정 휴일연장" value={fmtHours(effective.holidayOvertimeHours)} />
            <BreakdownCell label="확정 공수" value={effective.manDays > 0 ? `${effective.manDays.toFixed(2)} 공수` : "-"} />
          </div>
        ) : null}
      </div>
    );
  };

  const openManualModal = (record?: AttendanceRecord) => {
    setManualError("");
    if (record) {
      setManualWorkerId(record.workerId);
      setManualWorkDate(record.workDate);
      setManualCheckIn(record.checkInAt ? formatZonedTime(record.checkInAt, tz, "") : "");
      setManualCheckOut(record.checkOutAt ? formatZonedTime(record.checkOutAt, tz, "") : "");
      setManualNote("관리자 수동 수정");
    } else {
      const selectedWorker = workers.find((w) => w.id === workerId);
      setManualWorkerId(selectedWorker && !selectedWorker.retireDate ? workerId : activeWorkers[0]?.id || "");
      setManualWorkDate(fromDate);
      setManualCheckIn("");
      setManualCheckOut("");
      setManualNote("관리자 수동 입력");
    }
    setManualModalOpen(true);
  };

  const closeManualModal = () => {
    if (manualSaving) return;
    setManualModalOpen(false);
  };

  const handleManualSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualError("");

    if (!manualWorkerId) {
      setManualError("근로자를 선택해주십시오.");
      return;
    }
    if (!manualCheckIn && !manualCheckOut) {
      setManualError("출근 또는 퇴근 시각 중 하나는 입력해주십시오.");
      return;
    }
    if (manualCheckOut && !manualCheckIn) {
      setManualError("퇴근 시각만 단독으로 저장할 수 없습니다.");
      return;
    }
    if (manualCheckIn && manualCheckOut && manualCheckOut <= manualCheckIn) {
      setManualError("퇴근 시각은 출근 시각보다 늦어야 합니다.");
      return;
    }

    setManualSaving(true);
    try {
      await upsertAttendanceByAdmin({
        workerId: manualWorkerId,
        workDate: manualWorkDate,
        checkInAt: manualCheckIn ? zonedWallTimeToUtcIso(manualWorkDate, manualCheckIn, tz) : null,
        checkOutAt: manualCheckOut ? zonedWallTimeToUtcIso(manualWorkDate, manualCheckOut, tz) : null,
        note: manualNote.trim() || "관리자 수동 입력",
      });
      await runQuery();
      setManualModalOpen(false);
    } catch (err: any) {
      setManualError(err?.message || "수동 출퇴근 저장 중 오류가 발생했습니다.");
    } finally {
      setManualSaving(false);
    }
  };

  const handleDeleteRecord = async (record: AttendanceRecord) => {
    if (!window.confirm(`${record.workDate} ${record.workerName || record.workerCode} 근태 기록을 삭제할까요?\n삭제 후에는 복구할 수 없습니다.`)) {
      return;
    }

    setLoading(true);
    setError("");
    try {
      await deleteAttendanceByAdmin(record);
      await runQuery();
    } catch (err: any) {
      setError(err?.message || "근태 기록 삭제 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  // ── 엑셀 내보내기 ────────────────────────────────────────
  const runExport = async (kind: "ledger" | "book" | "payslip", workerSubset?: typeof workers) => {
    if (!settings) {
      setExportError("설정값을 불러오는 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    setExporting(kind);
    setExportError("");
    try {
      // 조회 기간의 시작일 기준 연/월 추출 (한 달 단위 export)
      const [yStr, mStr] = fromDate.split("-");
      const year = parseInt(yStr, 10);
      const month = parseInt(mStr, 10);

      // 해당 월 전체 데이터로 다시 조회 (필터 무관, 근로자 전체)
      const monthFrom = `${yStr}-${mStr}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const monthTo = `${yStr}-${mStr}-${String(lastDay).padStart(2, "0")}`;
      const monthRecords = await fetchAttendance({ fromDate: monthFrom, toDate: monthTo });

      const ctx = {
        year,
        month,
        workers: workerSubset && workerSubset.length > 0 ? workerSubset : workers,
        records: monthRecords,
        holidays,
        settings,
        companyName: settings.site.companyName,
      };

      if (kind === "ledger") {
        await exportLaborLedger(ctx);
      } else if (kind === "book") {
        await exportAttendanceBook(ctx);
      } else {
        await exportPayslips(ctx);
      }
    } catch (e: any) {
      console.error(e);
      setExportError(e?.message || "엑셀 생성 중 오류가 발생했습니다.");
    } finally {
      setExporting("");
    }
  };

  const openPayslipPicker = () => {
    setPayslipSelected(new Set(workers.map((w) => w.id!).filter(Boolean)));
    setExportError("");
    setPayslipPickerOpen(true);
  };

  const togglePayslipWorker = (id: string) => {
    setPayslipSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmPayslipExport = async () => {
    const subset = workers.filter((w) => w.id && payslipSelected.has(w.id));
    if (subset.length === 0) {
      setExportError("발급할 근로자를 1명 이상 선택해주세요.");
      return;
    }
    setPayslipPickerOpen(false);
    await runExport("payslip", subset);
  };

  return (
    <div className="min-w-0 space-y-4">
      {/* 필터 바 */}
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <Filter className="w-3.5 h-3.5 text-slate-500" />
          조회 조건
        </div>

        {/* 프리셋 */}
        <div className="flex flex-wrap gap-1.5">
          {([
            ["today", "오늘"],
            ["thisMonth", "이번 달"],
            ["lastMonth", "지난 달"],
            ["last7", "최근 7일"],
            ["custom", "사용자 지정"],
          ] as [Preset, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setPreset(key)}
              className={`px-3 py-1.5 text-xs font-semibold rounded border ${
                preset === key
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1 flex items-center gap-1">
              <CalendarRange className="w-3 h-3" /> 시작일
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => {
                setFromDate(e.target.value);
                setPreset("custom");
              }}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1 flex items-center gap-1">
              <CalendarRange className="w-3 h-3" /> 종료일
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => {
                setToDate(e.target.value);
                setPreset("custom");
              }}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 mb-1 flex items-center gap-1">
              <Users className="w-3 h-3" /> 근로자
            </label>
            <select
              value={workerId}
              onChange={(e) => setWorkerId(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-slate-200 rounded text-xs bg-white cursor-pointer"
            >
              <option value="all">전체 근로자</option>
              {workers.map((w) => (
                <option key={w.id} value={w.id}>
                  [{w.workerId}] {w.name}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={runQuery}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white text-xs font-bold rounded hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Filter className="w-3.5 h-3.5" />}
            조회
          </button>
        </div>
      </div>

      {/* 엑셀 내보내기 */}
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            엑셀 내보내기
            <span className="text-[10px] font-normal text-slate-500 font-mono">
              · 시작일({fromDate})의 월 기준
            </span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {role === "admin" && (
              <button
                onClick={() => openManualModal()}
                className="px-3 py-1.5 text-xs font-semibold rounded border border-blue-200 bg-blue-50 text-blue-800 hover:bg-blue-100 flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                관리자 수동 출퇴근 입력
              </button>
            )}
            <button
              onClick={() => runExport("ledger")}
              disabled={exporting !== "" || !settings}
              className="px-3 py-1.5 text-xs font-semibold rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 flex items-center gap-1.5"
            >
              {exporting === "ledger" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              노무대장 (통합)
            </button>
            <button
              onClick={() => runExport("book")}
              disabled={exporting !== "" || !settings}
              className="px-3 py-1.5 text-xs font-semibold rounded border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 flex items-center gap-1.5"
            >
              {exporting === "book" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              출퇴근명부
            </button>
            <button
              onClick={openPayslipPicker}
              disabled={exporting !== "" || !settings}
              className="px-3 py-1.5 text-xs font-semibold rounded border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 disabled:opacity-50 flex items-center gap-1.5"
            >
              {exporting === "payslip" ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              급여명세서
            </button>
          </div>
        </div>
        {exportError && (
          <div className="mt-2 p-2 bg-rose-50 border border-rose-200 rounded text-[11px] text-rose-700 flex items-center gap-1.5">
            <AlertCircle className="w-3 h-3" /> {exportError}
          </div>
        )}
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          icon={<Briefcase className="w-4 h-4" />}
          label="조회 인원"
          value={`${summary.uniqueWorkers} 명`}
          tone="slate"
        />
        <SummaryCard
          icon={<LogIn className="w-4 h-4" />}
          label="출근 일수"
          value={`${summary.totalDays} 일`}
          tone="emerald"
        />
        <SummaryCard
          icon={<Clock className="w-4 h-4" />}
          label="총 근무시간"
          value={fmtHours(summary.totalHours)}
          tone="blue"
        />
        <SummaryCard
          icon={<AlertCircle className="w-4 h-4" />}
          label="퇴근 미체크"
          value={`${summary.missingCheckout} 건`}
          tone={summary.missingCheckout > 0 ? "rose" : "slate"}
        />
      </div>

      {/* 에러 */}
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* 모바일 카드 목록 (sm 미만) */}
      <div className="sm:hidden space-y-2.5">
        {loading ? (
          <div className="bg-white rounded-lg border border-slate-200 py-10 text-center text-slate-400 text-xs">
            <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
            조회 중...
          </div>
        ) : records.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 py-10 text-center text-slate-400 text-xs">
            조회 결과가 없습니다.
          </div>
        ) : (
          records.map((r) => {
            const detail = getRecordBreakdown(r);
            const bd = detail?.breakdown;
            const effective = getEffectiveConfirmValues(r);
            const isConfirmed = Boolean(r.confirmedBreakdown);
            const displayWorkHours = effectiveWorkHours(r, effective);
            return (
              <div
                key={r.id}
                className={`bg-white rounded-lg border shadow-xs overflow-hidden ${
                  isMissingCheckout(r) ? "border-rose-200" : "border-slate-200"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setExpandedId((prev) => (prev === r.id ? null : r.id))}
                  className="w-full text-left p-3.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-mono text-xs font-bold text-slate-800">{r.workDate}</div>
                      <div className="mt-0.5 truncate">
                        <span className="font-mono text-[10px] text-slate-400">{r.workerCode}</span>{" "}
                        <span className="font-semibold text-slate-800 text-sm">{r.workerName}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isMissingCheckout(r) ? (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-rose-100 text-rose-700 font-bold border border-rose-200">
                          퇴근 누락
                        </span>
                      ) : r.checkInAt && r.checkOutAt ? (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold border border-emerald-200">
                          정상
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold border border-slate-200">
                          {r.status === "absent" ? "결근" : "근무 중"}
                        </span>
                      )}
                      {expandedId === r.id ? (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </div>

                  <div className="mt-2.5 flex items-center gap-3 text-xs font-mono">
                    <span className="inline-flex items-center gap-1 text-emerald-700">
                      <LogIn className="w-3 h-3" />
                      {formatZonedTime(r.checkInAt, tz)}
                    </span>
                    <span className={`inline-flex items-center gap-1 ${r.checkOutAt ? "text-rose-700" : "text-slate-300"}`}>
                      <LogOut className="w-3 h-3" />
                      {formatZonedTime(r.checkOutAt, tz)}
                    </span>
                  </div>

                  <div className="mt-2.5 grid grid-cols-4 gap-1.5 text-center">
                    {[
                      { label: "근무", value: displayWorkHours > 0 ? fmtShortHours(displayWorkHours) : bd ? fmtShortHours(bd.workHours) : r.workHours > 0 ? fmtShortHours(r.workHours) : "-" },
                      { label: "연장", value: isConfirmed ? fmtShortHours(effective.overtimeHours) : bd ? fmtShortHours(bd.overtimeHours) : "-" },
                      { label: "야간", value: isConfirmed ? fmtShortHours(effective.nightHours) : bd ? fmtShortHours(bd.nightHours) : "-" },
                      { label: "공수", value: effective.manDays > 0 ? effective.manDays.toFixed(2) : detail?.isManDay && bd && bd.manDays > 0 ? bd.manDays.toFixed(2) : "-" },
                    ].map((cell) => (
                      <div key={cell.label} className="rounded border border-slate-150 bg-slate-50 px-1 py-1.5">
                        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{cell.label}</div>
                        <div className="mt-0.5 font-mono text-[11px] font-bold text-slate-800">{cell.value}</div>
                      </div>
                    ))}
                  </div>
                </button>

                {role === "admin" && (
                  <div className="flex gap-2 px-3.5 pb-3">
                    <button
                      onClick={() => openManualModal(r)}
                      className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-2 text-[11px] font-semibold rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    >
                      <Pencil className="w-3 h-3" />
                      수정
                    </button>
                    <button
                      onClick={() => void handleDeleteRecord(r)}
                      className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-2 text-[11px] font-semibold rounded border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                    >
                      <Trash2 className="w-3 h-3" />
                      삭제
                    </button>
                  </div>
                )}

                {expandedId === r.id && (
                  <div className="border-t border-slate-200 bg-slate-50 px-3.5 py-3">
                    {renderBreakdown(r)}
                  </div>
                )}
              </div>
            );
          })
        )}
        <div className="px-1 pt-0.5 text-[10px] text-slate-500 font-mono flex items-center gap-2">
          <TrendingUp className="w-3 h-3" />
          {fromDate} ~ {toDate} · 총 {records.length} 건
        </div>
      </div>

      {/* 테이블 (sm 이상) */}
      <div className="hidden sm:block min-w-0 bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="w-full min-w-[1240px] text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <Th>날짜</Th>
                <Th>사번 / 이름</Th>
                <Th className="text-center">출근</Th>
                <Th className="text-center">퇴근</Th>
                <Th className="w-[72px] text-center">근무</Th>
                <Th className="w-[72px] text-center">연장</Th>
                <Th className="w-[72px] text-center">야간</Th>
                <Th className="w-[72px] text-center">휴일</Th>
                <Th className="w-[82px] text-center">휴일연장</Th>
                <Th className="w-[72px] text-center">공수</Th>
                <Th className="text-center">상태</Th>
                {role === "admin" && <Th className="text-center">관리</Th>}
                <Th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={role === "admin" ? 13 : 12} className="text-center py-10 text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
                    조회 중...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={role === "admin" ? 13 : 12} className="text-center py-10 text-slate-400">
                    조회 결과가 없습니다.
                  </td>
                </tr>
              ) : (
                records.map((r) => {
                  const detail = getRecordBreakdown(r);
                  const bd = detail?.breakdown;
                  const effective = getEffectiveConfirmValues(r);
                  const isConfirmed = Boolean(r.confirmedBreakdown);
                  const displayWorkHours = effectiveWorkHours(r, effective);
                  return (
                    <React.Fragment key={r.id}>
                  <tr
                    onClick={() => setExpandedId((prev) => (prev === r.id ? null : r.id))}
                    className={`border-b border-slate-100 hover:bg-slate-50 cursor-pointer ${
                      isMissingCheckout(r) ? "bg-rose-50/40" : ""
                    } ${expandedId === r.id ? "bg-slate-50" : ""}`}
                  >
                    <Td className="font-mono">{r.workDate}</Td>
                    <Td>
                      <div className="flex flex-col">
                        <span className="font-mono text-[10px] text-slate-400">{r.workerCode}</span>
                        <span className="font-semibold text-slate-800">{r.workerName}</span>
                      </div>
                    </Td>
                    <Td className="text-center font-mono text-emerald-700">
                      <span className="inline-flex items-center gap-1">
                        <LogIn className="w-3 h-3" />
                        {formatZonedTime(r.checkInAt, tz)}
                      </span>
                    </Td>
                    <Td className={`text-center font-mono ${r.checkOutAt ? "text-rose-700" : "text-slate-300"}`}>
                      <span className="inline-flex items-center gap-1">
                        <LogOut className="w-3 h-3" />
                        {formatZonedTime(r.checkOutAt, tz)}
                      </span>
                    </Td>
                    <Td className="text-center font-mono font-bold tabular-nums text-slate-800">
                      {displayWorkHours > 0 ? fmtShortHours(displayWorkHours) : bd ? fmtShortHours(bd.workHours) : r.workHours > 0 ? fmtShortHours(r.workHours) : "-"}
                    </Td>
                    <Td className="text-center font-mono tabular-nums text-slate-700">
                      {isConfirmed ? fmtShortHours(effective.overtimeHours) : bd ? fmtShortHours(bd.overtimeHours) : "-"}
                    </Td>
                    <Td className="text-center font-mono tabular-nums text-indigo-700">
                      {isConfirmed ? fmtShortHours(effective.nightHours) : bd ? fmtShortHours(bd.nightHours) : "-"}
                    </Td>
                    <Td className="text-center font-mono tabular-nums text-amber-700">
                      {isConfirmed ? fmtShortHours(effective.holidayHours) : bd ? fmtShortHours(bd.holidayHours) : "-"}
                    </Td>
                    <Td className="text-center font-mono tabular-nums text-orange-700">
                      {isConfirmed ? fmtShortHours(effective.holidayOvertimeHours) : bd ? fmtShortHours(bd.holidayOvertimeHours) : "-"}
                    </Td>
                    <Td className="text-center font-mono font-bold tabular-nums text-blue-700">
                      {effective.manDays > 0 ? effective.manDays.toFixed(2) : detail?.isManDay && bd && bd.manDays > 0 ? bd.manDays.toFixed(2) : "-"}
                    </Td>
                    <Td className="text-center">
                      {isMissingCheckout(r) ? (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-rose-100 text-rose-700 font-bold border border-rose-200">
                          퇴근 누락
                        </span>
                      ) : r.checkInAt && r.checkOutAt ? (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold border border-emerald-200">
                          정상
                        </span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold border border-slate-200">
                          {r.status === "absent" ? "결근" : "근무 중"}
                        </span>
                      )}
                    </Td>
                    {role === "admin" && (
                      <Td className="text-center">
                        <div className="inline-flex items-center justify-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openManualModal(r);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                          >
                            <Pencil className="w-3 h-3" />
                            수정
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleDeleteRecord(r);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-semibold rounded border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
                          >
                            <Trash2 className="w-3 h-3" />
                            삭제
                          </button>
                        </div>
                      </Td>
                    )}
                    <Td className="text-center text-slate-400">
                      {expandedId === r.id ? (
                        <ChevronDown className="w-4 h-4 inline" />
                      ) : (
                        <ChevronRight className="w-4 h-4 inline" />
                      )}
                    </Td>
                  </tr>
                  {expandedId === r.id && (
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <td colSpan={role === "admin" ? 13 : 12} className="px-4 py-3">
                        {renderBreakdown(r)}
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-[10px] text-slate-500 font-mono flex items-center gap-2">
          <TrendingUp className="w-3 h-3" />
          {fromDate} ~ {toDate} · 총 {records.length} 건
        </div>
      </div>

      {role === "admin" && manualModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/45 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div>
                <h3 className="text-sm font-bold text-slate-900">관리자 수동 출퇴근 입력</h3>
                <p className="text-[11px] text-slate-500 mt-1">출근 누락, 퇴근 누락, 현장 대리 입력 상황을 보정합니다.</p>
                <p className="text-[10px] text-blue-600 mt-1">입력 시각은 현장 시간대({tz}) 기준으로 저장됩니다.</p>
              </div>
              <button onClick={closeManualModal} className="p-1.5 rounded-full hover:bg-slate-100">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleManualSave} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">근로자</label>
                  <select
                    value={manualWorkerId}
                    onChange={(e) => setManualWorkerId(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white"
                    required
                  >
                    <option value="">근로자 선택</option>
                    {manualWorkerOptions.map((w) => (
                      <option key={w.id} value={w.id}>
                        [{w.workerId}] {w.name}{w.retireDate ? ` (퇴사 ${w.retireDate})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">근무일</label>
                  <input
                    type="date"
                    value={manualWorkDate}
                    onChange={(e) => setManualWorkDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">관리 메모</label>
                  <input
                    type="text"
                    value={manualNote}
                    onChange={(e) => setManualNote(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    placeholder="예: 관리자 현장 확인 후 수동 입력"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">출근 시각</label>
                  <input
                    type="time"
                    value={manualCheckIn}
                    onChange={(e) => setManualCheckIn(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">퇴근 시각</label>
                  <input
                    type="time"
                    value={manualCheckOut}
                    onChange={(e) => setManualCheckOut(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono"
                  />
                </div>
              </div>

              {manualError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-[11px] text-rose-700 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {manualError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeManualModal}
                  className="px-4 py-2 text-sm font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={manualSaving}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 flex items-center gap-2"
                >
                  {manualSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  저장
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {payslipPickerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/45 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <div>
                <h3 className="text-sm font-bold text-slate-900">급여명세서 발급 대상 선택</h3>
                <p className="text-[11px] text-slate-500 mt-1">
                  {fromDate.slice(0, 7)} 기준 · 선택한 근로자만 시트로 생성됩니다.
                </p>
              </div>
              <button onClick={() => setPayslipPickerOpen(false)} className="p-1.5 rounded-full hover:bg-slate-100">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between text-[11px]">
              <div className="text-slate-600 font-mono">
                선택 {payslipSelected.size} / 전체 {workers.length} 명
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPayslipSelected(new Set(workers.map((w) => w.id!).filter(Boolean)))}
                  className="px-2 py-1 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-[10px] font-semibold"
                >
                  전체 선택
                </button>
                <button
                  type="button"
                  onClick={() => setPayslipSelected(new Set())}
                  className="px-2 py-1 rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-[10px] font-semibold"
                >
                  전체 해제
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-2 py-2">
              {workers.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-500">등록된 근로자가 없습니다.</div>
              ) : (
                workers.map((w) => {
                  const id = w.id || "";
                  const checked = payslipSelected.has(id);
                  const typeLabel =
                    w.employmentType === "salary" ? "월급"
                    : w.employmentType === "hourly" ? "시급"
                    : w.employmentType === "daily" ? "일용"
                    : "사업소득";
                  return (
                    <label
                      key={id}
                      className={`flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer hover:bg-slate-50 ${
                        checked ? "bg-amber-50" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => togglePayslipWorker(id)}
                        className="w-4 h-4 accent-amber-600"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-bold text-slate-800 truncate">
                          {w.name} <span className="font-mono text-[10px] text-slate-500">[{w.workerId}]</span>
                        </div>
                        <div className="text-[10px] text-slate-500 truncate">
                          {w.department || "-"} · {w.duty || "-"} · {w.job || "-"}
                        </div>
                      </div>
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          w.employmentType === "business"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {typeLabel}
                      </span>
                    </label>
                  );
                })
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-200 flex items-center justify-end gap-2 bg-slate-50">
              <button
                type="button"
                onClick={() => setPayslipPickerOpen(false)}
                className="px-3 py-1.5 text-xs font-semibold rounded border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={confirmPayslipExport}
                disabled={payslipSelected.size === 0 || exporting !== ""}
                className="px-3 py-1.5 text-xs font-semibold rounded border border-amber-200 bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 flex items-center gap-1.5"
              >
                {exporting === "payslip" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                선택한 {payslipSelected.size}명 발급
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// 작은 헬퍼 컴포넌트
// ============================================================
const Th: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <th className={`border-l border-slate-200 first:border-l-0 px-3 py-2 text-left font-bold text-[10px] uppercase tracking-wider text-slate-500 ${className || ""}`}>
    {children}
  </th>
);

const Td: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <td className={`border-l border-slate-100 first:border-l-0 px-3 py-2.5 align-middle ${className || ""}`}>{children}</td>
);

const ConfirmNumberInput: React.FC<{
  label: string;
  value: number;
  suffix: string;
  onChange: (value: string) => void;
  step?: string;
}> = ({ label, value, suffix, onChange, step = "0.1" }) => (
  <label className="block">
    <span className="block text-[10px] font-bold text-slate-500 mb-1">{label}</span>
    <div className="flex items-center rounded border border-slate-200 bg-white overflow-hidden focus-within:border-blue-400">
      <input
        type="number"
        min="0"
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 w-full px-2 py-1.5 text-xs font-mono text-right outline-none"
      />
      <span className="shrink-0 px-2 py-1.5 bg-slate-50 border-l border-slate-200 text-[10px] font-bold text-slate-400">
        {suffix}
      </span>
    </div>
  </label>
);

const BreakdownCell: React.FC<{ label: string; value: string; strong?: boolean }> = ({
  label,
  value,
  strong,
}) => (
  <div className="rounded-md border border-slate-200 bg-white px-2.5 py-2">
    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</div>
    <p className={`mt-0.5 font-mono ${strong ? "text-sm font-extrabold text-slate-900" : "text-xs font-bold text-slate-700"}`}>
      {value}
    </p>
  </div>
);

const SummaryCard: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "slate" | "emerald" | "blue" | "rose";
}> = ({ icon, label, value, tone }) => {
  const toneClasses = {
    slate:   "bg-white border-slate-200 text-slate-700",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
    blue:    "bg-blue-50 border-blue-200 text-blue-800",
    rose:    "bg-rose-50 border-rose-200 text-rose-800",
  }[tone];

  return (
    <div className={`rounded-lg border p-3 ${toneClasses}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider opacity-80">
        {icon}
        {label}
      </div>
      <p className="text-lg font-extrabold mt-1 font-mono">{value}</p>
    </div>
  );
};
