import React, { useState } from "react";
import { SupabaseProvider, useApp } from "./context/SupabaseContext";
import { WorkerTab } from "./components/WorkerTab";
import { SettingsTab } from "./components/SettingsTab";
import { SimulatorTab } from "./components/SimulatorTab";
import { AttendanceTab } from "./components/AttendanceTab";
import { ExpiryTab } from "./components/ExpiryTab";
import { WorkerPortal } from "./components/WorkerPortal";
import { AuthRole } from "./utils/auth";
import { LanguageProvider, languageOptions, useLanguage } from "./i18n";
import {
  Users,
  Settings as SettingsIcon,
  Calculator,
  CalendarRange,
  BellRing,
  LogOut,
  MapPin,
  Clock,
  ShieldCheck,
  Unlock,
  Construction,
  HardHat,
  ArrowLeft,
  AlertCircle,
} from "lucide-react";

// ============================================================
// 로그인 게이트
// ============================================================

const LoginGate: React.FC = () => {
  const { loginWithId } = useApp();
  const { language, setLanguage, t } = useLanguage();
  const [selectedRole, setSelectedRole] = useState<AuthRole | null>(null);
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) return;
    setError("");
    setSubmitting(true);
    try {
      await loginWithId(id, password, selectedRole, rememberMe);
    } catch (err: any) {
      setError(err.message || t("loginFailed"));
    } finally {
      setSubmitting(false);
    }
  };

  // 역할 선택 화면
  if (!selectedRole) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-stone-100 flex items-center justify-center p-4 font-sans select-none">
        <div className="bg-white rounded-3xl border border-gray-200/80 p-8 sm:p-10 max-w-md w-full shadow-2xl space-y-8 text-center relative overflow-hidden">
          <div className="absolute top-0 inset-x-0 h-2.5 bg-gray-900"></div>

          <div className="mx-auto bg-stone-50 w-16 h-16 rounded-2xl flex items-center justify-center border border-gray-200 shadow-sm">
            <Construction className="w-8 h-8 text-gray-800" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-black text-gray-900 tracking-tight">{t("systemTitle")}</h1>
            <p className="text-xs text-gray-500 max-w-xs mx-auto leading-relaxed">
              {t("chooseLoginMethod")}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3">
            <button
              onClick={() => setSelectedRole("admin")}
              className="group flex items-center gap-4 p-4 bg-slate-900 text-white rounded-xl border border-slate-800 hover:bg-slate-800 transition shadow-lg hover:shadow-xl active:scale-[0.99]"
            >
              <div className="bg-blue-600 p-2.5 rounded-lg border border-blue-500">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div className="text-left flex-1">
                <p className="text-sm font-bold">{t("adminLogin")}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">{t("adminLoginDesc")}</p>
              </div>
              <Unlock className="w-4 h-4 text-slate-400 group-hover:text-white transition" />
            </button>

            <button
              onClick={() => setSelectedRole("worker")}
              className="group flex items-center gap-4 p-4 bg-white text-slate-900 rounded-xl border border-slate-200 hover:border-slate-400 hover:bg-slate-50 transition shadow-sm"
            >
              <div className="bg-orange-500 p-2.5 rounded-lg border border-orange-400">
                <HardHat className="w-5 h-5 text-white" />
              </div>
              <div className="text-left flex-1">
                <p className="text-sm font-bold">{t("workerLogin")}</p>
                <p className="text-[11px] text-slate-500 mt-0.5">{t("workerLoginDesc")}</p>
              </div>
              <Unlock className="w-4 h-4 text-slate-400 group-hover:text-slate-900 transition" />
            </button>
          </div>

          <div className="max-w-[180px] mx-auto text-left">
            <label className="block text-[10px] font-semibold text-gray-500 mb-1.5">
              {t("languageSelect")}
            </label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as typeof language)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white text-slate-700 focus:outline-none focus:border-slate-400"
            >
              {languageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    );
  }

  // 로그인 폼
  const isAdmin = selectedRole === "admin";
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-stone-100 flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-3xl border border-gray-200/80 p-8 sm:p-10 max-w-md w-full shadow-2xl space-y-6 relative overflow-hidden">
        <div className={`absolute top-0 inset-x-0 h-2.5 ${isAdmin ? "bg-slate-900" : "bg-orange-500"}`}></div>

        <button
          onClick={() => {
            setSelectedRole(null);
            setId("");
            setPassword("");
            setRememberMe(true);
            setError("");
          }}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900 transition"
        >
          <ArrowLeft className="w-3 h-3" />
          {t("backToRoleSelection")}
        </button>

        <div className="text-center space-y-2">
          <div className={`mx-auto w-14 h-14 rounded-2xl flex items-center justify-center border ${isAdmin ? "bg-slate-50 border-slate-200" : "bg-orange-50 border-orange-200"}`}>
            {isAdmin ? <ShieldCheck className="w-7 h-7 text-slate-800" /> : <HardHat className="w-7 h-7 text-orange-600" />}
          </div>
          <h2 className="text-xl font-black text-gray-900">
            {isAdmin ? t("adminLoginTitle") : t("workerLoginTitle")}
          </h2>
          <p className="text-xs text-gray-500">
            {isAdmin ? t("adminLoginHint") : t("workerLoginHint")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              {isAdmin ? t("adminIdLabel") : t("workerPhoneLabel")}
            </label>
            <input
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value)}
              placeholder={isAdmin ? t("adminIdPlaceholder") : t("workerPhonePlaceholder")}
              autoComplete="username"
              autoFocus
              required
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-base md:text-sm font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">{t("password")}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-base md:text-sm font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600 select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
            />
            {t("rememberMe")}
          </label>

          {error && (
            <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className={`w-full flex items-center justify-center gap-2 font-bold text-sm py-3 px-4 rounded-xl border transition shadow-lg hover:shadow-xl active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed ${
              isAdmin
                ? "bg-slate-900 text-white border-transparent hover:bg-slate-800"
                : "bg-orange-500 text-white border-transparent hover:bg-orange-600"
            }`}
          >
            <Unlock className="w-4 h-4" />
            {submitting ? t("loggingIn") : t("login")}
          </button>
        </form>
      </div>
    </div>
  );
};

