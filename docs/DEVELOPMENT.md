# 開發規範

## 命名規則

| 項目 | 規則 | 範例 |
|---|---|---|
| 元件檔案 | PascalCase | `SingleProduct.tsx`, `MessageToast.tsx` |
| 頁面檔案 | `page.tsx` (Next.js App Router 規定) | `src/app/(frontend)/cart/page.tsx` |
| Redux slice | camelCase + `Slice` 後綴 | `cartSlice.ts`, `authSlice.ts` |
| API 函式 | camelCase + `Api` 後綴 | `getProductApi`, `addCartApi` |
| Async thunk | `createAsync` + 動作名 | `createAsyncGetCart`, `createAsyncAddCart` |
| Custom hook | `use` + 名稱 | `useMessage` |
| SCSS 檔案 | `_` 前綴 + kebab-case | `_single-product.scss`, `_product-card.scss` |
| 型別檔案 | camelCase | `src/types/product.ts` |
| 工具函式 | camelCase | `currency()`, `emailValidation` |

## Import 順序

ESLint (`eslint-plugin-simple-import-sort`) 自動排序，規則如下：

```typescript
// 1. React / Next.js
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// 2. 第三方套件
import { useDispatch, useSelector } from "react-redux";
import Swal from "sweetalert2";

// 3. 靜態資源 (CSS/SCSS/images)
import "./styles.scss";

// 4. 專案內部 imports（@/ alias）
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
| `NEXT_PUBLIC_API_BASE` | 六角學院 EC API base URL | 是 | `https://ec-course-api.hexschool.io/v2` |
| `NEXT_PUBLIC_API_PATH` | API path（帳號識別） | 是 | `rogan` |
| `NEXT_PUBLIC_AGENT_PROVIDER` | AI agent provider：`mock` / `server` / `direct` | 否 | `mock` |
| `ANTHROPIC_API_KEY` | Anthropic Messages API key（**server-only**，無 `NEXT_PUBLIC_` 前綴） | server provider 才需要 | — |
| `NEXT_PUBLIC_ANTHROPIC_API_KEY` | direct provider 用，**會被 bundle 到 client，僅限 local dev** | direct provider 才需要 | — |
| `KV_REST_API_URL` / `UPSTASH_REDIS_REST_URL` | Upstash Redis REST endpoint（agent events / candidate cases 持久化） | production 建議 | — |
| `KV_REST_API_TOKEN` / `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token | 同上 | — |
| `NEXT_PUBLIC_ECPAY_*` | ECPay 金流相關設定（MerchantID / HashKey / HashIV / BaseURL / ReturnURL / ClientBackURL） | 啟用真實金流時 | — |

環境變數檔案：`.env.local`（已在 .gitignore 中；`.env.example` 為範本可 commit）。

> 注意：從 Vite 遷移至 Next.js 後，環境變數前綴從 `VITE_` 改為 `NEXT_PUBLIC_`。**有 `NEXT_PUBLIC_` 前綴的會 bundle 進 client；server-only secret 千萬不要加前綴。**

## 路徑別名

`@` 對應 `src/`，設定於：
- `tsconfig.json` → `paths: { "@/*": ["src/*"] }`
- `next.config.ts` → `webpack config.resolve.alias`

## 新增頁面步驟

1. 在 `src/app/(frontend)/` 下建立資料夾和 `page.tsx`
2. 在 `src/components/` 建立對應的元件（`"use client"` 如需互動）
3. `page.tsx` import 並渲染元件
4. 更新 docs/FEATURES.md

## 新增 API 函式步驟

1. 在 `src/services/` 對應的檔案中新增函式
2. 使用 `api`（前台）或 `adminApi`（後台）instance
3. 如需新的 service 檔案，import `{ api, API_PATH }` from `./api`
4. 函式命名：`{動作}{資源}Api`，如 `getProductApi`

## 新增 Redux Slice 步驟

1. 在 `src/slice/` 建立 `{name}Slice.ts`
2. 定義 interface、initialState、reducers
3. 如有 async 操作，使用 `createAsyncThunk`
4. 在 `src/store/store.ts` 中註冊 reducer
5. Export actions 和 reducer

## Client Component 規則

Next.js App Router 預設 Server Component。需要以下功能時加上 `"use client"`：
- `useState`, `useEffect`, `useRef` 等 React hooks
- Redux hooks (`useDispatch`, `useSelector`)
- 瀏覽器 API (`localStorage`, `document.cookie`, `window`)
- 事件處理 (`onClick`, `onSubmit`)

## 計畫歸檔流程

1. 計畫檔案命名格式：`YYYY-MM-DD-<feature-name>.md`
2. 計畫文件結構：User Story → Spec → Tasks
3. 功能完成後：移至 `docs/plans/archive/`
4. 更新 `docs/FEATURES.md` 和 `docs/CHANGELOG.md`
