---
paths:
  - "src/slice/**"
  - "src/store/**"
---

# Redux 規則

- 使用 Redux Toolkit 的 `createSlice` 和 `createAsyncThunk`
- Slice 檔案命名：`{name}Slice.ts`，放在 `src/slice/`
- Async thunk 命名：`createAsync{Action}`，例如 `createAsyncGetCart`
- 購物車寫入操作完成後必須 dispatch `createAsyncGetCart` 重新同步狀態
- Toast 通知透過 `createAsyncAddMessage` dispatch，3 秒後自動 `removeMessage`
- 新增 slice 後必須在 `src/store/store.ts` 註冊 reducer
- Export types: `RootState` 和 `AppDispatch` 從 `store.ts` export
- 元件中使用 `useDispatch<AppDispatch>()` 確保型別安全
