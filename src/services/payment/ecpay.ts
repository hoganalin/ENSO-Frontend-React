// ⛔ 已停用（Phase 3）—— 請勿 import
// 這支瀏覽器端 ECPay 實作已由 supabase/functions/_shared/ecpay.ts 取代，
// 並且不在 tsconfig.json 的 build 範圍內（有型別錯誤、用了 Node 的 crypto、
// 把 HashKey 放在 client）。除了修掉這些問題之外，新版還修了簽章原文缺欄位名稱、
// NotifyURL 參數不存在、回調欄位名稱錯誤等問題 —— 詳見
// src/services/payment/README.md 的缺陷表。
// 之所以還留著：src/pages/PaymentPage.tsx 仍 import 它。兩者應一起刪除。
// src/services/payment/ecpay.ts — ECPay 支付集成
// 文檔: https://www.ecpay.com.tw/

import crypto from 'crypto';

export interface ECPayConfig {
  merchantId: string;
  hashKey: string;
  hashIv: string;
  isProduction: boolean; // false = 測試環境
}

export interface ECPayPaymentParams {
  orderId: string;
  amount: number; // 新台幣
  itemName: string;
  itemDescription?: string;
  returnUrl: string; // 支付成功返回 URL
  notifyUrl: string; // 伺服器通知 URL
  clientBackUrl?: string; // 使用者返回按鈕
  paymentMethod?: 'Credit' | 'WebATM' | 'CVS' | 'BARCODE'; // 預設提供所有方式
}

export interface ECPayCheckoutResult {
  formHtml: string;
  formData: Record<string, string>;
  paymentUrl: string;
}

class ECPayClient {
  private config: ECPayConfig;

  constructor(config: ECPayConfig) {
    this.config = config;
  }

  /**
   * 生成 CheckMac（簽章）
   * 文檔: https://www.ecpay.com.tw/api_permission/api_doc
   */
  private generateCheckMac(data: Record<string, string>): string {
    // 1. 按參數名稱排序
    const sortedParams = Object.keys(data)
      .sort()
      .map((key) => `${key}=${data[key]}`)
      .join('&');

    // 2. 前後加入 HashKey 和 HashIV
    const checkString = `${this.config.hashKey}&${sortedParams}&${this.config.hashIv}`;

    // 3. URL Encode
    const encoded = encodeURIComponent(checkString).toLowerCase();

    // 4. SHA256 加密
    return crypto.createHash('sha256').update(encoded).digest('hex').toUpperCase();
  }

  /**
   * 產生結帳表單 HTML
   */
  buildCheckoutForm(params: ECPayPaymentParams): ECPayCheckoutResult {
    const baseUrl = this.config.isProduction
      ? 'https://payment.ecpay.com.tw/Cashier/AioCheckOut/V5'
      : 'https://payment-stage.ecpay.com.tw/Cashier/AioCheckOut/V5';

    // 組合 ECPay 必需參數
    const formData: Record<string, string> = {
      MerchantID: this.config.merchantId,
      MerchantTradeNo: params.orderId, // 訂單編號（必須唯一）
      MerchantTradeDate: new Date().toLocaleString('zh-TW', { 
        year: 'numeric', 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit', 
        second: '2-digit', 
        hour12: false 
      }), // 格式: 2024/01/01 12:00:00
      PaymentType: 'aio', // 金流
      TotalAmount: String(Math.round(params.amount)), // 必須是整數
      TradeDesc: params.itemDescription || '線香購物',
      ItemName: params.itemName,
      ReturnURL: params.returnUrl,
      NotifyURL: params.notifyUrl,
      ClientBackURL: params.clientBackUrl || params.returnUrl,
      ChoosePayment: params.paymentMethod || 'ALL', // ALL=提供所有付款方式
      EncryptType: 1, // 1 = SHA256
      PeriodAmount: String(Math.round(params.amount)), // 訂閱時用
      PeriodType: 'M', // 月訂
      Frequency: '1',
    };

    // 生成簽章
    const checkMac = this.generateCheckMac(formData);
    formData.CheckMacValue = checkMac;

    // 生成 HTML 表單（自動提交）
    const formHtml = `
      <html>
        <head>
          <meta charset="UTF-8">
          <title>ECPay 金流</title>
        </head>
        <body onload="document.ecpayForm.submit();">
          <form name="ecpayForm" method="post" action="${baseUrl}">
            ${Object.entries(formData)
              .map(
                ([key, value]) =>
                  `<input type="hidden" name="${key}" value="${this.escapeHtml(String(value))}" />`
              )
              .join('\n')}
            <p>正在導向 ECPay 付款頁面...</p>
            <input type="submit" value="如果頁面未自動跳轉，請點擊這裡" />
          </form>
        </body>
      </html>
    `;

    return {
      formHtml,
      formData,
      paymentUrl: baseUrl,
    };
  }

  /**
   * 驗證通知簽章（伺服器收到 ECPay 回調時使用）
   */
  verifyCheckMac(data: Record<string, string>): boolean {
    const receivedCheckMac = data.CheckMacValue;
    if (!receivedCheckMac) return false;

    // 移除 CheckMacValue，重新計算
    const { CheckMacValue, ...rest } = data;
    const calculatedCheckMac = this.generateCheckMac(rest);

    return receivedCheckMac === calculatedCheckMac;
  }

  /**
   * 驗證付款返回結果
   */
  verifyPaymentResult(data: Record<string, string>): {
    isValid: boolean;
    transactionId?: string;
    orderNo?: string;
    amount?: number;
    paymentMethod?: string;
    message?: string;
  } {
    // 驗證簽章
    if (!this.verifyCheckMac(data)) {
      return { isValid: false, message: '簽章驗證失敗' };
    }

    // 檢查交易狀態
    const tradeStatus = parseInt(data.TradeStatus || '0', 10);
    if (tradeStatus !== 0) {
      return { 
        isValid: false, 
        orderNo: data.MerchantTradeNo,
        message: `交易失敗: ${data.TradeStatusMsg || '未知錯誤'}` 
      };
    }

    return {
      isValid: true,
      transactionId: data.TradeNo, // ECPay 交易 ID
      orderNo: data.MerchantTradeNo,
      amount: parseInt(data.TotalAmount || '0', 10),
      paymentMethod: data.PaymentType,
    };
  }

  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }
}

// 全域實例（懶加載）
let ecpayClientInstance: ECPayClient | null = null;

export function getECPayClient(): ECPayClient {
  if (!ecpayClientInstance) {
    const config: ECPayConfig = {
      merchantId: import.meta.env.VITE_ECPAY_MERCHANT_ID || '',
      hashKey: import.meta.env.VITE_ECPAY_HASH_KEY || '',
      hashIv: import.meta.env.VITE_ECPAY_HASH_IV || '',
      isProduction: import.meta.env.VITE_ECPAY_IS_PRODUCTION === 'true',
    };

    if (!config.merchantId || !config.hashKey || !config.hashIv) {
      console.warn('⚠️ ECPay 環境變數未設定，支付功能不可用');
    }

    ecpayClientInstance = new ECPayClient(config);
  }

  return ecpayClientInstance;
}

export default ECPayClient;
