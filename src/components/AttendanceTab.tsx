import React, { useEffect, useMemo, useState } from "react";
import { useApp, AttendanceRecord } from "../context/SupabaseContext";
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
} from "lucide-react";

// ============================================================
// 날짜 헬퍼
// ============================================================
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "--:--";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtHours(h: number): string {
  if (h <= 0) return "-";
  const hours = Math.floor(h);
  const minutes = Math.round((h - hours) * 60);
  return `${hours}시간 ${minutes}분`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

type Preset = "thisMonth" | "lastMonth" | "last7" | "custom";

// ============================================================
// AttendanceTab
// ============================================================
export const AttendanceTab: React.FC = () => {
  const { workers, fetchAttendance } = useApp();

  const today = useMemo(() => new Date(), []);
  const [preset, setPreset] = useState<Preset>("thisMonth");
  const [fromDate, setFromDate] = useState<string>(ymd(startOfMonth(today)));
  const [toDate, setToDate] = useState<string>(ymd(endOfMonth(today)));
  const [workerId, setWorkerId] = useState<string>("all");

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // preset 변경 시 날짜 자동 세팅
  useEffect(() => {
    const now = new Date();
    if (preset === "thisMonth") {
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
      (r) => r.checkInAt && !r.checkOutAt && r.workDate < ymd(today)
    ).length;
    const uniqueWorkers = new Set(records.map((r) => r.workerId)).size;
    return { totalDays, totalHours, missingCheckout, uniqueWorkers };
  }, [records, today]);

  const isMissingCheckout = (r: AttendanceRecord) =>
    r.checkInAt && !r.checkOutAt && r.workDate < ymd(today);

  return (
    <div className="space-y-4">
      {/* 필터 바 */}
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <Filter className="w-3.5 h-3.5 text-slate-500" />
          조회 조건
        </div>

        {/* 프리셋 */}
        <div className="flex flex-wrap gap-1.5">
          {([
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

      {/* 테이블 */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <Th>날짜</Th>
                <Th>사번 / 이름</Th>
                <Th className="text-center">출근</Th>
                <Th className="text-center">퇴근</Th>
                <Th className="text-right">근무시간</Th>
                <Th className="text-center">상태</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin inline mr-2" />
                    조회 중...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-400">
                    조회 결과가 없습니다.
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr
                    key={r.id}
                    className={`border-b border-slate-100 hover:bg-slate-50 ${
                      isMissingCheckout(r) ? "bg-rose-50/40" : ""
                    }`}
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
                        {fmtTime(r.checkInAt)}
                      </span>
                    </Td>
                    <Td className={`text-center font-mono ${r.checkOutAt ? "text-rose-700" : "text-slate-300"}`}>
                      <span className="inline-flex items-center gap-1">
                        <LogOut className="w-3 h-3" />
                        {fmtTime(r.checkOutAt)}
                      </span>
                    </Td>
                    <Td className="text-right font-mono font-bold text-slate-800">
                      {r.workHours > 0 ? fmtHours(r.workHours) : "-"}
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
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-[10px] text-slate-500 font-mono flex items-center gap-2">
          <TrendingUp className="w-3 h-3" />
          {fromDate} ~ {toDate} · 총 {records.length} 건
        </div>
      </div>
    </div>
  );
};

// ============================================================
// 작은 헬퍼 컴포넌트
// ============================================================
const Th: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <th className={`px-3 py-2 text-left font-bold text-[10px] uppercase tracking-wider text-slate-500 ${className || ""}`}>
    {children}
  </th>
);

const Td: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <td className={`px-3 py-2.5 align-middle ${className || ""}`}>{children}</td>
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