// ============================================================
// 관리자 포털 (기존 3개 탭)
// ============================================================

const AdminPortal: React.FC = () => {
  const { user, logout, settings } = useApp();
  const [activeTab, setActiveTab] = useState<"workers" | "attendance" | "expiry" | "rules" | "simulator">("workers");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col justify-between">
      <header className="bg-slate-900 border-b border-slate-950 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg border border-blue-500 shrink-0">
              <Construction className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono font-bold bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                  {settings?.site?.companyName || "공유 시공단"}
                </span>
                <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-800 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" /> SUPABASE RLS
                </span>
                <span className="text-[10px] font-mono font-semibold text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700">
                  v{__APP_VERSION__}
                </span>
              </div>
              <h2 className="text-sm font-extrabold tracking-tight text-white mt-0.5">
                현장 노무 & 급여 정책 관리 시스템 (Workforce Core v{__APP_VERSION__})
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 md:justify-end">
            {settings?.site?.siteLocation && (
              <div className="bg-slate-850 p-2 px-3 rounded-lg border border-slate-700 text-[10px] font-mono text-slate-300 space-y-0.5 shadow-inner">
                <p className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-blue-400" />
                  <strong>현장좌표:</strong> {settings.site.siteLocation.lat}, {settings.site.siteLocation.lng}
                </p>
                <p>
                  <strong>인가 반경:</strong> {settings.site.allowedRadius}m / <strong>급여지급:</strong> 매월 {settings.site.paymentDay}일
                </p>
              </div>
            )}

            <div className="bg-slate-850 p-2 px-3.5 rounded-lg border border-slate-700 text-[10px] text-right space-y-0.5 flex flex-col items-center md:items-end">
              <p className="font-bold text-slate-205 font-mono text-center md:text-right">{user?.email}</p>
              <button
                onClick={logout}
                className="w-full md:w-auto text-[10px] text-rose-400 font-extrabold hover:underline flex items-center justify-center gap-1 cursor-pointer bg-transparent border-0"
              >
                <LogOut className="w-3 h-3" /> 로그아웃
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="bg-slate-100 border-b border-slate-200 py-1.5 select-none shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex bg-slate-200 p-0.5 w-full sm:w-fit rounded-lg border border-slate-300 gap-1">
            <button
              onClick={() => setActiveTab("workers")}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                activeTab === "workers"
                  ? "bg-white text-blue-700 shadow border-b-2 border-blue-600 font-black"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              근로자 계약 관리
            </button>

            <button
              onClick={() => setActiveTab("attendance")}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                activeTab === "attendance"
                  ? "bg-white text-blue-700 shadow border-b-2 border-blue-600 font-black"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
              }`}
            >
              <CalendarRange className="w-3.5 h-3.5" />
              근태 기록
            </button>

            <button
              onClick={() => setActiveTab("expiry")}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                activeTab === "expiry"
                  ? "bg-white text-blue-700 shadow border-b-2 border-blue-600 font-black"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
              }`}
            >
              <BellRing className="w-3.5 h-3.5" />
              만료 관리
            </button>

            <button
              onClick={() => setActiveTab("rules")}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                activeTab === "rules"
                  ? "bg-white text-blue-700 shadow border-b-2 border-blue-600 font-black"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
              }`}
            >
              <SettingsIcon className="w-3.5 h-3.5" />
              글로벌 가산 운영 규칙
            </button>

            <button
              onClick={() => setActiveTab("simulator")}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                activeTab === "simulator"
                  ? "bg-white text-blue-700 shadow border-b-2 border-blue-600 font-black"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
              }`}
            >
              <Calculator className="w-3.5 h-3.5" />
              급여/공수 모의 계산기
            </button>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex-1 w-full">
        {activeTab === "workers" && <WorkerTab />}
        {activeTab === "attendance" && <AttendanceTab />}
        {activeTab === "expiry" && <ExpiryTab />}
        {activeTab === "rules" && <SettingsTab />}
        {activeTab === "simulator" && <SimulatorTab />}
      </main>

      <footer className="border-t border-slate-200 bg-white py-4 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 text-center space-y-1">
          <p className="text-[10px] text-slate-400 font-mono">
            &copy; {new Date().getFullYear()} CM건설 Workforce & Payroll Registry Portal.
          </p>
          <p className="text-[9px] text-slate-400 italic max-w-lg mx-auto">
            * 본 서비스는 하드코딩 요율을 지양하고 모든 근로세, 4대보험, 할증가중치를 Supabase Postgres에서 실시간 제어하는 설정 지향형 아키텍처 법령 준주 버전입니다.
          </p>
        </div>
      </footer>
    </div>
  );
};

// ============================================================
// 루트
// ============================================================

function AppContent() {
  const { user, role, loading } = useApp();
  const { t } = useLanguage();

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-50 flex flex-col items-center justify-center font-sans">
        <div className="p-8 bg-white rounded-2xl border border-gray-150 shadow-xl flex flex-col items-center space-y-4 max-w-sm text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-950"></div>
          <div>
            <h3 className="text-base font-bold text-gray-900">{t("sessionChecking")}</h3>
            <p className="text-xs text-gray-400 mt-1">{t("syncingAuth")}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) return <LoginGate />;
  if (role === "worker") return <WorkerPortal />;
  return <AdminPortal />;
}

export default function App() {
  return (
    <LanguageProvider>
      <SupabaseProvider>
        <AppContent />
      </SupabaseProvider>
    </LanguageProvider>
  );
}
