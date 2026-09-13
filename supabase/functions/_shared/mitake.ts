// supabase/functions/_shared/mitake.ts
// 三竹資訊（Mitake）簡訊 HTTP API。
//
// 為什麼搬到伺服器端：舊版 src/services/sms/mitake.ts 把
// VITE_MITAKE_USERNAME / VITE_MITAKE_PASSWORD 放在瀏覽器 —— 凡是 VITE_ 前綴
// 都會被 Vite 打包進 bundle，等於把簡訊帳密公告在網頁原始碼裡，
// 任何人都能拿去發簡訊燒光帳戶點數。
//
// 與舊版的差異（舊版的回應解析是錯的）：
//   • 端點：三竹 API 文件的發送端點是
//     `https://smsapi.mitake.com.tw/api/mtk/SmSend?CharsetURL=UTF8`。
//     舊版寫 `https://sms.mitake.com.tw/api/SendSMS`（那是網頁介面的網域）。
//   • 回應格式是 INI 區塊，不是 `statusCode|msg|msgid` 這種 pipe 分隔：
//       [1]
//       msgid=1010079522
//       statuscode=1
//       AccountPoint=98
//     舊版用 split('|') 解析，永遠拿不到 msgid，也永遠判定失敗。
//   • statuscode 的成功值不是 '0'。0/1/2/4 都代表「已受理」，
//     其中 4 才是「已送達」；其餘（含英文字母）都是錯誤。
//
// ⚠️ 端點網址與參數名稱以三竹提供的 API 文件為準。若貴司的文件版本不同，
// 可用 MITAKE_API_URL 覆寫，不需要改程式碼重新部署。

const DEFAULT_API_URL = "https://smsapi.mitake.com.tw/api/mtk/SmSend";

/** 三竹 statuscode 對照表（依三竹 API 文件）。 */
const STATUS_MESSAGES: Record<string, string> = {
  "0": "預約傳送中",
  "1": "已送出（排程中）",
  "2": "預約已取消",
  "4": "已送達",
  "5": "內容有非法字元",
  "6": "門號不存在或關機",
  "7": "簡訊發送失敗",
  "8": "簡訊發送逾時",
  "9": "簡訊已無效",
  "*": "系統發生錯誤，請聯絡三竹資訊",
  a: "簡訊發送功能暫時停止服務",
  b: "簡訊發送功能暫時停止服務",
  c: "請輸入帳號",
  d: "請輸入密碼",
  e: "帳號、密碼錯誤",
  f: "帳號已過期",
  g: "帳號已被停用",
  h: "無效的連線位址",
  k: "無效的使用者代號",
  m: "請修改密碼",
  n: "密碼已過期",
  p: "沒有權限使用外部程式",
  r: "系統暫停服務，請稍後再試",
  s: "帳務處理失敗，請稍後再試",
  t: "簡訊已過期",
  u: "簡訊內容不得為空白",
  v: "無效的收訊人號碼",
  w: "查無資料",
  x: "發送檔案過大，無法發送",
  y: "參數錯誤",
  z: "查無資料",
};

/** 0/1/2/4 = 三竹已受理；其餘都是失敗。 */
const ACCEPTED_STATUS = new Set(["0", "1", "2", "4"]);

export interface MitakeConfig {
  username: string;
  password: string;
  apiUrl: string;
}

export interface SendSmsResult {
  success: boolean;
  statusCode?: string;
  statusMessage?: string;
  msgid?: string;
  /** 剩餘點數（三竹回傳 AccountPoint），可用來做低點數告警 */
  accountPoint?: number;
  error?: string;
}

export function loadMitakeConfig(): MitakeConfig {
  const username = Deno.env.get("MITAKE_USERNAME") ?? "";
  const password = Deno.env.get("MITAKE_PASSWORD") ?? "";
  const missing = [
    !username && "MITAKE_USERNAME",
    !password && "MITAKE_PASSWORD",
  ].filter(Boolean);
  if (missing.length > 0) {
    throw new Error(`[mitake] 缺少 Supabase secrets：${missing.join(", ")}`);
  }
  return {
    username,
    password,
    apiUrl: Deno.env.get("MITAKE_API_URL") ?? DEFAULT_API_URL,
  };
}

