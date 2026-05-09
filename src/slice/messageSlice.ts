import { createAsyncThunk, createSlice, PayloadAction } from "@reduxjs/toolkit";
interface Message {
  id: number;
  type: "success" | "danger";
  title: string;
  text: string;
}
interface MessageState {
  messages: Message[];
}
const initialState: MessageState = {
  messages: [],
};
const messageSlice = createSlice({
  name: "message",
  initialState,
  reducers: {
    addMessage: (
      state,
      action: PayloadAction<{ id: number; success: boolean; message: string }>,
    ) => {
      const { id, success, message } = action.payload;
      state.messages.push({
        id,
        type: success ? "success" : "danger",
        title: success ? "成功" : "失敗",
        text: message,
      });
    },
    removeMessage: (state, action: PayloadAction<number>) => {
      const index = state.messages.findIndex(
        (item) => item.id === action.payload,
      );
      if (index !== -1) {
        state.messages.splice(index, 1);
      }
    },
  },
});

export const createAsyncAddMessage = createAsyncThunk(
  "message/createAsyncAddMessage",
  async (payload: { success: boolean; message: string }, { dispatch }) => {
    const id = Date.now();
    dispatch(
      addMessage({
        id,
        ...payload,
      }),
    );
    setTimeout(() => {
      dispatch(removeMessage(id));
    }, 3000);
  },
);

export const { addMessage, removeMessage } = messageSlice.actions;
export default messageSlice.reducer;
 