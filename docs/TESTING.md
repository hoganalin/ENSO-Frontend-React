# 測試規範

## 測試框架

- **Vitest 4** — 測試執行器
- **@testing-library/react** — React 元件測試
- **@testing-library/jest-dom** — DOM 斷言擴充
- **@testing-library/user-event** — 使用者互動模擬
- **jsdom** — 瀏覽器環境模擬

## 執行指令

```bash
npm test            # 執行所有測試（vitest run）
npx vitest          # Watch 模式
npx vitest --ui     # UI 介面
```

## 測試檔案命名

```
src/components/__tests__/ComponentName.test.tsx
src/slice/__tests__/sliceName.test.ts
src/services/__tests__/serviceName.test.ts
src/hooks/__tests__/hookName.test.ts
```

## 撰寫新測試的步驟

1. 在目標檔案同層建立 `__tests__/` 資料夾
2. 建立 `*.test.tsx` 或 `*.test.ts` 檔案
3. Import 必要的 testing utilities：

```typescript
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi } from "vitest";
```

4. 如需 Redux store，建立 test wrapper：

```typescript
import { Provider } from "react-redux";
import { configureStore } from "@reduxjs/toolkit";
import cartReducer from "@/slice/cartSlice";
import messageReducer from "@/slice/messageSlice";
import authReducer from "@/slice/authSlice";
import agentReducer from "@/slice/agentSlice";
import themeReducer from "@/slice/themeSlice";

function renderWithProviders(ui: React.ReactElement, preloadedState = {}) {
  const store = configureStore({
    reducer: {
      cart: cartReducer,
      message: messageReducer,
      auth: authReducer,
      agent: agentReducer,
      theme: themeReducer,
    },
    preloadedState,
  });
  return render(<Provider store={store}>{ui}</Provider>);
}
```

5. 撰寫測試案例，使用 `describe` + `it` 結構

## 測試原則

- 測試使用者行為，非實作細節
- 使用 `screen.getByRole`, `screen.getByText` 等 accessible queries
- Mock 外部 API 呼叫（Axios），不 mock Redux store 內部邏輯
- 每個元件至少測試：渲染、關鍵互動、邊界狀態（空資料、loading）

## 常見陷阱

- `"use client"` 元件在測試中需要提供 Redux Provider
- Next.js router 需要 mock（`next/navigation` 的 `useRouter`, `usePathname` 等）
- `localStorage` 和 `document.cookie` 在 jsdom 環境中可用但需注意清理
- AOS 初始化可能影響 DOM snapshot，考慮在測試中 mock
- Swiper 元件在 jsdom 中可能無法完整渲染
