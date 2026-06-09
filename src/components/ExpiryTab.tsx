import React, { useMemo, useState } from "react";
import { useApp } from "../context/SupabaseContext";
import { Worker } from "../types";
import { CalendarClock, BadgeAlert, Globe, AlertCircle, FileWarning, ShieldCheck, Loader2 } from "lucide-react";

// 만료 알림 임계값 (일). 계약·여권 공통으로 D-임계값 이내면 목록에 노출.
const ALERT_WINDOW_DAYS = 60;
const PRIVACY_RETENTION_YEARS = 2;

// 오늘(자정) 기준 대상일까지 남은 일수. 음수면 이미 만료. 값 없으면 null.
function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

type Severity = "expired" | "critical" | "warning" | "notice";

function severityOf(days: number): Severity {
  if (days < 0) return "expired";
  if (days <= 14) return "critical";
  if (days <= 30) return "warning";
  return "notice";
}

const SEVERITY_STYLE: Record<Severity, { badge: string; row: string; label: string }> = {
  expired: { badge: "bg-slate-200 text-slate-700 border-slate-300", row: "bg-slate-50", label: "만료됨" },
  critical: { badge: "bg-rose-100 text-rose-700 border-rose-200", row: "bg-rose-50/40", label: "임박" },
  warning: { badge: "bg-orange-100 text-orange-700 border-orange-200", row: "bg-orange-50/30", label: "주의" },
  notice: { badge: "bg-amber-100 text-amber-700 border-amber-200", row: "", label: "안내" },
};

function ddayText(days: number): string {
  if (days < 0) return `D+${Math.abs(days)}`;
  if (days === 0) return "D-DAY";
  return `D-${days}`;
}

function addYears(dateStr: string, years: number): string {
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  date.setFullYear(date.getFullYear() + years);
  return date.toISOString().split("T")[0];
}

interface ExpiryItem {
  worker: Worker;
  date: string;
  days: number;
  severity: Severity;
}

function buildList(workers: Worker[], pick: (w: Worker) => string): ExpiryItem[] {
  return workers
    .map((w) => {
      const date = pick(w);
      const days = daysUntil(date);
      if (days === null || days > ALERT_WINDOW_DAYS) return null;
      return { worker: w, date, days, severity: severityOf(days) };
    })
    .filter((x): x is ExpiryItem => x !== null)
    .sort((a, b) => a.days - b.days);
}

function buildPrivacyList(workers: Worker[]): ExpiryItem[] {
  return workers
    .map((w) => {
      if (!w.retireDate || w.privacyPurgedAt) return null;
      const date = addYears(w.retireDate, PRIVACY_RETENTION_YEARS);
      const days = daysUntil(date);
      if (days === null || days > ALERT_WINDOW_DAYS) return null;
      return { worker: w, date, days, severity: severityOf(days) };
    })
    .filter((x): x is ExpiryItem => x !== null)
    .sort((a, b) => a.days - b.days);
}

