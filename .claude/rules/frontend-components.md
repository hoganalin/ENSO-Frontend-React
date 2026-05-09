---
paths:
  - "src/components/**"
  - "src/views/**"
  - "src/app/**/page.tsx"
---

# 前端元件規則

- 需要 hooks、Redux、瀏覽器 API、事件處理的元件必須加 `"use client"` 在檔案最頂端
- page.tsx 盡量保持為 thin wrapper，將邏輯委派給 components/ 中的元件
- 使用 `useDispatch<AppDispatch>()` 和 `useSelector` with `RootState` 型別
- 使用 `useMessage()` hook 顯示 toast 通知，不要直接 dispatch messageSlice
- 表單使用 `react-hook-form`，驗證規則定義在 register 或 `src/assets/utils/validation.ts`
- 確認對話框使用 `sweetalert2`（Swal.fire）
- Loading 狀態使用 `react-loader-spinner` 的 `RotatingLines`
- 所有可互動元素必須有 `aria-label`
- 圖片必須有 `alt` 屬性
- 金額顯示使用 `currency()` from `@/assets/utils/filter`
- 路由導航使用 `next/navigation` 的 `useRouter`、`usePathname`，不使用 react-router
