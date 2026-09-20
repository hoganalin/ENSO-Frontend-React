import { createAsyncThunk, createSlice, PayloadAction, Dispatch } from "@reduxjs/toolkit";
import axios from "axios";

import {
  addCartApi,
  clearStoredCart,
  deleteAllCartApi,
  deleteSingleCartApi,
  getCartApi,
  updateCartApi,
} from "../services/cart";

interface CartItem {
  id: string;
  product_id: string;
  qty: number;
  total: number;
  final_total: number;
  product: {
    id: string;
    title: string;
    price: number;
    imageUrl: string;
    description?: string;
  };
}

interface CartState {
  carts: CartItem[];
  total: number;
  final_total: number;
}

const initialState: CartState = {
  carts: [],
  total: 0,
  final_total: 0,
};

const extractErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    return (
      error.response?.data?.message ||
      error.message ||
      "API 請求失敗"
    );
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "未知錯誤";
};

const cartSlice = createSlice({
  name: "cart",
  initialState,
  reducers: {
    updateCart: (
      state,
      action: PayloadAction<{
        carts: CartItem[];
        total: number;
        final_total: number;
      }>,
    ) => {
      state.carts = action.payload.carts;
      state.total = action.payload.total;
      state.final_total = action.payload.final_total;
    },
    // ✅ 新增：清空購物車
    cartCleared: (state) => {
      state.carts = [];
      state.total = 0;
      state.final_total = 0;
    },
  },
});

let clearVersion = 0;

// Persistence is kept outside reducers so reducers remain deterministic.
export const clearCart = () => (dispatch: Dispatch) => {
  clearStoredCart();
  clearVersion += 1;
  dispatch(cartSlice.actions.cartCleared());
};

async function applyCart(
  request: () => ReturnType<typeof getCartApi>,
  dispatch: Dispatch,
) {
  const version = clearVersion;
  const response = await request();
  if (version === clearVersion) dispatch(updateCart(response.data.data));
  return response.data.data;
}

export const createAsyncGetCart = createAsyncThunk(
  "cart/createAsyncGetCart", async (_, { dispatch, rejectWithValue }) => {
    try { return await applyCart(getCartApi, dispatch); }
    catch (error) { return rejectWithValue(extractErrorMessage(error)); }
  },
);

export const createAsyncAddCart = createAsyncThunk(
  "cart/createAsyncAddCart",
  async ({ id, qty = 1 }: { id: string; qty?: number }, { dispatch, rejectWithValue }) => {
    try { return await applyCart(() => addCartApi({ product_id: id, qty }), dispatch); }
    catch (error) { return rejectWithValue(extractErrorMessage(error)); }
  },
);

export const createAsyncDeleteSingleCart = createAsyncThunk(
  "cart/createAsyncDeleteSingleCart", async (id: string, { dispatch, rejectWithValue }) => {
    try { return await applyCart(() => deleteSingleCartApi(id), dispatch); }
    catch (error) { return rejectWithValue(extractErrorMessage(error)); }
  },
);

export const createAsyncDeleteAllCart = createAsyncThunk(
  "cart/createAsyncDeleteAllCart", async (_, { dispatch, rejectWithValue }) => {
    try {
      const response = await deleteAllCartApi();
      clearVersion += 1;
      dispatch(cartSlice.actions.cartCleared());
      return response.data;
    } catch (error) { return rejectWithValue(extractErrorMessage(error)); }
  },
);

export const createAsyncUpdateCart = createAsyncThunk(
  "cart/createAsyncUpdateCart",
  async ({ id, product_id, qty }: { id: string; product_id: string; qty: number }, { dispatch, rejectWithValue }) => {
    try { return await applyCart(() => updateCartApi(id, { product_id, qty }), dispatch); }
    catch (error) { return rejectWithValue(extractErrorMessage(error)); }
  },
);

export const { updateCart } = cartSlice.actions;
export default cartSlice.reducer;