const ExpiryList: React.FC<{
  title: string;
  icon: React.ReactNode;
  items: ExpiryItem[];
  emptyText: string;
}> = ({ title, icon, items, emptyText }) => (
  <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
    <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
      <h4 className="flex items-center gap-2 text-sm font-bold text-slate-800">
        {icon}
        {title}
      </h4>
      <span className="text-[11px] font-semibold text-slate-500">{items.length}건</span>
    </div>

    {items.length === 0 ? (
      <div className="text-center py-8">
        <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
        <p className="text-xs text-slate-500">{emptyText}</p>
      </div>
    ) : (
      <div className="divide-y divide-slate-100">
        {items.map(({ worker: w, date, days, severity }) => {
          const style = SEVERITY_STYLE[severity];
          return (
            <div
              key={w.id || w.workerId}
              className={`flex items-center gap-3 px-4 py-3 text-xs ${style.row}`}
            >
              <span className={`inline-flex w-12 justify-center font-mono font-bold px-1.5 py-1 rounded border ${style.badge}`}>
                {ddayText(days)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-900 truncate">{w.name}</span>
                  {w.englishName && <span className="text-[11px] text-slate-400 truncate">({w.englishName})</span>}
                  {w.isForeigner && (
                    <span className="inline-flex items-center gap-0.5 text-[9px] text-blue-600 font-bold shrink-0">
                      <Globe className="w-2.5 h-2.5" />외국인
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 font-mono truncate">
                  {w.workerId} · {w.nationality || "국적 미상"} · {w.phone}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-mono font-semibold text-slate-700">{date}</p>
                <p className={`text-[10px] font-bold ${severity === "notice" ? "text-amber-600" : severity === "warning" ? "text-orange-600" : severity === "critical" ? "text-rose-600" : "text-slate-500"}`}>
                  {style.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    )}
  </div>
);

export const ExpiryTab: React.FC = () => {
  const { workers, purgeRetiredWorkerPrivateData } = useApp();
  const [purgingId, setPurgingId] = useState<string | null>(null);
  const [purgeError, setPurgeError] = useState("");

  const contractItems = useMemo(() => buildList(workers, (w) => w.contractEndDate), [workers]);
  const passportItems = useMemo(
    () => buildList(workers.filter((w) => w.isForeigner), (w) => w.passportExpiry),
    [workers]
  );
  const privacyItems = useMemo(() => buildPrivacyList(workers), [workers]);

  const criticalCount =
    contractItems.filter((i) => i.severity === "critical" || i.severity === "expired").length +
    passportItems.filter((i) => i.severity === "critical" || i.severity === "expired").length +
    privacyItems.filter((i) => i.severity === "critical" || i.severity === "expired").length;

  const handlePurge = async (worker: Worker) => {
    if (!worker.id) return;
    setPurgeError("");
    const dueDate = worker.retireDate ? addYears(worker.retireDate, PRIVACY_RETENTION_YEARS) : "";
    if (!window.confirm(`${worker.name} (${worker.workerId}) 님의 퇴사자 민감정보를 정리할까요?\n정리 대상: 주민번호, 주소, 연락처, 계좌, 로그인 ID, 외국인 본국 연락처 등\n보존 대상: 사번, 이름, 입퇴사일, 고용형태, 과거 출퇴근 기록\n정리 기준일: ${dueDate}`)) {
      return;
    }
    setPurgingId(worker.id);
    try {
      await purgeRetiredWorkerPrivateData(worker.id);
    } catch (err: any) {
      setPurgeError(err?.message || "민감정보 정리 중 오류가 발생했습니다.");
    } finally {
      setPurgingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* 요약 헤더 */}
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="bg-rose-500 p-2 rounded-lg">
            <BadgeAlert className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">계약 · 여권 만료 관리</h3>
            <p className="text-[11px] text-slate-500">만료 {ALERT_WINDOW_DAYS}일 이내 대상자를 자동 집계합니다.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 font-semibold">
            계약 임박 <strong className="text-slate-900">{contractItems.length}</strong>
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 font-semibold">
            여권 임박 <strong className="text-slate-900">{passportItems.length}</strong>
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 font-semibold">
            개인정보 정리 <strong className="text-slate-900">{privacyItems.length}</strong>
          </span>
          {criticalCount > 0 && (
            <span className="px-2.5 py-1 rounded-lg bg-rose-100 text-rose-700 font-bold">
              긴급 {criticalCount}
            </span>
          )}
        </div>
      </div>

      <ExpiryList
        title="계약 만료 임박"
        icon={<CalendarClock className="w-4 h-4 text-slate-500" />}
        items={contractItems}
        emptyText={`${ALERT_WINDOW_DAYS}일 이내 계약 만료 예정자가 없습니다.`}
      />

      <ExpiryList
        title="여권 만료 임박 (외국인)"
        icon={<FileWarning className="w-4 h-4 text-slate-500" />}
        items={passportItems}
        emptyText={`${ALERT_WINDOW_DAYS}일 이내 여권 만료 예정자가 없습니다.`}
      />

      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200">
          <h4 className="flex items-center gap-2 text-sm font-bold text-slate-800">
            <ShieldCheck className="w-4 h-4 text-slate-500" />
            퇴사자 개인정보 정리 대상
          </h4>
          <span className="text-[11px] font-semibold text-slate-500">{privacyItems.length}건</span>
        </div>

        {purgeError && (
          <div className="mx-4 mt-3 p-2.5 bg-rose-50 border border-rose-200 rounded text-[11px] text-rose-700">
            {purgeError}
          </div>
        )}

        {privacyItems.length === 0 ? (
          <div className="text-center py-8">
            <AlertCircle className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs text-slate-500">퇴사 후 {PRIVACY_RETENTION_YEARS}년이 지나 민감정보 정리가 필요한 대상자가 없습니다.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {privacyItems.map(({ worker: w, date, days, severity }) => {
              const style = SEVERITY_STYLE[severity];
              const disabled = purgingId === w.id || days > 0;
              return (
                <div
                  key={w.id || w.workerId}
                  className={`flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3 text-xs ${style.row}`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className={`inline-flex w-12 justify-center font-mono font-bold px-1.5 py-1 rounded border ${style.badge}`}>
                      {ddayText(days)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-slate-900 truncate">{w.name}</span>
                        <span className="text-[11px] text-slate-400 truncate">퇴사일 {w.retireDate}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 font-mono truncate">
                        {w.workerId} · 정리 기준일 {date}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handlePurge(w)}
                    disabled={disabled}
                    className="self-start sm:self-center inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-200 bg-white text-slate-700 font-bold hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {purgingId === w.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                    민감정보 정리
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
