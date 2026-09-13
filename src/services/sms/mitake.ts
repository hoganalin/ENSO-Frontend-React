// ⛔ 已停用（Phase 3）—— 請勿 import
// 已由 supabase/functions/_shared/mitake.ts 取代。
// 舊版把三竹帳密放在 VITE_ 變數（會被打包進瀏覽器），
// 而且回應解析方式是錯的（三竹回的是 INI 區塊，不是 pipe 分隔字串）。
// src/services/sms/mitake.ts — 三竹 Mitake 簡訊集成
// 文檔: https://sms.mitake.com.tw/

export interface MitakeConfig {
  username: string;
  password: string;
  apiUrl?: string;
}

export interface SendSmsParams {
  phone: string; // 台灣手機號碼（格式: 0912345678）
  message: string; // 簡訊內容（限 160 字以內；若使用繁體中文，限 70 字）
}

export interface SendSmsResult {
  success: boolean;
  statusCode?: string;
  statusMessage?: string;
  msgid?: string; // Mitake 訊息 ID
  phone?: string;
  error?: string;
}

export interface MitakeSmsLog {
  msgid: string;
  phone: string;
  message: string;
  statusCode: string;
  statusMessage: string;
  sent_at: string;
}

class MitakeSmsClient {
  private config: MitakeConfig;
  private apiUrl: string;

  constructor(config: MitakeConfig) {
    this.config = config;
    this.apiUrl = config.apiUrl || 'https://sms.mitake.com.tw/api/SendSMS';
  }

  /**
   * 發送簡訊
   * 文檔: https://sms.mitake.com.tw/api/api_doc.pdf
   */
  async sendSms(params: SendSmsParams): Promise<SendSmsResult> {
    // 驗證參數
    if (!params.phone || !params.message) {
      return {
        success: false,
        error: '電話和簡訊內容不能為空',
      };
    }

    // 驗證台灣手機格式
    const phoneRegex = /^09\d{8}$/;
    if (!phoneRegex.test(params.phone)) {
      return {
        success: false,
        error: '台灣手機號碼格式不正確（應為 09XXXXXXXX）',
      };
    }

    // 檢查簡訊長度
    const messageLength = this.getMessageLength(params.message);
    if (messageLength > 160) {
      return {
        success: false,
        error: `簡訊過長（${messageLength} 字，限 160 字；繁體中文限 70 字）`,
      };
    }

    try {
      // 組合 API 參數
      const formData = new URLSearchParams({
        username: this.config.username,
        password: this.config.password,
        phone: params.phone,
        message: params.message,
        clientid: 'ENSO_INCENSE', // 自訂 Client ID
      });

      // 發送請求
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
        },
        body: formData.toString(),
      });

      // 處理回應
      const text = await response.text();
      const result = this.parseMitakeResponse(text);

      return result;
    } catch (error) {
      return {
        success: false,
        error: `發送失敗: ${error instanceof Error ? error.message : '未知錯誤'}`,
      };
    }
  }

  /**
   * 批量發送簡訊
   */
  async sendSmsBatch(params: SendSmsParams[]): Promise<SendSmsResult[]> {
    return Promise.all(params.map((p) => this.sendSms(p)));
  }

  /**
   * 查詢簡訊狀態（需訊息 ID）
   */
  async querySmsStatus(msgid: string): Promise<{
    statusCode: string;
    statusMessage: string;
    deliveryTime?: string;
  }> {
    try {
      const formData = new URLSearchParams({
        username: this.config.username,
        password: this.config.password,
        msgid,
      });

      const response = await fetch('https://sms.mitake.com.tw/api/QuerySMS', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
        },
        body: formData.toString(),
      });

      const text = await response.text();
      const result = this.parseMitakeResponse(text);

      return {
        statusCode: result.statusCode || 'unknown',
        statusMessage: result.statusMessage || text,
      };
    } catch (error) {
      return {
        statusCode: 'error',
        statusMessage: error instanceof Error ? error.message : '查詢失敗',
      };
    }
  }

  /**
   * 解析 Mitake API 回應
   * 格式: statusCode|statusMessage|msgid
   */
  private parseMitakeResponse(text: string): SendSmsResult {
    const parts = text.split('|');

    const statusCode = parts[0] || '';
    const statusMessage = parts[1] || '';
    const msgid = parts[2] || '';

    // 成功: statusCode = '0'
    if (statusCode === '0') {
      return {
        success: true,
        statusCode,
        statusMessage,
        msgid,
      };
    }

    // 錯誤碼對應表
    const errorMap: Record<string, string> = {
      '1': '帳號或密碼錯誤',
      '2': '訊息格式錯誤',
      '3': '內容過長',
      '4': '電話號碼格式錯誤',
      '5': '訊息內容為空',
      '6': '帳戶餘額不足',
      '7': '發送失敗',
      '8': '伺服器忙碌',
      '9': '未知錯誤',
      '10': '查無此帳號',
      '11': '帳號被鎖定',
      '12': '超過發送限制',
    };

    return {
      success: false,
      statusCode,
      statusMessage: errorMap[statusCode] || statusMessage || '發送失敗',
    };
  }

  /**
   * 計算簡訊長度（考慮繁體中文佔 1.5 字）
   * 實際上 Mitake 的計費是：英數字 1 個字 = 0.625 個單位，繁體中文 1 字 = 1 個單位
   * 但為了安全起見，我們用保守估算
   */
  private getMessageLength(message: string): number {
    let length = 0;
    for (const char of message) {
      const code = char.charCodeAt(0);
      // 繁體中文（U+4E00 ~ U+9FFF）和部分符號
      if ((code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3040 && code <= 0x309f)) {
        length += 2; // 繁體中文算 2 個長度
      } else {
        length += 1;
      }
    }
    return Math.ceil(length / 2); // 保守估算
  }
}

// 全域實例
let mitakeSmsClientInstance: MitakeSmsClient | null = null;

export function getMitakeSmsClient(): MitakeSmsClient {
  if (!mitakeSmsClientInstance) {
    const config: MitakeConfig = {
      username: import.meta.env.VITE_MITAKE_USERNAME || '',
      password: import.meta.env.VITE_MITAKE_PASSWORD || '',
    };

    if (!config.username || !config.password) {
      console.warn('⚠️ Mitake 環境變數未設定，簡訊功能不可用');
    }

    mitakeSmsClientInstance = new MitakeSmsClient(config);
  }

  return mitakeSmsClientInstance;
}

export default MitakeSmsClient;
