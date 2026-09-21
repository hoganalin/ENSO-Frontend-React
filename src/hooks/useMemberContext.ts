// src/hooks/useMemberContext.ts
// 取得目前登入者的會員情境（等級／生日月／已完成訂單數），供活動引擎判定
// 生日禮、首購、回購三類活動。購物車與結帳頁共用，確保兩邊算出同一個金額。
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";

import type { MemberContext } from "@/domain/promotions";
import type { MemberTier } from "@/domain/storeCredit";
import { getMemberContext } from "@/services/db/memberContext";
import type { RootState } from "@/store/store";

export interface MemberContextState {
  /** 載入中為 null；載入完成後至少會有 tier */
  context: MemberContext | null;
  loading: boolean;
}

export function useMemberContext(): MemberContextState {
  const userId = useSelector((state: RootState) => state.auth.user?.id as string | undefined);
  const tier = useSelector(
    (state: RootState) => (state.auth.user?.member_tier ?? "normal") as MemberTier,
  );

  const [context, setContext] = useState<MemberContext | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getMemberContext(userId ?? null, tier)
      .then((ctx) => {
        if (!cancelled) setContext(ctx);
      })
      .catch((error: unknown) => {
        // 取不到情境不該擋住結帳：退回只有等級的情境，
        // 生日／首購／回購類活動會因此不成立（安全的一邊）。
        console.error("[member] 會員情境讀取失敗：", error);
        if (!cancelled) setContext({ tier });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, tier]);

  return { context, loading };
}

export default useMemberContext;
