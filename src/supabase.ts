import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error(
    "Supabase 환경변수가 누락되었습니다. .env.local 의 VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY 를 확인하세요."
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
