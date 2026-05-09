import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface UserState {
  token: string | null;
  user: {
    email: string;
    [key: string]: any;
  } | null;
  isAuthenticated: boolean;
}

// SSR 安全：Server 端沒有 localStorage，僅在 browser 讀取
const getInitialAuth = (): UserState => {
  if (typeof window === "undefined") {
    return { token: null, user: null, isAuthenticated: false };
  }
  try {
    const localAuth = window.localStorage.getItem("auth");
    return localAuth
      ? JSON.parse(localAuth)
      : { token: null, user: null, isAuthenticated: false };
  } catch {
    return { token: null, user: null, isAuthenticated: false };
  }
};

const initialAuth: UserState = getInitialAuth();

const authSlice = createSlice({
  name: "auth",
  initialState: initialAuth,
  reducers: {
    loginSuccess(
      state,
      action: PayloadAction<{ token: string; user: { email: string } }>,
    ) {
      const { token, user } = action.payload;
      state.token = token;
      state.user = user;
      state.isAuthenticated = true;
      if (typeof window !== "undefined") {
        window.localStorage.setItem("auth", JSON.stringify(state));
      }
    },
    logout(state) {
      state.token = null;
      state.user = null;
      state.isAuthenticated = false;
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("auth");
      }
    },
    restoreAuth(
      state,
      action: PayloadAction<{ token: string; user: { email: string } }>,
    ) {
      state.token = action.payload.token;
      state.user = action.payload.user;
      state.isAuthenticated = true;
      if (typeof window !== "undefined") {
        window.localStorage.setItem("auth", JSON.stringify(state));
      }
    },
  },
});

export const { loginSuccess, logout, restoreAuth } = authSlice.actions;
export default authSlice.reducer;
