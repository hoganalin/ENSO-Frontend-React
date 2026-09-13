// src/slice/promoSlice.ts
// 使用者輸入的優惠碼。購物車與結帳頁共用同一份狀態，
// 確保「購物車看到的折扣」與「結帳寫進 DB 的折扣」是同一個 couponCode。
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

interface PromoState {
  /** 已套用的優惠碼；null = 未套用 */
  couponCode: string | null;
}

const initialState: PromoState = {
  couponCode: null,
};

const promoSlice = createSlice({
  name: "promo",
  initialState,
  reducers: {
    setCouponCode: (state, action: PayloadAction<string | null>) => {
      state.couponCode = action.payload;
    },
    clearCouponCode: (state) => {
      state.couponCode = null;
    },
  },
});

export const { setCouponCode, clearCouponCode } = promoSlice.actions;
export default promoSlice.reducer;
