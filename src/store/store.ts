import { configureStore } from "@reduxjs/toolkit";

import cartReducer from "../slice/cartSlice";
import messageReducer from "../slice/messageSlice";
import authReducer from "../slice/authSlice";
import agentReducer from "../slice/agentSlice";
import themeReducer from "../slice/themeSlice";

export const store = configureStore({
  reducer: {
    cart: cartReducer,
    message: messageReducer,
    auth: authReducer,
    agent: agentReducer,
    theme: themeReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
