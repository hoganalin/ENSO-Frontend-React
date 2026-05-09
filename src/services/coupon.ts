import { api, API_PATH } from "./api";

/**
 * 前台：套用優惠券
 * @param code 優惠券代碼
 */
export const applyCouponApi = (code: string) => {
  return api.post(`/api/${API_PATH}/coupon`, {
    data: {
      code,
    },
  });
};
