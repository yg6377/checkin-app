import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { AttendanceRecord, useApp } from "../context/SupabaseContext";
import type { Html5Qrcode } from "html5-qrcode";
import { languageOptions, languageToLocale, useLanguage } from "../i18n";
import {
  HardHat,
  LogIn,
  LogOut,
  QrCode,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  Camera,
  CalendarDays,
  ChevronLeft,
} from "lucide-react";

// ============================================================
// 시간 포맷 헬퍼
// ============================================================
function fmtTime(iso: string | null): string {
  if (!iso) return "--:--";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtDateLabel(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtWorkDate(dateStr: string, locale: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, (month || 1) - 1, day || 1);
  const formattedDate = `${year}.${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")}`;
  const weekday = new Intl.DateTimeFormat(locale, { weekday: "short" }).format(date);
  return `${formattedDate} (${weekday})`;
}

function fmtHours(hours: number): string {
  if (hours <= 0) return "-";
  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);
  return `${wholeHours}:${String(minutes).padStart(2, "0")}`;
}

// ============================================================
// QR 스캐너 모달
// ============================================================
// Promise 가 ms 안에 끝나지 않으면 reject 한다.
// (html5-qrcode 의 stop() hang / 네트워크 행으로 화면이 "처리 중" 에
//  영구히 갇히는 것을 막는 방어 장치)
function withTimeout<T>(p: Promise<T>, ms: number, timeoutError?: Error): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(timeoutError ?? new Error("timeout")), ms);
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  }) as Promise<T>;
}

