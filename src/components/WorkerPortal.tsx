import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { useApp } from "../context/SupabaseContext";
import type { Html5Qrcode } from "html5-qrcode";
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
} from "lucide-react";

// ============================================================
// 시간 포맷 헬퍼
// ============================================================
function fmtTime(iso: string | null): string {
  if (!iso) return "--:--";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtDateKo(date: Date): string {
  const w = ["일", "월", "화", "수", "목", "금", "토"][date.getDay()];
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일 (${w})`;
}

// ============================================================
// QR 스캐너 모달
// ============================================================
const ScannerModal: React.FC<{
  action: "in" | "out";
  onScan: (code: string) => Promise<void>;
  onClose: () => void;
}> = ({ action, onScan, onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  const scannerElementId = useId().replace(/:/g, "-");
  const [status, setStatus] = useState<"idle" | "scanning" | "processing" | "error">("idle");
  const [error, setError] = useState<string>("");

  useEffect(() => {
    onScanRef.current = onScan;
    onCloseRef.current = onClose;
  }, [onScan, onClose]);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!containerRef.current) return;
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (cancelled || !containerRef.current) return;

        const scanner = new Html5Qrcode(scannerElementId, { verbose: false });
        scannerRef.current = scanner;
        setStatus("scanning");

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 } },
          async (decodedText) => {
            if (cancelled) return;
            setStatus("processing");
            try {
              await scanner.stop();
            } catch {
              // ignore stop errors
            }
            try {
              await onScanRef.current(decodedText);
              if (!cancelled) onCloseRef.current();
            } catch (e: any) {
              if (!cancelled) {
                setStatus("error");
                setError(e?.message || "처리 중 오류가 발생했습니다.");
              }
            }
          },
          () => {
            // 스캔 실패는 무시 (계속 시도)
          }
        );

        if (cancelled) {
          await scanner.stop().catch(() => {});
          scanner.clear();
        }
      } catch (e: any) {
        if (cancelled) return;
        setStatus("error");
        setError(e?.message || "카메라를 시작할 수 없습니다. 권한 설정을 확인하세요.");
      }
    }

    start();

    return () => {
      cancelled = true;
      const s = scannerRef.current;
      if (s) {
        s.stop()
          .catch(() => {})
          .finally(() => {
            s.clear();
          });
      }
    };
  }, [scannerElementId]);

  const isIn = action === "in";

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl">
        <div className={`px-5 py-4 flex items-center justify-between ${isIn ? "bg-emerald-600" : "bg-rose-600"} text-white`}>
          <div>
            <h3 className="text-base font-extrabold flex items-center gap-2">
              {isIn ? <LogIn className="w-5 h-5" /> : <LogOut className="w-5 h-5" />}
              {isIn ? "출근 QR 스캔" : "퇴근 QR 스캔"}
            </h3>
            <p className="text-[11px] opacity-90 mt-0.5">현장 입구의 QR 코드를 카메라에 비춰주세요.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/20">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 bg-black">
          <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-slate-900">
            <div
              id={scannerElementId}
              ref={containerRef}
              className="absolute inset-0"
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
              QR 인식 대기 중...
            </p>
          )}
          {status === "processing" && (
            <p className="flex items-center gap-2 text-slate-600">
              <Clock className="w-4 h-4 animate-spin" />
              처리 중...
            </p>
          )}
          {status === "error" && (
            <div className="flex items-start gap-2 p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="text-[11px]">{error}</span>
            </div>
          )}
          {status === "idle" && <p className="text-slate-500">카메라 권한을 확인하고 있습니다...</p>}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// 근로자 메인 화면
// ============================================================
export const WorkerPortal: React.FC = () => {
  const { user, logout, workers, todayAttendance, submitAttendance, refreshTodayAttendance } = useApp();
  const [scannerAction, setScannerAction] = useState<"in" | "out" | null>(null);
  const [now, setNow] = useState(new Date());
  const [toast, setToast] = useState<string>("");

  // 본인 worker 정보 (workers 배열에서 본인만 RLS 로 보임)
  const me = workers[0];

  // 1초마다 현재 시각 갱신
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // 화면 진입 시 최신 상태로 갱신
  useEffect(() => {
    refreshTodayAttendance();
  }, [refreshTodayAttendance]);

  const checkedIn = !!todayAttendance?.checkInAt;
  const checkedOut = !!todayAttendance?.checkOutAt;

  const handleScan = useCallback(async (code: string) => {
    if (!scannerAction) return;
    await submitAttendance(code, scannerAction);
    setToast(scannerAction === "in" ? "출근이 등록되었습니다." : "퇴근이 등록되었습니다.");
    setTimeout(() => setToast(""), 2500);
  }, [scannerAction, submitAttendance]);

  const handleCloseScanner = useCallback(() => {
    setScannerAction(null);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-stone-100 font-sans flex flex-col">
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-orange-500 p-1.5 rounded-lg">
              <HardHat className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-mono text-slate-400">근로자 모드</p>
              <p className="text-sm font-bold text-slate-900">{me?.name || user?.email}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="text-[11px] text-slate-500 hover:text-rose-600 flex items-center gap-1 font-semibold"
          >
            <LogOut className="w-3 h-3" />
            로그아웃
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-md mx-auto w-full p-4 space-y-4">
        {/* 현재 시각 카드 */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 text-center">
          <p className="text-xs text-slate-500 font-mono">{fmtDateKo(now)}</p>
          <p className="text-5xl font-black tracking-tight text-slate-900 font-mono mt-1">
            {String(now.getHours()).padStart(2, "0")}:{String(now.getMinutes()).padStart(2, "0")}
            <span className="text-xl text-slate-400">:{String(now.getSeconds()).padStart(2, "0")}</span>
          </p>
        </div>

        {/* 오늘 상태 카드 */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">오늘 출퇴근 상태</p>

          <div className="grid grid-cols-2 gap-3">
            <div className={`p-3 rounded-xl border ${checkedIn ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-200"}`}>
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase">
                <LogIn className="w-3 h-3" />
                출근
              </div>
              <p className={`text-xl font-extrabold font-mono mt-1 ${checkedIn ? "text-emerald-700" : "text-slate-300"}`}>
                {fmtTime(todayAttendance?.checkInAt ?? null)}
              </p>
            </div>
            <div className={`p-3 rounded-xl border ${checkedOut ? "bg-rose-50 border-rose-200" : "bg-slate-50 border-slate-200"}`}>
              <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase">
                <LogOut className="w-3 h-3" />
                퇴근
              </div>
              <p className={`text-xl font-extrabold font-mono mt-1 ${checkedOut ? "text-rose-700" : "text-slate-300"}`}>
                {fmtTime(todayAttendance?.checkOutAt ?? null)}
              </p>
            </div>
          </div>

          {checkedIn && checkedOut && (
            <div className="flex items-center gap-2 p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              오늘 일과가 마감되었습니다. 수고하셨습니다.
            </div>
          )}
        </div>

        {/* 출근/퇴근 버튼 */}
        <div className="space-y-3">
          <button
            onClick={() => setScannerAction("in")}
            disabled={checkedIn}
            className="w-full flex items-center justify-center gap-3 p-5 bg-emerald-600 text-white rounded-2xl font-extrabold text-lg shadow-lg hover:bg-emerald-700 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <QrCode className="w-6 h-6" />
            {checkedIn ? "출근 완료됨" : "출근 QR 스캔"}
          </button>
          <button
            onClick={() => setScannerAction("out")}
            disabled={!checkedIn || checkedOut}
            className="w-full flex items-center justify-center gap-3 p-5 bg-rose-600 text-white rounded-2xl font-extrabold text-lg shadow-lg hover:bg-rose-700 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <QrCode className="w-6 h-6" />
            {checkedOut ? "퇴근 완료됨" : "퇴근 QR 스캔"}
          </button>
        </div>

        <p className="text-[11px] text-center text-slate-400 leading-relaxed">
          현장 입구에 부착된 QR 코드를<br />출근 시·퇴근 시 한 번씩 스캔해주세요.
        </p>
      </main>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-slate-900 text-white px-5 py-3 rounded-full shadow-2xl flex items-center gap-2 text-sm font-semibold">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            {toast}
          </div>
        </div>
      )}

      {scannerAction && (
        <ScannerModal
          action={scannerAction}
          onScan={handleScan}
          onClose={handleCloseScanner}
        />
      )}
    </div>
  );
};
