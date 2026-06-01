import React, { useMemo } from "react";
import { useApp } from "../context/SupabaseContext";
import { Worker } from "../types";
import { CalendarClock, BadgeAlert, Globe, AlertCircle, FileWarning } from "lucide-react";

// 만료 알림 임계값 (일). 계약·여권 공통으로 D-임계값 이내면 목록에 노출.
const ALERT_WINDOW_DAYS = 60;

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
  const { workers } = useApp();

  const contractItems = useMemo(() => buildList(workers, (w) => w.contractEndDate), [workers]);
  const passportItems = useMemo(
    () => buildList(workers.filter((w) => w.isForeigner), (w) => w.passportExpiry),
    [workers]
  );

  const criticalCount =
    contractItems.filter((i) => i.severity === "critical" || i.severity === "expired").length +
    passportItems.filter((i) => i.severity === "critical" || i.severity === "expired").length;

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
    </div>
  );
};