/**
 * 台灣手機號碼正規化：接受 09xxxxxxxx、+8869xxxxxxxx、8869xxxxxxxx，
 * 也接受中間有 `-` 或空白的寫法（使用者最愛這樣填）。
 * 不合法回傳 null —— 讓呼叫端決定要記錄失敗還是跳過。
 */
export function normalizeTaiwanMobile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[\s-()]/g, "");
  if (digits.startsWith("+886")) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith("886")) digits = `0${digits.slice(3)}`;
  return /^09\d{8}$/.test(digits) ? digits : null;
}

/**
 * 單封中文簡訊的「一則」上限是 70 字（英數 160 字）。
 * 超過不會失敗，三竹會切成長簡訊並**按則數計費**，所以只警告不阻擋——
 * 推薦通知漏發比多花 0.7 元嚴重。
 */
function warnIfLong(message: string): void {
  const hasNonAscii = /[^\x20-\x7e]/.test(message);
  const limit = hasNonAscii ? 70 : 160;
  if (message.length > limit) {
    console.warn(
      `[mitake] 簡訊長度 ${message.length} 超過單則上限 ${limit}，將以長簡訊計費`,
    );
  }
}

/**
 * 解析三竹的 INI 格式回應。
 * 只取第一個區塊——我們一次只送一封。
 */
export function parseMitakeResponse(text: string): SendSmsResult {
  const kv: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("[")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim().toLowerCase();
    // 同一個 key 只取第一筆（多筆回應時代表第二封之後，我們不處理）
    if (!(key in kv)) kv[key] = trimmed.slice(idx + 1).trim();
  }

  const statusCode = kv.statuscode ?? "";
  if (!statusCode) {
    return {
      success: false,
      error: `[mitake] 無法解析回應：${text.slice(0, 200)}`,
    };
  }
  const accepted = ACCEPTED_STATUS.has(statusCode);
  const statusMessage = STATUS_MESSAGES[statusCode] ?? `未知狀態碼 ${statusCode}`;
  return {
    success: accepted,
    statusCode,
    statusMessage,
    msgid: kv.msgid || undefined,
    accountPoint: kv.accountpoint ? Number(kv.accountpoint) : undefined,
    error: accepted ? undefined : statusMessage,
  };
}

export interface SendSmsParams {
  /** 台灣手機號碼，會先過 normalizeTaiwanMobile */
  phone: string;
  message: string;
  /** 自訂訊息代號（會原樣回傳，方便對帳）。只能英數字與底線。 */
  clientId?: string;
}

/**
 * 發送單封簡訊。
 *
 * 不丟 exception —— 呼叫端（payment-notify）不能因為簡訊失敗就整個回調失敗，
 * 否則綠界會一直重送、訂單狀態反覆處理。失敗一律回傳 success:false 讓呼叫端寫 log。
 */
export async function sendSms(
  params: SendSmsParams,
  config: MitakeConfig,
): Promise<SendSmsResult> {
  const phone = normalizeTaiwanMobile(params.phone);
  if (!phone) {
    return { success: false, error: `[mitake] 手機號碼格式不正確：${params.phone}` };
  }
  if (!params.message.trim()) {
    return { success: false, error: "[mitake] 簡訊內容不得為空白" };
  }
  warnIfLong(params.message);

  const body = new URLSearchParams({
    username: config.username,
    password: config.password,
    dstaddr: phone,
    smbody: params.message,
  });
  if (params.clientId) body.set("clientid", params.clientId);

  // CharsetURL=UTF8 一定要放在 query string 上：它是在告訴三竹「body 是 UTF-8」，
  // 放進 body 裡三竹讀不到，中文會變亂碼。
  const url = `${config.apiUrl}?CharsetURL=UTF8`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
      },
      body: body.toString(),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await res.text();
    if (!res.ok) {
      return {
        success: false,
        error: `[mitake] HTTP ${res.status}：${text.slice(0, 200)}`,
      };
    }
    return parseMitakeResponse(text);
  } catch (err) {
    return {
      success: false,
      error: `[mitake] 發送失敗：${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
