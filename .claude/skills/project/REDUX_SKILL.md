# REDUX_SKILL — Redux Toolkit 狀態管理規範

## 觸發時機

新增 Redux slice 或操作全域狀態時讀取此 skill。

## 現有 Slice

- cartSlice.ts — 購物車（carts, total, final_total）
- messageSlice.ts — Toast 佇列（3 秒自動消失）
- store 位置：src/store/store.ts

## 標準 Slice 模板

```ts
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";

interface NameState {
  data: ItemType[];
  loading: boolean;
  error: string | null;
}

const initialState: NameState = {
  data: [],
  loading: false,
  error: null,
};

export const fetchName = createAsyncThunk(
  "name/fetch",
  async (_, { rejectWithValue }) => {
    try {
      const res = await someApi();
      return res.data;
    } catch (err) {
      return rejectWithValue(err);
    }
  },
);

const nameSlice = createSlice({
  name: "name",
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchName.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(
        fetchName.fulfilled,
        (state, action: PayloadAction<ItemType[]>) => {
          state.loading = false;
          state.data = action.payload;
        },
      )
      .addCase(fetchName.rejected, (state) => {
        state.loading = false;
        state.error = "載入失敗";
      });
  },
});

export default nameSlice.reducer;
```

## 在元件中使用

```tsx
const dispatch = useDispatch<AppDispatch>();
const { data, loading } = useSelector((state: RootState) => state.name);

useEffect(() => {
  dispatch(fetchName());
}, [dispatch]);
```

## 加入新 Slice 步驟

1. 在 src/slice/ 建立 [name]Slice.ts
2. 在 src/store/store.ts 的 reducer 加入 name: nameReducer
3. async 邏輯封裝在 thunk 中，不要寫在元件裡
