import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../supabase";
import { AllSettings, Worker, Holiday, SettingsHistory } from "../types";
import { calculateWorkedHours } from "../utils/attendanceHours";
import { adminIdToEmail, workerIdToEmail, roleFromEmail, AuthRole } from "../utils/auth";

const LOGIN_MODE_KEY = "checkin-login-mode";
const LOGIN_MODE_SESSION = "session";
const LOGIN_MODE_PERSISTENT = "persistent";

// ============================================================
// DB row ↔ App 타입 어댑터
// ============================================================

function dbToWorker(row: any): Worker {
  return {
    id: row.id,
    workerId: row.worker_id,
    name: row.name,
    englishName: row.english_name || "",
    nationality: row.nationality || "",
    residentNumber: "",  // 평문 미보관 — 수정 시 get_resident_number RPC로 별도 조회
    phone: row.phone,
    address: row.address || "",
    employmentType: row.employment_type,
    contractDate: row.contract_date || "",
    joinDate: row.join_date,
    retireDate: row.retire_date,
    duty: row.duty || "",
    department: row.department || "",
    salarySettings: {
      monthlyBase: Number(row.monthly_base) || 0,
      hourlyRate: Number(row.hourly_rate) || 0,
      dailyRate: Number(row.daily_rate) || 0,
      allowances: {
        meal: row.allowance_meal === null ? null : Number(row.allowance_meal),
        transport: row.allowance_transport === null ? null : Number(row.allowance_transport),
        phone: row.allowance_phone === null ? null : Number(row.allowance_phone),
      },
    },
    deductionSettings: {
      housingFee: Number(row.housing_fee) || 0,
      cashAdvance: Number(row.cash_advance) || 0,
      customDeductions: row.custom_deductions || [],
    },
    bankSettings: {
      bankName: row.bank_name || "",
      accountNo: row.account_no || "",
      holder: row.account_holder || "",
    },
    loginId: row.login_id,
    initialPassword: "", // DB에는 저장하지 않음. 발급 시점에만 사용.
    language: row.language || "ko",
  };
}

function workerToDb(w: Worker | Omit<Worker, "id">) {
  return {
    worker_id: w.workerId,
    name: w.name,
    english_name: w.englishName || null,
    nationality: w.nationality || null,
    // resident_number 는 암호화 RPC(set_resident_number)로만 저장
    phone: w.phone,
    address: w.address || null,
    employment_type: w.employmentType,
    contract_date: w.contractDate || null,
    join_date: w.joinDate,
    retire_date: w.retireDate,
    duty: w.duty || null,
    department: w.department || null,
    monthly_base: w.salarySettings.monthlyBase,
    hourly_rate: w.salarySettings.hourlyRate,
    daily_rate: w.salarySettings.dailyRate,
    allowance_meal: w.salarySettings.allowances.meal,
    allowance_transport: w.salarySettings.allowances.transport,
    allowance_phone: w.salarySettings.allowances.phone,
    housing_fee: w.deductionSettings.housingFee,
    cash_advance: w.deductionSettings.cashAdvance,
    custom_deductions: w.deductionSettings.customDeductions,
    bank_name: w.bankSettings.bankName || null,
    account_no: w.bankSettings.accountNo || null,
    account_holder: w.bankSettings.holder || w.name,
    login_id: w.loginId,
    language: w.language,
  };
}

function dbToHoliday(row: any): Holiday {
  return { id: row.id, date: row.date, name: row.name, type: row.type };
}

function dbToHistory(row: any): SettingsHistory {
  return {
    id: row.id,
    timestamp: { seconds: row.changed_at ? Math.floor(new Date(row.changed_at).getTime() / 1000) : 0 },
    changedBy: row.changed_by_email || "system",
    category: row.category,
    action: row.action,
    label: row.label,
    fromValue: row.from_value,
    toValue: row.to_value,
  };
}

// ============================================================
// Context
// ============================================================

interface AppContextType {
  user: User | null;
  role: AuthRole | null;
  loading: boolean;
  settings: AllSettings | null;
  workers: Worker[];
  holidays: Holiday[];
  history: SettingsHistory[];

  // 근로자 전용: 본인 오늘 출퇴근 상태
  todayAttendance: TodayAttendance | null;

