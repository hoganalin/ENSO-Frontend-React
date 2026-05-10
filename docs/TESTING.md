# 測試規範

## 測試框架

- **Vitest 4** — 測試執行器（透過 `vite.config.ts` 的 `test:` 區塊配置）
- **@testing-library/react** — React 元件測試
- **@testing-library/jest-dom** — DOM 斷言擴充（在 `src/test/setup.ts` 全域引入）
- **@testing-library/user-event** — 使用者互動模擬
- **jsdom** — 瀏覽器環境模擬

## Vitest 設定

`vite.config.ts`：
```ts
test: {
  environment: "jsdom",
  globals: true,
  setupFiles: "./src/test/setup.ts",
}
```

`globals: true` 讓 `describe / it / expect / vi` 不需 import 即可使用，但本專案測試仍維持 explicit import 以利 IDE 跳轉。

## 執行指令

```bash
npm test            # 執行所有測試（vitest run，CI 用）
npx vitest          # Watch 模式
npx vitest --ui     # UI 介面（需另裝 @vitest/ui）
```

## 現有測試

| 檔案 | 對象 | 說明 |
|---|---|---|
| `src/test/cartSlice.test.ts` | `cartSlice` reducer | 初始狀態 / 新增商品 / 清空購物車的 state 變化 |
| `src/test/setup.ts` | 全域 setup | 載入 `@testing-library/jest-dom` |

新測試可放在：
- `src/test/`（共用測試集中地）
- 或目標檔案同層的 `__tests__/`（例：`src/components/__tests__/Header.test.tsx`）

## 撰寫新測試的步驟

1. 建立 `*.test.tsx` 或 `*.test.ts`
2. Import 必要的 testing utilities：

```typescript
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
```

3. 如需 Redux store，建立 test wrapper：

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

4. 如需 react-router context（例：使用 `useNavigate` / `useLocation` 的元件），用 `createMemoryRouter` 包：

```typescript
import { RouterProvider, createMemoryRouter } from "react-router";

function renderWithRouter(element: React.ReactElement, initialEntries = ["/"]) {
  const router = createMemoryRouter([{ path: "/", element }], { initialEntries });
  return render(<RouterProvider router={router} />);
}
```

5. 撰寫測試，使用 `describe` + `it` 結構

## 測試原則

- 測試使用者行為，非實作細節
- 使用 accessible queries：`getByRole`, `getByText`, `getByLabelText`
- Mock 外部 API（Axios）：`vi.mock("@/services/cart")` 取代 `addCartApi` 等
- 不 mock Redux store 內部邏輯（用真實 reducer + preloadedState）
- 每個元件至少測試：渲染、關鍵互動、邊界狀態（空資料、loading）

## 常見陷阱

- 需要 Redux state 的元件必須包 `<Provider store={store}>`
- 使用 `useNavigate` / `useLocation` / `Outlet` 的元件必須包 react-router context
- `localStorage` / `document.cookie` 在 jsdom 中可用，但測試之間要清理（`beforeEach(() => localStorage.clear())`）
- AOS 初始化會操作 DOM，必要時 `vi.mock("aos", () => ({ default: { init: vi.fn(), refresh: vi.fn() } }))`
- Swiper 在 jsdom 中可能無法完整渲染（需要量測 DOM size），可考慮把 Swiper 部分包成可換掉的子元件以利測試
- `import.meta.env.VITE_*` 在測試中讀得到，但若測試需要不同值，可用 `vi.stubEnv("VITE_API_BASE", "http://test")`