const ScannerModal: React.FC<{
  action: "in" | "out";
  onScan: (code: string) => Promise<void>;
  onClose: () => void;
}> = ({ action, onScan, onClose }) => {
  const { t } = useLanguage();
  const containerRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  const closingRef = useRef(false);
  const scannerElementId = useId().replace(/:/g, "-");
  const [status, setStatus] = useState<"idle" | "scanning" | "processing" | "error">("idle");
  const [error, setError] = useState<string>("");
  const [debug, setDebug] = useState<string>("");

  useEffect(() => {
    onScanRef.current = onScan;
    onCloseRef.current = onClose;
  }, [onScan, onClose]);

  const stopScannerSafely = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;

    try {
      await scanner.stop();
    } catch {
      // ignore stop errors during close race
    }

    try {
      scanner.clear();
    } catch {
      // ignore clear errors when DOM is already gone
    }

    if (containerRef.current) {
      containerRef.current.innerHTML = "";
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!containerRef.current) return;
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
        if (cancelled || !containerRef.current) return;

        containerRef.current.innerHTML = "";
        const scanner = new Html5Qrcode(scannerElementId, {
          verbose: false,
          // QR 만 대상으로 하면 디코딩이 빠르고 정확해짐
          formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
          // 지원 기기(모바일 Chrome 등)에서는 네이티브 BarcodeDetector 사용 →
          // 순수 JS 디코더보다 인식률이 훨씬 높음 (무반응의 주원인 대응)
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        });
        scannerRef.current = scanner;
        setStatus("scanning");
        setDebug("카메라 시작 중…");

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            // 고정 240px 은 작은 화면에서 스캔 영역을 못 잡아
            // 디코딩이 아예 안 되는 원인이 된다. 뷰포트에 맞춰 동적 계산.
            qrbox: (viewW: number, viewH: number) => {
              const edge = Math.max(160, Math.floor(Math.min(viewW, viewH) * 0.7));
              return { width: edge, height: edge };
            },
          },
          async (decodedText) => {
            // 디코딩 성공 콜백 진입 — 이 표시가 뜨면 인식은 정상.
            setDebug(`디코딩됨(${decodedText.length}자): ${decodedText.slice(0, 24)}`);
            if (cancelled || closingRef.current) return;
            closingRef.current = true;
            setStatus("processing");

            // 스캐너 정지는 best-effort — hang/실패해도 무시하고 제출은 진행.
            await withTimeout(stopScannerSafely(), 3000).catch(() => {});

            try {
              // 제출이 멈춰도 화면이 "처리 중" 에 갇히지 않도록 타임아웃.
              await withTimeout(
                onScanRef.current(decodedText),
                15000,
                new Error(t("processError"))
              );
            } catch (e: any) {
              closingRef.current = false;
              if (!cancelled) {
                setStatus("error");
                setError(e?.message || t("processError"));
              }
            }
          },
          () => {
            // 스캔 실패(프레임마다)는 무시 — 계속 시도
          }
        );

        if (cancelled) {
          await stopScannerSafely();
        } else {
          // 카메라는 떴는데 이후 이 문구만 계속 보이면 = 디코딩 자체가 안 되는 것.
          setDebug((d) => (d.startsWith("디코딩") ? d : "카메라 작동 중 · QR을 비춰주세요"));
        }
      } catch (e: any) {
        if (cancelled) return;
        setStatus("error");
        setError(e?.message || t("cameraStartError"));
        setDebug(`카메라 시작 실패: ${e?.name || ""} ${e?.message || ""}`);
      }
    }

    start();

    return () => {
      cancelled = true;
      void stopScannerSafely();
    };
  }, [scannerElementId, stopScannerSafely, t]);

  const handleCloseClick = useCallback(async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setStatus("processing");
    await stopScannerSafely();
    onCloseRef.current();
  }, [stopScannerSafely]);

  const isIn = action === "in";

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 safe-area-modal">
      <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl">
        <div className={`px-5 py-4 flex items-center justify-between ${isIn ? "bg-emerald-600" : "bg-rose-600"} text-white`}>
          <div>
            <h3 className="text-base font-extrabold flex items-center gap-2">
              {isIn ? <LogIn className="w-5 h-5" /> : <LogOut className="w-5 h-5" />}
              {isIn ? t("qrCheckInTitle") : t("qrCheckOutTitle")}
            </h3>
            <p className="text-[11px] opacity-90 mt-0.5">{t("qrGuide")}</p>
          </div>
          <button onClick={() => void handleCloseClick()} className="p-1.5 rounded-full hover:bg-white/20">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 bg-black">
          <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-slate-900">
            <div
              id={scannerElementId}
              ref={containerRef}
              className="qr-scanner-shell absolute inset-0"
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-60 w-60 max-h-[70%] max-w-[70%] rounded-[2rem] border-4 border-white/85 shadow-[0_0_0_9999px_rgba(15,23,42,0.28)]" />
            </div>
          </div>
        </div>

        <div className="px-5 py-4 bg-white border-t border-gray-100 text-xs">
          {status === "scanning" && (
            <p className="flex items-center gap-2 text-slate-600">
              <Camera className="w-4 h-4 animate-pulse text-emerald-500" />
              {t("waitingQr")}
            </p>
          )}
          {status === "processing" && (
            <p className="flex items-center gap-2 text-slate-600">
              <Clock className="w-4 h-4 animate-spin" />
              {t("processing")}
            </p>
          )}
          {status === "error" && (
            <div className="flex items-start gap-2 p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="text-[11px]">{error}</span>
            </div>
          )}
          {status === "idle" && <p className="text-slate-500">{t("cameraChecking")}</p>}
          {debug && (
            <p className="mt-2 text-[10px] font-mono text-slate-400 break-all border-t border-slate-100 pt-2">
              진단: {debug}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

const AttendanceResultModal: React.FC<{
  action: "in" | "out";
  onConfirm: () => void;
}> = ({ action, onConfirm }) => {
  const { t } = useLanguage();
  const isCheckIn = action === "in";

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 safe-area-modal">
      <div className="bg-white rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl">
        <div className={`px-5 py-4 ${isCheckIn ? "bg-emerald-600" : "bg-rose-600"} text-white`}>
          <h3 className="text-base font-extrabold flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5" />
            {t("processingDone")}
          </h3>
        </div>

        <div className="px-6 py-8 text-center">
          <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${isCheckIn ? "bg-emerald-50" : "bg-rose-50"}`}>
            {isCheckIn ? (
              <LogIn className={`w-8 h-8 ${isCheckIn ? "text-emerald-600" : "text-rose-600"}`} />
            ) : (
              <LogOut className="w-8 h-8 text-rose-600" />
            )}
          </div>
          <p className="text-lg font-black text-slate-900">
            {isCheckIn ? t("checkInComplete") : t("checkOutComplete")}
          </p>
          <p className="mt-2 text-sm text-slate-500">
            {t("confirmReturn")}
          </p>
        </div>

        <div className="px-5 pb-5">
          <button
            onClick={onConfirm}
            className={`w-full rounded-2xl py-3 text-sm font-bold text-white shadow-lg transition active:scale-[0.99] ${isCheckIn ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"}`}
          >
            {t("confirm")}
          </button>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// 근로자 메인 화면
// ============================================================
export const WorkerPortal: React.FC = () => {
  const { user, logout, workers, todayAttendance, submitAttendance, refreshTodayAttendance, fetchAttendance } = useApp();
  const { language, setLanguage, t } = useLanguage();
  const [scannerAction, setScannerAction] = useState<"in" | "out" | null>(null);
  const [now, setNow] = useState(new Date());
  const [activeView, setActiveView] = useState<"home" | "history">("home");
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState("");
  const [attendanceHistory, setAttendanceHistory] = useState<AttendanceRecord[]>([]);
  const [resultAction, setResultAction] = useState<"in" | "out" | null>(null);

  // 본인 worker 정보 (workers 배열에서 본인만 RLS 로 보임)
  const me = workers[0];
  const locale = languageToLocale[language];
  const formatHourSummary = useCallback((hours: number) => {
    if (hours <= 0) return "-";
    const wholeHours = Math.floor(hours);
    const minutes = Math.round((hours - wholeHours) * 60);
    return `${wholeHours} ${t("hourUnit")} ${minutes} ${t("minuteUnit")}`;
  }, [t]);

  // 1초마다 현재 시각 갱신
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // 화면 진입 시 최신 상태로 갱신
  useEffect(() => {
    refreshTodayAttendance();
  }, [refreshTodayAttendance]);

  const loadAttendanceHistory = useCallback(async () => {
    if (!me?.id) {
      setAttendanceHistory([]);
      return;
    }

    setRecordsLoading(true);
    setRecordsError("");
    try {
      const records = await fetchAttendance({
        fromDate: me.joinDate || "2000-01-01",
        toDate: ymd(new Date()),
        workerId: me.id,
      });
      setAttendanceHistory(records);
    } catch (e: any) {
      setRecordsError(e?.message || t("historyLoadError"));
      setAttendanceHistory([]);
    } finally {
      setRecordsLoading(false);
    }
  }, [fetchAttendance, me?.id, me?.joinDate, t]);

  useEffect(() => {
    loadAttendanceHistory();
  }, [loadAttendanceHistory]);

  const checkedIn = !!todayAttendance?.checkInAt;
  const checkedOut = !!todayAttendance?.checkOutAt;

  const handleScan = useCallback(async (code: string) => {
    if (!scannerAction) return;
    const action = scannerAction;
    setScannerAction(null);
    await submitAttendance(code, action);
    await loadAttendanceHistory();
    setResultAction(action);
  }, [scannerAction, submitAttendance, loadAttendanceHistory]);

  const handleCloseScanner = useCallback(() => {
    setScannerAction(null);
  }, []);

  const totalWorkDays = attendanceHistory.filter((r) => r.checkInAt).length;
  const totalWorkHours = attendanceHistory.reduce((sum, r) => sum + r.workHours, 0);
  const missingCheckoutCount = attendanceHistory.filter((r) => r.checkInAt && !r.checkOutAt).length;

  return (
    <div className="safe-area-screen bg-gradient-to-br from-slate-50 to-stone-100 font-sans flex flex-col">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-orange-500 p-1.5 rounded-lg">
              <HardHat className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-mono text-slate-400">
                {activeView === "home" ? t("workerMode") : t("attendanceHistory")}
                <span className="ml-1.5 text-slate-300">v{__APP_VERSION__}</span>
              </p>
              <p className="text-sm font-bold text-slate-900">
                {activeView === "home" ? me?.name || user?.email : t("myAttendanceRecords")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as typeof language)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 focus:outline-none focus:border-slate-400"
            >
              {languageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            {activeView === "history" && (
              <button
                onClick={() => setActiveView("home")}
                className="text-[11px] text-slate-500 hover:text-slate-900 flex items-center gap-1 font-semibold"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                {t("back")}
              </button>
            )}
            <button
              onClick={logout}
              className="text-[11px] text-slate-500 hover:text-rose-600 flex items-center gap-1 font-semibold"
            >
              <LogOut className="w-3 h-3" />
              {t("logout")}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-md mx-auto w-full p-4 space-y-4">
        {activeView === "home" ? (
          <>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 text-center">
              <p className="text-xs text-slate-500 font-mono">{fmtDateLabel(now, locale)}</p>
              <p className="text-5xl font-black tracking-tight text-slate-900 font-mono mt-1">
                {String(now.getHours()).padStart(2, "0")}:{String(now.getMinutes()).padStart(2, "0")}
                <span className="text-xl text-slate-400">:{String(now.getSeconds()).padStart(2, "0")}</span>
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{t("todayStatus")}</p>

              <div className="grid grid-cols-2 gap-3">
                <div className={`p-3 rounded-xl border ${checkedIn ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-200"}`}>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase">
                    <LogIn className="w-3 h-3" />
                    {t("checkIn")}
                  </div>
                  <p className={`text-xl font-extrabold font-mono mt-1 ${checkedIn ? "text-emerald-700" : "text-slate-300"}`}>
                    {fmtTime(todayAttendance?.checkInAt ?? null)}
                  </p>
                </div>
                <div className={`p-3 rounded-xl border ${checkedOut ? "bg-rose-50 border-rose-200" : "bg-slate-50 border-slate-200"}`}>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase">
                    <LogOut className="w-3 h-3" />
                    {t("checkOut")}
                  </div>
                  <p className={`text-xl font-extrabold font-mono mt-1 ${checkedOut ? "text-rose-700" : "text-slate-300"}`}>
                    {fmtTime(todayAttendance?.checkOutAt ?? null)}
                  </p>
                </div>
              </div>

              {checkedIn && checkedOut && (
                <div className="flex items-center gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  {t("workdayFinished")}
                </div>
              )}
            </div>

            <div className="space-y-3">
              <button
                onClick={() => setScannerAction("in")}
                disabled={checkedIn}
                className="w-full flex items-center justify-center gap-3 p-5 bg-emerald-600 text-white rounded-2xl font-extrabold text-lg shadow-lg hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <QrCode className="w-6 h-6" />
                {checkedIn ? t("checkInDone") : t("checkInScan")}
              </button>
              <button
                onClick={() => setScannerAction("out")}
                disabled={!checkedIn || checkedOut}
                className="w-full flex items-center justify-center gap-3 p-5 bg-rose-600 text-white rounded-2xl font-extrabold text-lg shadow-lg hover:bg-rose-700 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                <QrCode className="w-6 h-6" />
                {checkedOut ? t("checkOutDone") : t("checkOutScan")}
              </button>
            </div>

            <button
              onClick={() => setActiveView("history")}
              className="w-full bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4 flex items-center justify-between text-left hover:border-slate-300 transition"
            >
              <div className="flex items-center gap-3">
                <div className="bg-slate-100 p-2 rounded-xl">
                  <CalendarDays className="w-5 h-5 text-slate-700" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">{t("attendanceHistory")}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{t("historyOpenDesc")}</p>
                </div>
              </div>
              <span className="text-xs font-semibold text-slate-400">{t("open")}</span>
            </button>

            <p className="text-[11px] text-center text-slate-400 leading-relaxed">
              {t("scanGuide")}
            </p>
          </>
        ) : (
          <>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{t("myHistory")}</p>
                  <p className="text-[11px] text-slate-400 mt-1">{t("historySinceJoin")}</p>
                </div>
                <button
                  onClick={loadAttendanceHistory}
                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-900"
                >
                  {t("refresh")}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">{t("totalDays")}</p>
                  <p className="mt-1 text-lg font-black text-slate-900">{totalWorkDays} {t("dayUnit")}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">{t("totalHours")}</p>
                  <p className="mt-1 text-lg font-black text-slate-900">{formatHourSummary(totalWorkHours)}</p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-[10px] font-bold text-slate-500 uppercase">{t("missingCheckout")}</p>
                  <p className={`mt-1 text-lg font-black ${missingCheckoutCount > 0 ? "text-rose-600" : "text-slate-900"}`}>
                    {missingCheckoutCount} {t("caseUnit")}
                  </p>
                </div>
              </div>
            </div>

            {recordsLoading && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                {t("loadingHistory")}
              </div>
            )}

            {!recordsLoading && recordsError && (
              <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed">{recordsError}</p>
              </div>
            )}

            {!recordsLoading && !recordsError && attendanceHistory.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                {t("noHistory")}
              </div>
            )}

            {!recordsLoading && !recordsError && attendanceHistory.length > 0 && (
              <div className="space-y-2">
                {attendanceHistory.map((record) => {
                  const incomplete = record.checkInAt && !record.checkOutAt;
                  return (
                    <div
                      key={record.id}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900">{fmtWorkDate(record.workDate, locale)}</p>
                        <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500 font-mono">
                          <span>{t("checkIn")} {fmtTime(record.checkInAt)}</span>
                          <span>{t("checkOut")} {fmtTime(record.checkOutAt)}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-xs font-bold ${incomplete ? "text-rose-600" : "text-slate-700"}`}>
                          {incomplete ? t("checkoutMissing") : formatHourSummary(record.workHours)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {scannerAction && (
        <ScannerModal
          action={scannerAction}
          onScan={handleScan}
          onClose={handleCloseScanner}
        />
      )}

      {resultAction && (
        <AttendanceResultModal
          action={resultAction}
          onConfirm={() => setResultAction(null)}
        />
      )}
    </div>
  );
};
