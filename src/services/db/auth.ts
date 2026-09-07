// src/services/db/auth.ts — 註冊 / 登入 / 目前會員（Supabase Auth）
import { supabase } from "@/lib/supabase";

import type { ProfileRow } from "./types";

export interface SignUpParams {
  email: string;
  password: string;
  name?: string;
  phone?: string;
  /** 註冊時帶推薦碼 → 觸發器會自動綁定推薦人（單層、永久固定） */
  referrerCode?: string;
}

/** 註冊。推薦碼放進 user metadata，由 DB 觸發器 handle_new_user 綁定。 */
export async function signUp(params: SignUpParams) {
  const { data, error } = await supabase.auth.signUp({
    email: params.email,
    password: params.password,
    options: {
      data: {
        name: params.name ?? "",
        phone: params.phone ?? "",
        ...(params.referrerCode ? { referrer_code: params.referrerCode } : {}),
      },
    },
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  return data;
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

/** 目前登入者的 profile（含身分、推薦碼）；未登入回傳 null。 */
export async function getCurrentProfile(): Promise<ProfileRow | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  if (error) throw new Error(error.message);
  return data as ProfileRow;
}
