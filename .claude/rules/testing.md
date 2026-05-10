---
paths:
  - "src/test/**"
  - "**/*.test.*"
  - "**/__tests__/**"
---

# 測試規則

- 使用 Vitest 4 + @testing-library/react + @testing-library/user-event；環境為 jsdom
- 測試檔案放在 `src/test/`（共用集中地）或目標檔案同層的 `__tests__/`，命名 `*.test.tsx` 或 `*.test.ts`
- Vitest 設定在 `vite.config.ts` 的 `test:` 區塊；全域 setup 在 `src/test/setup.ts`（已載入 `@testing-library/jest-dom`）
- Import testing utilities: `{ render, screen }` from `@testing-library/react`，`{ describe, it, expect, vi }` from `vitest`
- 需要 Redux 的元件測試必須提供 `<Provider store={store}>` wrapper
- 需要 react-router context（用 `useNavigate` / `useLocation` / `Outlet` 等）的元件以 `createMemoryRouter` + `<RouterProvider>` 包起來
- Mock 外部 API（Axios）：`vi.mock("@/services/cart")` 等；不要 mock Redux store 內部邏輯
- 使用 accessible queries：`getByRole`, `getByText`, `getByLabelText`
- 測試使用者行為而非實作細節
- 測試之間清理 localStorage 與 cookie：`beforeEach(() => localStorage.clear())`
- 需控制 env 變數時使用 `vi.stubEnv("VITE_API_BASE", "http://test")`
