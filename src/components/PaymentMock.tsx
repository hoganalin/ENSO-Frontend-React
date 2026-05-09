import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  getPaymentMethod,
  PAYMENT_CATEGORIES,
} from "../constants/paymentMethods";

interface PaymentMockProps {
  orderId: string;
}

type Stage = "gateway" | "processing" | "success";

/**
 * /payment/mock/[orderId]
 *
 * 綠界 ECPay 金流「模擬」頁。完全 client-side、不打任何 API，只是演出一段
 * 「跳到綠界 → 輸入卡號/取得帳號/掃條碼 → 回來」的 UX。
 *
 * 流程：
 *   gateway (使用者看到綠界風格的付款介面)
 *     → 點「確認付款」/「取得虛擬帳號」/「掃描 QR」
 *   processing (3 秒 loading 動畫，假裝送到綠界)
 *     → 自動
 *   success (顯示「交易成功」+ 交易編號)
 *     → 2 秒後自動跳 /checkout-success/[orderId]
 */
function PaymentMock({ orderId }: PaymentMockProps): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const methodId = searchParams.get("method") ?? "";
  const amount = Number(searchParams.get("amt") ?? "0");
  const merchantTradeNo = searchParams.get("tno") ?? "";
  const method = useMemo(() => getPaymentMethod(methodId), [methodId]);

  const [stage, setStage] = useState<Stage>("gateway");

  // 產生偽資料：ATM 虛擬帳號、超商代碼、Barcode 條碼等
  const mockData = useMemo(() => {
    // 固定 seed：用 merchantTradeNo 產生看起來穩定的資料
    const seed = merchantTradeNo || "DEMO";
    const hash = Array.from(seed).reduce((a, c) => a + c.charCodeAt(0), 0);
    const rand = (digits: number) =>
      String(Math.abs(hash * 9301 + 49297) % Math.pow(10, digits)).padStart(
        digits,
        "0",
      );
    return {
      atmAccount: `8082${rand(10)}`, // 台新銀行 code 8082 + 10 碼
      cvsCode: `LLL${rand(11)}`, // 11 碼英數
      barcode1: `A${rand(15)}`,
      barcode2: `E${rand(15)}`,
      barcode3: `${rand(16)}`,
      ecpayTradeNo: `${Date.now()}${rand(7)}`.slice(0, 20),
    };
  }, [merchantTradeNo]);

  // processing → success 自動推進
  useEffect(() => {
    if (stage !== "processing") return;
    const t = setTimeout(() => setStage("success"), 3000);
    return () => clearTimeout(t);
  }, [stage]);

  // success → 跳結帳完成頁
  useEffect(() => {
    if (stage !== "success") return;
    const t = setTimeout(() => {
      const qs = new URLSearchParams({
        method: methodId,
        tno: merchantTradeNo,
        ectno: mockData.ecpayTradeNo,
      });
      navigate(`/checkout-success/${orderId}?${qs.toString()}`);
    }, 2000);
    return () => clearTimeout(t);
  }, [stage, orderId, methodId, merchantTradeNo, mockData.ecpayTradeNo, router]);

  if (!method) {
    return (
      <div className="max-w-lg mx-auto my-20 p-8 text-center">
        <h3 className="text-xl font-bold mb-2">找不到付款方式</h3>
        <p className="text-gray-500">
          這個連結看起來不完整，請回到購物車重新下單。
        </p>
      </div>
    );
  }

  const catMeta = PAYMENT_CATEGORIES[method.category];
  const paymentDate = new Date().toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#00693E] to-[#004d2e] py-10">
      <div className="max-w-2xl mx-auto px-4">
        {/* 綠界風格 header：深綠色底 + logo */}
        <div className="bg-white rounded-t-lg px-6 py-4 flex items-center justify-between border-b-4 border-[#00693E]">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-[#00693E] rounded flex items-center justify-center text-white font-bold text-lg">
              綠
            </div>
            <div>
              <div className="font-bold text-lg leading-tight">
                綠界科技 ECPay
              </div>
              <div className="text-[10px] text-gray-400 tracking-widest">
                SECURE PAYMENT GATEWAY
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-gray-400">商店名稱</div>
            <div className="text-sm font-medium">ENSO INCENSE</div>
          </div>
        </div>

        {/* 交易摘要 */}
        <div className="bg-white px-6 py-4 border-b border-gray-100">
          <div className="flex items-center justify-between text-sm">
            <div className="text-gray-500">商店訂單編號</div>
            <div className="font-mono">{orderId}</div>
          </div>
          <div className="flex items-center justify-between text-sm mt-1">
            <div className="text-gray-500">綠界交易編號</div>
            <div className="font-mono">{merchantTradeNo}</div>
          </div>
          <div className="flex items-center justify-between mt-3 pt-3 border-t border-dashed border-gray-200">
            <div className="text-gray-600">應付金額</div>
            <div className="text-2xl font-bold text-[#00693E]">
              NT$ {amount.toLocaleString()}
            </div>
          </div>
        </div>

        {/* 付款方式 banner */}
        <div className="bg-white px-6 py-3 flex items-center gap-2 border-b border-gray-100">
          <span
            className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${catMeta.colorClass}`}
          >
            {catMeta.label}
          </span>
          <span className="font-medium flex items-center gap-2">
            <i className={`bi ${method.icon}`}></i>
            {method.label}
          </span>
          <span className="ml-auto text-[10px] text-gray-400">
            PaymentType: {method.ecpayCode}
          </span>
        </div>

        {/* stage 內容 */}
        <div className="bg-white rounded-b-lg px-6 py-8 min-h-[320px]">
          {stage === "gateway" && (
            <GatewayView
              method={method}
              mockData={mockData}
              onSubmit={() => setStage("processing")}
            />
          )}
          {stage === "processing" && <ProcessingView methodLabel={method.label} />}
          {stage === "success" && (
            <SuccessView
              method={method}
              merchantTradeNo={merchantTradeNo}
              ecpayTradeNo={mockData.ecpayTradeNo}
              amount={amount}
              paymentDate={paymentDate}
            />
          )}
        </div>

        {/* 底部說明 */}
        <div className="text-center text-white/80 text-xs mt-6 space-y-1">
          <p>⚠️ 這是 ENSO portfolio demo 的綠界模擬頁，不會真的扣款 / 請款 / 發送資料到綠界。</p>
          <p>實際情境下此頁會是綠界 hosted checkout，資料由綠界簽章後送回商店 ReturnURL。</p>
        </div>
      </div>
    </div>
  );
}

// ── Gateway 階段：依付款方式渲染不同 UI ──
function GatewayView({
  method,
  mockData,
  onSubmit,
}: {
  method: ReturnType<typeof getPaymentMethod>;
  mockData: ReturnType<typeof useMemo<{
    atmAccount: string;
    cvsCode: string;
    barcode1: string;
    barcode2: string;
    barcode3: string;
    ecpayTradeNo: string;
  }>>;
  onSubmit: () => void;
}): JSX.Element {
  if (!method) return <></>;
  const id = method.id;

  // 卡片類：顯示卡號輸入欄位（不收資料，按送出直接通過）
  if (id.startsWith("credit")) {
    return (
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">卡號</label>
          <input
            className="w-full border rounded px-3 py-2 font-mono text-lg tracking-wider"
            placeholder="4242 4242 4242 4242"
            defaultValue="4242 4242 4242 4242"
            readOnly
          />
          <p className="text-[10px] text-gray-400 mt-1">
            demo 固定填入 Stripe 公開測試卡號，不會送出
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">有效日期</label>
            <input
              className="w-full border rounded px-3 py-2 font-mono"
              placeholder="MM/YY"
              defaultValue="12/30"
              readOnly
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">CVV</label>
            <input
              className="w-full border rounded px-3 py-2 font-mono"
              placeholder="123"
              defaultValue="•••"
              readOnly
            />
          </div>
        </div>
        {id !== "credit_onetime" && (
          <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm">
            <i className="bi bi-info-circle mr-1"></i>
            {method.label}，將分 {id.split("_").pop()} 期攤提
          </div>
        )}
        <button
          type="button"
          onClick={onSubmit}
          className="w-full bg-[#00693E] text-white py-3 rounded font-bold hover:bg-[#004d2e] transition"
        >
          確認付款
        </button>
      </div>
    );
  }

  // 行動支付：大按鈕 + 品牌色
  if (method.category === "wallet") {
    const brandColors: Record<string, string> = {
      applepay: "bg-black hover:bg-gray-800",
      googlepay: "bg-[#4285F4] hover:bg-[#3367d6]",
      linepay: "bg-[#00B900] hover:bg-[#009900]",
    };
    return (
      <div className="space-y-4">
        <div className="text-center py-6">
          <div className="text-gray-500 mb-4">
            按下下方按鈕以開啟 {method.label} 進行付款
          </div>
          <div
            className={`inline-flex items-center justify-center gap-3 px-12 py-4 rounded-full text-white text-lg font-bold cursor-pointer transition ${brandColors[id] ?? "bg-[#00693E]"}`}
            onClick={onSubmit}
          >
            <i className={`bi ${method.icon} text-2xl`}></i>
            {method.label}
          </div>
        </div>
        <div className="text-xs text-gray-400 text-center">
          ⓘ 實際情境下此處會跳轉到對應行動支付 App 完成授權
        </div>
      </div>
    );
  }

  // ATM / WebATM：顯示虛擬帳號
  if (method.category === "transfer") {
    return (
      <div className="space-y-4">
        <div className="bg-sky-50 border border-sky-200 rounded-lg p-5">
          <div className="text-xs text-sky-600 font-bold mb-1">
            ⓘ 請在 3 天內至 ATM / 網銀轉帳到以下帳號
          </div>
          <div className="mt-3">
            <div className="text-xs text-gray-500">銀行代碼</div>
            <div className="font-mono text-lg font-bold">812 台新銀行</div>
          </div>
          <div className="mt-2">
            <div className="text-xs text-gray-500">虛擬帳號</div>
            <div className="font-mono text-2xl font-bold text-sky-900 tracking-wider">
              {mockData.atmAccount}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onSubmit}
          className="w-full bg-[#00693E] text-white py-3 rounded font-bold hover:bg-[#004d2e] transition"
        >
          我已完成轉帳
        </button>
      </div>
    );
  }

  // 超商代碼
  if (id === "cvs") {
    return (
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-5">
          <div className="text-xs text-amber-700 font-bold mb-2">
            ⓘ 請於 7 天內持代碼至 7-11 / 全家 / 萊爾富 / OK 超商繳費機輸入
          </div>
          <div className="mt-3">
            <div className="text-xs text-gray-500">繳費代碼</div>
            <div className="font-mono text-3xl font-bold text-amber-900 tracking-widest">
              {mockData.cvsCode}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onSubmit}
          className="w-full bg-[#00693E] text-white py-3 rounded font-bold hover:bg-[#004d2e] transition"
        >
          我已完成繳費
        </button>
      </div>
    );
  }

  // 超商條碼
  if (id === "barcode") {
    return (
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-5 space-y-3">
          <div className="text-xs text-amber-700 font-bold">
            ⓘ 請列印以下三段條碼至超商掃描
          </div>
          {[mockData.barcode1, mockData.barcode2, mockData.barcode3].map(
            (b, i) => (
              <div key={i}>
                <div className="text-xs text-gray-500 mb-1">
                  第 {i + 1} 段條碼
                </div>
                <div
                  className="h-10 bg-black text-white font-mono text-xs flex items-center justify-center"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(90deg, #000 0 2px, #fff 2px 4px, #000 4px 7px, #fff 7px 9px)",
                  }}
                ></div>
                <div className="font-mono text-center mt-1">{b}</div>
              </div>
            ),
          )}
        </div>
        <button
          type="button"
          onClick={onSubmit}
          className="w-full bg-[#00693E] text-white py-3 rounded font-bold hover:bg-[#004d2e] transition"
        >
          我已完成繳費
        </button>
      </div>
    );
  }

  // QR
  if (id === "twqr") {
    return (
      <div className="space-y-4 text-center">
        <div className="inline-block bg-white border-4 border-rose-200 p-3 rounded-lg">
          <div
            className="w-48 h-48 bg-black grid grid-cols-12 grid-rows-12 gap-0.5 p-2"
            aria-label="模擬 QR Code"
          >
            {Array.from({ length: 144 }).map((_, i) => (
              <div
                key={i}
                className={
                  // 假 QR 紋路：用 hash 的位元填黑白
                  (mockData.ecpayTradeNo.charCodeAt(i % mockData.ecpayTradeNo.length) +
                    i) %
                    2 ===
                  0
                    ? "bg-black"
                    : "bg-white"
                }
              />
            ))}
          </div>
        </div>
        <p className="text-sm text-gray-500">
          使用銀行 APP 掃描上方 QR Code 完成付款
        </p>
        <button
          type="button"
          onClick={onSubmit}
          className="w-full bg-[#00693E] text-white py-3 rounded font-bold hover:bg-[#004d2e] transition"
        >
          我已完成掃碼付款
        </button>
      </div>
    );
  }

  // fallback
  return (
    <div className="text-center py-10">
      <button
        type="button"
        onClick={onSubmit}
        className="bg-[#00693E] text-white px-8 py-3 rounded font-bold hover:bg-[#004d2e] transition"
      >
        確認付款
      </button>
    </div>
  );
}

// ── Processing 階段 ──
function ProcessingView({ methodLabel }: { methodLabel: string }): JSX.Element {
  return (
    <div className="text-center py-10">
      <div className="inline-block w-14 h-14 border-4 border-[#00693E]/20 border-t-[#00693E] rounded-full animate-spin mb-5"></div>
      <div className="text-lg font-bold">正在與 {methodLabel} 安全連線…</div>
      <div className="text-gray-500 mt-1 text-sm">
        請勿關閉此頁面，交易處理中
      </div>
      <div className="mt-6 space-y-1 text-xs text-gray-400 font-mono">
        <div>[ECPay] → 驗證 CheckMacValue</div>
        <div>[ECPay] → 建立 TradeNo</div>
        <div>[ECPay] → 回傳 RtnCode=1</div>
      </div>
    </div>
  );
}

// ── Success 階段 ──
function SuccessView({
  method,
  merchantTradeNo,
  ecpayTradeNo,
  amount,
  paymentDate,
}: {
  method: ReturnType<typeof getPaymentMethod>;
  merchantTradeNo: string;
  ecpayTradeNo: string;
  amount: number;
  paymentDate: string;
}): JSX.Element {
  if (!method) return <></>;
  return (
    <div className="text-center py-6">
      <div className="inline-block w-16 h-16 bg-[#00693E] text-white rounded-full flex items-center justify-center text-3xl mb-3">
        <i className="bi bi-check-lg"></i>
      </div>
      <h3 className="text-2xl font-bold text-[#00693E] mb-1">交易成功</h3>
      <p className="text-gray-500 text-sm mb-5">
        感謝您的訂購，正在為您跳轉至訂單完成頁…
      </p>
      <div className="bg-gray-50 rounded-lg p-4 text-left text-sm space-y-1.5 max-w-md mx-auto">
        <Row label="付款方式" value={method.label} />
        <Row label="商店交易編號" value={merchantTradeNo} mono />
        <Row label="綠界交易編號" value={ecpayTradeNo} mono />
        <Row label="交易金額" value={`NT$ ${amount.toLocaleString()}`} />
        <Row label="付款時間" value={paymentDate} mono />
        <Row label="RtnCode" value="1（交易成功）" mono />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}): JSX.Element {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500 flex-shrink-0">{label}</span>
      <span
        className={`${mono ? "font-mono" : "font-medium"} break-all text-right min-w-0`}
      >
        {value}
      </span>
    </div>
  );
}

export default PaymentMock;
