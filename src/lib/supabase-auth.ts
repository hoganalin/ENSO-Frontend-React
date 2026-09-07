// src/lib/supabase-auth.ts
// 🔧 漏洞 4 修復：認證攔截器和授權驗證

import { supabase } from "./supabase";

/**
 * 確保用戶已認證，否則拋出錯誤
 * 用於所有需要授權的 API 調用
 */
export async function requireAuth(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  
  if (error || !data?.session?.user?.id) {
    throw new Error("未授權：用戶未登入或 session 已過期");
  }

  return data.session.user.id;
}

/**
 * 驗證用戶對特定資源的訪問權限
 */
export async function verifyResourceAccess(
  resourceType: "order" | "profile" | "credit",
  resourceId: string,
  userId?: string,
): Promise<boolean> {
  const currentUserId = userId || (await requireAuth());

  switch (resourceType) {
    case "order":
      // 檢查用戶是否是訂單的買家或推薦人
      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("buyer_id, referrer_id")
        .eq("id", resourceId)
        .single();

      if (orderError || !order) return false;
      return (order as any).buyer_id === currentUserId || (order as any).referrer_id === currentUserId;

    case "profile":
      // 用戶只能訪問自己的資料
      return resourceId === currentUserId;

    case "credit":
      // 檢查購物金是否屬於用戶
      const { data: credit, error: creditError } = await supabase
        .from("store_credit_ledger")
        .select("member_id")
        .eq("id", resourceId)
        .single();

      if (creditError || !credit) return false;
      return (credit as any).member_id === currentUserId;

    default:
      return false;
  }
}

/**
 * 安全的 API 調用包裝器，自動驗證認證
 */
export async function secureQuery<T>(
  queryFn: (userId: string) => Promise<T>,
): Promise<T> {
  const userId = await requireAuth();
  return queryFn(userId);
}

/**
 * 檢查 JWT 令牌的有效性
 */
export async function validateJWT(): Promise<boolean> {
  try {
    const { data, error } = await supabase.auth.getSession();
    return !error && !!data?.session?.access_token;
  } catch {
    return false;
  }
}

/**
 * 刷新 JWT 令牌
 */
export async function refreshJWT(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.refreshSession();
    return error ? null : data?.session?.access_token ?? null;
  } catch {
    return null;
  }
}
