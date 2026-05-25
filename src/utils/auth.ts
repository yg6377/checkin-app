// ============================================================
// 로그인 ID ↔ Supabase 이메일 변환
// ============================================================
// 사용자는 ID/비밀번호로 로그인하지만 Supabase Auth는 이메일을 요구.
// "가짜 이메일" 패턴으로 변환하여 내부 처리.

export const ADMIN_EMAIL_DOMAIN  = "admin.cm.local";
export const WORKER_EMAIL_DOMAIN = "worker.cm.local";

export type AuthRole = "admin" | "worker";

/** 비숫자 제거 — 전화번호 정규화용 */
function digitsOnly(input: string): string {
  return input.replace(/\D/g, "");
}

/**
 * 관리자 ID를 가짜 이메일로 변환.
 * 입력: "admin01"  → 출력: "admin01@admin.cm.local"
 * 공백·대소문자 정규화 포함.
 */
export function adminIdToEmail(adminId: string): string {
  const local = adminId.trim().toLowerCase();
  if (!local) throw new Error("관리자 ID가 비어 있습니다.");
  if (!/^[a-z0-9_.-]+$/.test(local)) {
    throw new Error("관리자 ID는 영문/숫자/._- 만 사용할 수 있습니다.");
  }
  return `${local}@${ADMIN_EMAIL_DOMAIN}`;
}

/**
 * 근로자 ID(전화번호)를 가짜 이메일로 변환.
 * 입력: "010-1234-5678" → 출력: "01012345678@worker.cm.local"
 */
export function workerIdToEmail(loginId: string): string {
  const local = digitsOnly(loginId);
  if (!local) throw new Error("로그인 ID(전화번호)가 비어 있습니다.");
  return `${local}@${WORKER_EMAIL_DOMAIN}`;
}

/** 역할별로 ID를 이메일로 변환하는 통합 진입점 */
export function loginIdToEmail(id: string, role: AuthRole): string {
  return role === "admin" ? adminIdToEmail(id) : workerIdToEmail(id);
}

/** 이메일에서 역할을 역추적 (RLS 검증과 별개로 UI 표시용) */
export function roleFromEmail(email: string | null | undefined): AuthRole | null {
  if (!email) return null;
  const domain = email.split("@")[1]?.toLowerCase();
  if (domain === ADMIN_EMAIL_DOMAIN)  return "admin";
  if (domain === WORKER_EMAIL_DOMAIN) return "worker";
  return null;
}