  loginWithId: (id: string, password: string, role: AuthRole, rememberMe: boolean) => Promise<void>;
  logout: () => Promise<void>;

  updateSetting: (category: keyof AllSettings, newValues: any) => Promise<void>;
  addWorker: (worker: Omit<Worker, "id">) => Promise<WorkerCredentials>;
  updateWorker: (id: string, worker: Worker) => Promise<void>;
  deleteWorker: (id: string) => Promise<void>;
  resetWorkerPassword: (workerId: string, newPassword?: string) => Promise<WorkerCredentials>;
  fetchResidentNumber: (workerId: string) => Promise<string>;
  addHoliday: (holiday: Omit<Holiday, "id">) => Promise<void>;
  deleteHoliday: (id: string) => Promise<void>;

  // QR 출퇴근
  regenerateSiteCheckinCode: () => Promise<string>;
  submitAttendance: (scannedCode: string, action: "in" | "out") => Promise<void>;
  refreshTodayAttendance: () => Promise<void>;

  // 근태 조회
  fetchAttendance: (q: AttendanceQuery) => Promise<AttendanceRecord[]>;
  upsertAttendanceByAdmin: (input: AdminAttendanceInput) => Promise<void>;
}

export interface WorkerCredentials {
  email: string;
  password: string;
  passwordGenerated: boolean;
}

export interface TodayAttendance {
  id: string | null;
  workDate: string;
  checkInAt: string | null;
  checkOutAt: string | null;
}

export interface AttendanceRecord {
  id: string;
  workerId: string;        // workers.id
  workerCode: string;      // workers.worker_id (사번)
  workerName: string;
  workDate: string;        // YYYY-MM-DD
  checkInAt: string | null;
  checkOutAt: string | null;
  status: string;
  workHours: number;       // 계산값 (시간 단위)
}

export interface AttendanceQuery {
  fromDate: string;        // YYYY-MM-DD
  toDate: string;          // YYYY-MM-DD
  workerId?: string;       // workers.id (없으면 전체)
}

