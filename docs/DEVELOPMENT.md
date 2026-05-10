# 開發規範

## 命名規則

| 項目 | 規則 | 範例 |
|---|---|---|
| 元件檔案 | PascalCase | `SingleProduct.tsx`, `MessageToast.tsx` |
| 頁面檔案 | PascalCase + `Page` 後綴，放 `src/pages/` | `CartPage.tsx`, `SingleProductPage.tsx` |
| Layout | PascalCase + `Layout` 後綴，放 `src/layouts/` | `FrontendLayout.tsx` |
| Redux slice | camelCase + `Slice` 後綴 | `cartSlice.ts`, `authSlice.ts` |
| API 函式 | camelCase + `Api` 後綴 | `getProductApi`, `addCartApi` |
| Async thunk | `createAsync` + 動作名 | `createAsyncGetCart`, `createAsyncAddCart` |
| Custom hook | `use` + 名稱 | `useMessage`, `usePageTitle`, `useChatAgent` |
| SCSS 檔案 | `_` 前綴 + kebab-case | `_single-product.scss`, `_product-card.scss` |
| 型別檔案 | camelCase | `src/types/product.ts` |
| 工具函式 | camelCase | `currency()`, `emailValidation` |

## Import 順序

ESLint (`eslint-plugin-simple-import-sort`) 自動排序，建議分組：

```typescript
// 1. React / 框架
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";

// 2. 第三方套件
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";

// 3. 靜態資源 (CSS/SCSS/images)
import "./styles.scss";

// 4. 專案內部 imports（@/ alias 為 src/）
import { getProductApi } from "@/services/product";
import { createAsyncAddCart } from "@/slice/cartSlice";

// 5. 相對路徑 imports
import Pagination from "./Pagination";

// 6. 型別 imports（最後）
import type { AppDispatch } from "@/store/store";
import type { Product } from "@/types/product";
```

## 環境變數

| 變數 | 用途 | 必要 | 預設值 |
|---|---|---|---|
| `VITE_API_BASE` | 六角學院 EC API base URL | 是（缺值 throw）| `https://ec-course-api.hexschool.io/v2` |
| `VITE_API_PATH` | API path（帳號識別） | 是（缺值 throw）| `rogan` |
| `VITE_AGENT_PROVIDER` | AI agent provider：`mock` / `direct`（其他值 fallback 為 mock） | 否 | `mock` |
| `VITE_ANTHROPIC_API_KEY` | direct provider 使用，**會 bundle 進 client，僅限 local dev**，部署 production 不可使用 | direct provider 才需要 | — |

環境變數檔案：`.env.local`（git ignore）；`.env.example` 為範本可 commit。

> **重要**：純 SPA 沒有 server-only secret 的概念。`import.meta.env.VITE_*` 會在 `vite build` 時被字面替換進 client bundle，因此**任何 secret 都會公開**。production 若需保護 Anthropic API key，需另起 server proxy（目前專案不提供）。

## 路徑別名

`@` 對應 `src/`，需同步維護於兩處：
- `tsconfig.json` → `compilerOptions.paths: { "@/*": ["src/*"] }`
- `vite.config.ts` → `resolve.alias["@"] = path.resolve(__dirname, "src")`

## 新增頁面步驟

1. 在 `src/components/` 建立新元件（負責 UI + 互動邏輯）
2. 在 `src/pages/` 建立 `XxxPage.tsx`，import 並渲染元件，視需要呼叫 `usePageTitle("頁面標題")`
3. 在 `src/router/index.tsx` 的 `children` 中加入 `{ path: "...", element: <XxxPage /> }`
4. 視需要更新 `src/components/Breadcrumb.tsx` 的對照
5. 更新 `docs/FEATURES.md`

## 新增 API 函式步驟

1. 在 `src/services/` 對應的檔案中新增函式（一個資源一個檔，例：`product.ts`、`cart.ts`、`coupon.ts`）
2. import `{ api, API_PATH }` 或 `{ adminApi, API_PATH }` from `./api`
3. 端點路徑採模板字串 `` `/api/${API_PATH}/resource` ``
4. POST/PUT 的 body 必須包在 `{ data: { ... } }`
5. 不在 service 層處理錯誤；錯誤交給呼叫端（component 或 thunk）

## 新增 Redux Slice 步驟

1. 在 `src/slice/` 建立 `{name}Slice.ts`
2. 定義 interface、initialState、`createSlice`
3. 如有 async 操作，使用 `createAsyncThunk`
4. 在 `src/store/store.ts` 中註冊 reducer
5. Export actions 和 default reducer
6. 元件內以 `useDispatch<AppDispatch>()` 確保型別安全

## 計畫歸檔流程

1. 計畫檔案命名格式：`docs/plans/YYYY-MM-DD-<feature-name>.md`
2. 計畫文件結構：User Story → Spec → Tasks
3. 功能完成後：移至 `docs/plans/archive/`
4. 更新 `docs/FEATURES.md` 與 `docs/CHANGELOG.md`
