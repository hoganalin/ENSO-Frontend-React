---
paths:
  - "**/*.test.*"
  - "**/__tests__/**"
---

# 測試規則

- 使用 Vitest 4 + @testing-library/react + @testing-library/user-event
- 測試檔案放在目標檔案同層的 `__tests__/` 資料夾，命名 `*.test.tsx` 或 `*.test.ts`
- Import testing utilities: `{ render, screen }` from `@testing-library/react`, `{ describe, it, expect, vi }` from `vitest`
- 需要 Redux 的元件測試必須提供 `<Provider store={store}>` wrapper
- Mock 外部 API（Axios），不要 mock Redux store 內部邏輯
- 使用 accessible queries: `getByRole`, `getByText`, `getByLabelText`
- 測試使用者行為而非實作細節
- Mock Next.js router: `vi.mock("next/navigation")`
- 每個測試後清理 localStorage 和 cookie
