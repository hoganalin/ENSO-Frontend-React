// src/services/db/memberContext.ts
// 取得活動引擎需要的「會員情境」：等級、生日月、已完成訂單數。
//
// 為什麼要這支：生日禮／首購／回購三類活動的成立條件不在購物車裡，
// 而在買家身上。結帳與購物車試算都需要同一份情境，所以集中在這裡取，
// 避免兩邊算法不一致（那是上次金額對不上的同一個坑）。
import type { MemberContext } from "@/domain/promotions";
import type { MemberTier } from "@/domain/storeCredit";
import { supabase } from "@/lib/supabase";

/** 訂單計入「已完成訂單數」的狀態。與報表的營收狀態一致。 */
const COUNTED_STATUSES = ["paid", "shipped", "completed"];

/**
 * 取得買家的會員情境。
 *
 * 取不到的欄位一律留 undefined —— 引擎看到 undefined 會讓對應活動不成立，
 * 這比猜一個值安全（不知道生日就不送生日禮）。
 *
 * @param buyerId 未登入時傳 null，會退回只有 tier 的情境
 */
export async function getMemberContext(
  buyerId: string | null,
  fallbackTier: MemberTier = "normal",
): Promise<MemberContext> {
  if (!buyerId) return { tier: fallbackTier };

  const [profileRes, orderRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("member_tier, birthday, referrer_id")
      .eq("id", buyerId)
      .single(),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("buyer_id", buyerId)
      .in("status", COUNTED_STATUSES),
  ]);

  if (profileRes.error) {
    console.error("[member] profile 讀取失敗：", profileRes.error.message);
    return { tier: fallbackTier };
  }

  const profile = profileRes.data as {
    member_tier: MemberTier;
    birthday: string | null;
    referrer_id: string | null;
  };

  // count 查詢失敗時留 undefined，而不是當成 0 ——
  // 當成 0 會讓所有人都拿到首購優惠。
  const completedOrderCount =
    orderRes.error || orderRes.count === null || orderRes.count === undefined
      ? undefined
      : orderRes.count;

  if (orderRes.error) {
    console.error("[member] 訂單數讀取失敗：", orderRes.error.message);
  }

  return {
    tier: profile.member_tier ?? fallbackTier,
    birthdayMonth: birthdayMonthOf(profile.birthday),
    completedOrderCount,
    // 沒有推薦人時 DB 是 null，這裡一律轉成 undefined ——
    // 引擎只認 undefined 為「不知道／沒有」，讓「指定推薦人」活動不成立。
    // 注意 profile 讀取失敗的那條路（上面的 early return）也只回 tier，
    // 同樣讓這類活動不成立，不會因為讀不到就誤放行。
    referrerId: profile.referrer_id ?? undefined,
  };
}

/** 'YYYY-MM-DD' → 月份 1-12；沒填或格式不對回 undefined。 */
export function birthdayMonthOf(birthday: string | null | undefined): number | undefined {
  if (!birthday) return undefined;
  // 直接取字串的月份段，避免時區把 1 日的生日推到前一個月
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthday);
  if (match) {
    const month = Number(match[2]);
    return month >= 1 && month <= 12 ? month : undefined;
  }
  const d = new Date(birthday);
  return Number.isNaN(d.getTime()) ? undefined : d.getMonth() + 1;
}
