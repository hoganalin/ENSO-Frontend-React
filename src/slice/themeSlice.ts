import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export type ThemeDirection = "sakura" | "seigaiha" | "kiku";
export type ThemeAccent = "gold" | "vermillion" | "moss";

interface ThemeState {
  direction: ThemeDirection;
  accent: ThemeAccent;
  noPaper: boolean;
  noSmoke: boolean;
  brushIntensity: number; // 0–1, drives --brush-intensity
}

const initialState: ThemeState = {
  direction: "seigaiha",
  accent: "gold",
  noPaper: false,
  noSmoke: false,
  brushIntensity: 1,
};

const themeSlice = createSlice({
  name: "theme",
  initialState,
  reducers: {
    setDirection(state, action: PayloadAction<ThemeDirection>) {
      state.direction = action.payload;
    },
    setAccent(state, action: PayloadAction<ThemeAccent>) {
      state.accent = action.payload;
    },
    setNoPaper(state, action: PayloadAction<boolean>) {
      state.noPaper = action.payload;
    },
    setNoSmoke(state, action: PayloadAction<boolean>) {
      state.noSmoke = action.payload;
    },
    setBrushIntensity(state, action: PayloadAction<number>) {
      state.brushIntensity = Math.max(0, Math.min(1, action.payload));
    },
    resetTheme() {
      return initialState;
    },
  },
});

export const {
  setDirection,
  setAccent,
  setNoPaper,
  setNoSmoke,
  setBrushIntensity,
  resetTheme,
} = themeSlice.actions;

export default themeSlice.reducer;
