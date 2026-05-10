---
paths:
  - "src/components/**"
  - "src/views/**"
  - "src/pages/**"
  - "src/layouts/**"
---

# 前端元件規則

- 純 SPA，**不需要也不應該** 出現 `'use client'` directive
- `src/pages/XxxPage.tsx` 盡量保持為 thin wrapper（呼叫 `usePageTitle`、組裝 `src/components/` 內的元件）
- 路由 / 導航使用 react-router 7 hooks：`useNavigate`、`useLocation`、`useParams`、`Link`，**不使用 next/navigation**
- 使用 `useDispatch<AppDispatch>()` 與 `useSelector<RootState, T>` 確保型別安全
- 顯示 toast 用 `useMessage()` hook（不要直接 dispatch messageSlice）
- 表單使用 `react-hook-form`，驗證規則寫在 register 或 `src/assets/utils/validation.ts`
- 確認對話框使用 `sweetalert2`（`Swal.fire`）
- Loading 狀態使用 `react-loader-spinner` 的 `RotatingLines`
- 所有可互動元素必須有 `aria-label`；圖片必須有 `alt`
- 金額顯示使用 `currency()` from `@/assets/utils/filter`
- 新增頁面：在 `src/pages/` 建立 `XxxPage.tsx`，並在 `src/router/index.tsx` 的 `children` 註冊路由
- 視覺 atoms 從 `@/components/atoms` import（已透過 `index.ts` re-export）