export interface AdminAttendanceInput {
  workerId: string;
  workDate: string;        // YYYY-MM-DD
  checkInAt: string | null;
  checkOutAt: string | null;
  status?: "normal" | "late" | "early_leave" | "absent" | "holiday_work";
  note?: string | null;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const SupabaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<AuthRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<AllSettings | null>(null);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [history, setHistory] = useState<SettingsHistory[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<TodayAttendance | null>(null);

  // ─── Auth ──────────────────────────────────────────────
  const loginWithId = async (id: string, password: string, asRole: AuthRole, rememberMe: boolean) => {
    const email = asRole === "admin" ? adminIdToEmail(id) : workerIdToEmail(id);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(translateAuthError(error.message));

    if (typeof window !== "undefined") {
      const mode = rememberMe ? LOGIN_MODE_PERSISTENT : LOGIN_MODE_SESSION;
      window.localStorage.setItem(LOGIN_MODE_KEY, mode);
      window.sessionStorage.setItem(LOGIN_MODE_KEY, mode);
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(LOGIN_MODE_KEY);
      window.sessionStorage.removeItem(LOGIN_MODE_KEY);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const session = data.session;

      if (typeof window !== "undefined") {
        const savedMode = window.localStorage.getItem(LOGIN_MODE_KEY);
        const liveMode = window.sessionStorage.getItem(LOGIN_MODE_KEY);

        if (session && savedMode === LOGIN_MODE_SESSION && liveMode !== LOGIN_MODE_SESSION) {
          await supabase.auth.signOut();
          window.localStorage.removeItem(LOGIN_MODE_KEY);
          setUser(null);
          setRole(null);
          setLoading(false);
          return;
        }

        if (savedMode && !liveMode) {
          window.sessionStorage.setItem(LOGIN_MODE_KEY, savedMode);
        }
      }

      setUser(session?.user ?? null);
      setRole(roleFromEmail(session?.user?.email));
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setRole(roleFromEmail(session?.user?.email));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // ─── Data loaders ──────────────────────────────────────
  const loadSettings = useCallback(async () => {
    const { data, error } = await supabase.from("settings").select("category, data");
    if (error) {
      console.error("settings load error:", error);
      return;
    }
    const map: any = {};
    data?.forEach((row: any) => {
      map[row.category] = row.data;
    });
    setSettings(map as AllSettings);
  }, []);

  const loadWorkers = useCallback(async () => {
    const { data, error } = await supabase
      .from("workers")
      .select("*")
      .order("worker_id", { ascending: true });
    if (error) {
      console.error("workers load error:", error);
      return;
    }
    setWorkers((data || []).map(dbToWorker));
  }, []);

  const loadHolidays = useCallback(async () => {
    const { data, error } = await supabase
      .from("holidays")
      .select("*")
      .order("date", { ascending: true });
    if (error) {
      console.error("holidays load error:", error);
      return;
    }
    setHolidays((data || []).map(dbToHoliday));
  }, []);

  const loadHistory = useCallback(async () => {
    const { data, error } = await supabase
      .from("settings_history")
      .select("*")
      .order("changed_at", { ascending: false })
      .limit(200);
    if (error) {
      // 근로자는 settings_history 조회 권한 없음 — 무시
      if (error.code !== "PGRST301" && !error.message.toLowerCase().includes("permission")) {
        console.error("history load error:", error);
      }
      setHistory([]);
      return;
    }
    setHistory((data || []).map(dbToHistory));
  }, []);

  useEffect(() => {
    if (!user) {
      setSettings(null);
      setWorkers([]);
      setHolidays([]);
      setHistory([]);
      return;
    }
    loadSettings();
    loadWorkers();
    loadHolidays();
    loadHistory();
  }, [user, loadSettings, loadWorkers, loadHolidays, loadHistory]);

  // ─── Audit log helper ──────────────────────────────────
  const logHistory = async (args: {
    category: string;
    action: "create" | "update" | "delete";
    label: string;
    fromValue: any;
    toValue: any;
  }) => {
    await supabase.from("settings_history").insert({
      changed_by: user?.id ?? null,
      changed_by_email: user?.email ?? null,
      category: args.category,
      action: args.action,
      label: args.label,
      from_value: args.fromValue,
      to_value: args.toValue,
    });
  };

  // ─── Settings ──────────────────────────────────────────
  const updateSetting = async (category: keyof AllSettings, newValues: any) => {
    if (!user) return;
    const prev = settings ? settings[category] : {};

    const { error } = await supabase
      .from("settings")
      .update({ data: newValues, updated_by: user.id })
      .eq("category", category);
    if (error) throw error;

    await logHistory({
      category: String(category),
      action: "update",
      label: `${String(category)} 설정이 관리자에 의해 변경되었습니다.`,
      fromValue: prev,
      toValue: newValues,
    });
    await loadSettings();
    await loadHistory();
  };

  // ─── Workers ───────────────────────────────────────────
  const addWorker = async (worker: Omit<Worker, "id">): Promise<WorkerCredentials> => {
    if (!user) throw new Error("로그인이 필요합니다.");

    const { data, error } = await supabase.rpc("create_worker_with_account", {
      // resident_number 는 RPC 내부에서 암호화 처리
      worker_data: { ...workerToDb(worker), resident_number: worker.residentNumber || null },
      initial_password: worker.initialPassword || null,
    });
    if (error) throw new Error(translateRpcError(error.message));

    await logHistory({
      category: "worker",
      action: "create",
      label: `신규 근로자 등록: 사번 ${worker.workerId} [${worker.name}]`,
      fromValue: {},
      toValue: { name: worker.name, employmentType: worker.employmentType },
    });
    await loadWorkers();
    await loadHistory();

    return {
      email: data.email,
      password: data.password,
      passwordGenerated: data.password_generated,
    };
  };

  const resetWorkerPassword = async (
    workerId: string,
    newPassword?: string
  ): Promise<WorkerCredentials> => {
    if (!user) throw new Error("로그인이 필요합니다.");

    const { data, error } = await supabase.rpc("reset_worker_password", {
      p_worker_id: workerId,
      new_password: newPassword || null,
    });
    if (error) throw new Error(translateRpcError(error.message));

    const target = workers.find((w) => w.id === workerId);
    await logHistory({
      category: "worker",
      action: "update",
      label: `근로자 비밀번호 재발급: [${target?.name || workerId}]`,
      fromValue: {},
      toValue: { passwordReset: true },
    });
    await loadHistory();

    return {
      email: target ? `${target.loginId.replace(/\D/g, "")}@worker.cm.local` : "",
      password: data.password,
      passwordGenerated: data.password_generated,
    };
  };

  const updateWorker = async (id: string, worker: Worker) => {
    if (!user) return;
    const { error } = await supabase
      .from("workers")
      .update(workerToDb(worker))
      .eq("id", id);
    if (error) throw error;

    // 주민등록번호는 암호화 RPC로 별도 저장
    if (worker.residentNumber !== undefined) {
      const { error: rpcErr } = await supabase.rpc("set_resident_number", {
        p_worker_id: id,
        p_resident_number: worker.residentNumber || "",
      });
      if (rpcErr) throw new Error(translateRpcError(rpcErr.message));
    }

    await logHistory({
      category: "worker",
      action: "update",
      label: `근로자 정보 수정: 사번 ${worker.workerId} [${worker.name}]`,
      fromValue: {},
      toValue: { name: worker.name, employmentType: worker.employmentType },
    });
    await loadWorkers();
    await loadHistory();
  };

  const fetchResidentNumber = async (workerId: string): Promise<string> => {
    const { data, error } = await supabase.rpc("get_resident_number", {
      p_worker_id: workerId,
    });
    if (error) throw new Error(translateRpcError(error.message));
    return (data as string) || "";
  };

  const deleteWorker = async (id: string) => {
    if (!user) return;
    const target = workers.find((w) => w.id === id || w.workerId === id);
    const { error } = await supabase.from("workers").delete().eq("id", id);
    if (error) throw error;

    await logHistory({
      category: "worker",
      action: "delete",
      label: `근로자 등록 해제: [${target?.name || "알수없음"}]`,
      fromValue: { name: target?.name },
      toValue: {},
    });
    await loadWorkers();
    await loadHistory();
  };

  // ─── QR 출퇴근 ─────────────────────────────────────────
  const refreshTodayAttendance = useCallback(async () => {
    if (!user) {
      setTodayAttendance(null);
      return;
    }
    // 관리자라면 굳이 fetch 하지 않음
    if (roleFromEmail(user.email) !== "worker") {
      setTodayAttendance(null);
      return;
    }
    const today = new Date();
    const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    const { data, error } = await supabase
      .from("attendance")
      .select("id, work_date, check_in_at, check_out_at")
      .eq("work_date", ymd)
      .maybeSingle();

    if (error) {
      console.error("todayAttendance load error:", error);
      setTodayAttendance({ id: null, workDate: ymd, checkInAt: null, checkOutAt: null });
      return;
    }
    setTodayAttendance(
      data
        ? {
            id: data.id,
            workDate: data.work_date,
            checkInAt: data.check_in_at,
            checkOutAt: data.check_out_at,
          }
        : { id: null, workDate: ymd, checkInAt: null, checkOutAt: null }
    );
  }, [user]);

  useEffect(() => {
    refreshTodayAttendance();
  }, [user, refreshTodayAttendance]);

  const regenerateSiteCheckinCode = async (): Promise<string> => {
    if (!user) throw new Error("로그인이 필요합니다.");
    const { data, error } = await supabase.rpc("regenerate_site_checkin_code");
    if (error) throw new Error(translateRpcError(error.message));

    await logHistory({
      category: "site",
      action: "update",
      label: "현장 출퇴근 QR 코드가 재발급되었습니다.",
      fromValue: { checkinCode: settings?.site && (settings.site as any).checkinCode },
      toValue: { checkinCode: data },
    });
    await loadSettings();
    await loadHistory();
    return data as string;
  };

  const submitAttendance = async (scannedCode: string, action: "in" | "out") => {
    if (!user) throw new Error("로그인이 필요합니다.");
    const { error } = await supabase.rpc("submit_attendance", {
      scanned_code: scannedCode,
      action,
    });
    if (error) throw new Error(translateRpcError(error.message));
    await refreshTodayAttendance();
  };

  const fetchAttendance = async (q: AttendanceQuery): Promise<AttendanceRecord[]> => {
    if (!user) return [];
    let query = supabase
      .from("attendance")
      .select("id, worker_id, work_date, check_in_at, check_out_at, status, worker:workers(worker_id, name)")
      .gte("work_date", q.fromDate)
      .lte("work_date", q.toDate)
      .order("work_date", { ascending: false })
      .order("check_in_at", { ascending: false });

    if (q.workerId) {
      query = query.eq("worker_id", q.workerId);
    }

    const { data, error } = await query;
    if (error) {
      console.error("fetchAttendance error:", error);
      throw new Error(translateRpcError(error.message));
    }

    return (data || []).map((row: any) => {
      const workHours = calculateWorkedHours(
        row.check_in_at,
        row.check_out_at,
        settings?.workTime
      );
      return {
        id: row.id,
        workerId: row.worker_id,
        workerCode: row.worker?.worker_id || "",
        workerName: row.worker?.name || "",
        workDate: row.work_date,
        checkInAt: row.check_in_at,
        checkOutAt: row.check_out_at,
        status: row.status,
        workHours: Math.max(0, workHours),
      };
    });
  };

  const upsertAttendanceByAdmin = async (input: AdminAttendanceInput) => {
    if (!user) throw new Error("로그인이 필요합니다.");

    const { data: existing, error: fetchError } = await supabase
      .from("attendance")
      .select("id, check_in_at, check_out_at, status, note")
      .eq("worker_id", input.workerId)
      .eq("work_date", input.workDate)
      .maybeSingle();
    if (fetchError) throw new Error(translateRpcError(fetchError.message));

    const payload = {
      worker_id: input.workerId,
      work_date: input.workDate,
      check_in_at: input.checkInAt,
      check_out_at: input.checkOutAt,
      status: input.status || (input.checkInAt ? "normal" : "absent"),
      note: input.note ?? "관리자 수동 입력",
    };

    const { error } = await supabase
      .from("attendance")
      .upsert(payload, { onConflict: "worker_id,work_date" });
    if (error) throw new Error(translateRpcError(error.message));

    await logHistory({
      category: "attendance",
      action: existing ? "update" : "create",
      label: `관리자 출퇴근 ${existing ? "수정" : "등록"}: ${input.workDate}`,
      fromValue: existing || {},
      toValue: payload,
    });
    await loadHistory();
  };

  // ─── Holidays ──────────────────────────────────────────
  const addHoliday = async (holiday: Omit<Holiday, "id">) => {
    if (!user) return;
    const { error } = await supabase.from("holidays").insert(holiday);
    if (error) throw error;

    await logHistory({
      category: "holidays",
      action: "create",
      label: `신규 휴일 추가: ${holiday.date} (${holiday.name})`,
      fromValue: {},
      toValue: holiday,
    });
    await loadHolidays();
    await loadHistory();
  };

  const deleteHoliday = async (id: string) => {
    if (!user) return;
    const target = holidays.find((h) => h.id === id);
    const { error } = await supabase.from("holidays").delete().eq("id", id);
    if (error) throw error;

    await logHistory({
      category: "holidays",
      action: "delete",
      label: `지정 휴일 삭제: ${target?.date || ""} (${target?.name || ""})`,
      fromValue: { name: target?.name },
      toValue: {},
    });
    await loadHolidays();
    await loadHistory();
  };

  return (
    <AppContext.Provider
      value={{
        user,
        role,
        loading,
        settings,
        workers,
        holidays,
        history,
        loginWithId,
        logout,
        todayAttendance,
        updateSetting,
        addWorker,
        updateWorker,
        deleteWorker,
        resetWorkerPassword,
        fetchResidentNumber,
        addHoliday,
        deleteHoliday,
        regenerateSiteCheckinCode,
        submitAttendance,
        refreshTodayAttendance,
        fetchAttendance,
        upsertAttendanceByAdmin,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within SupabaseProvider");
  return ctx;
};

// 기존 컴포넌트 호환용 별칭
export const useFirebase = useApp;
export const FirebaseProvider = SupabaseProvider;

// ============================================================
// 에러 메시지 한글화
// ============================================================
function translateRpcError(msg: string): string {
  // Postgres RAISE EXCEPTION 메시지는 그대로 한글로 반환됨.
  // 그 외 Supabase 내부 에러만 다듬는다.
  if (!msg) return "알 수 없는 오류가 발생했습니다.";
  return msg.replace(/^.*?:\s*/, "").trim();
}

function translateAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "ID 또는 비밀번호가 올바르지 않습니다.";
  if (m.includes("email not confirmed")) return "이메일 확인이 필요합니다. 관리자에게 문의하세요.";
  if (m.includes("too many requests")) return "로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.";
  return msg;
}
