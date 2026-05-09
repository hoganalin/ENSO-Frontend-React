import { useCallback } from "react";
import { useDispatch } from "react-redux";
import type { AppDispatch } from "../store/store";
import { createAsyncAddMessage } from "../slice/messageSlice";

function useMessage() {
  const dispatch = useDispatch<AppDispatch>();
  const showSuccess = useCallback(
    (message: string) => {
      dispatch(createAsyncAddMessage({ success: true, message }));
    },
    [dispatch],
  );
  const showError = useCallback(
    (message: string) => {
      dispatch(createAsyncAddMessage({ success: false, message }));
    },
    [dispatch],
  );
  return { showSuccess, showError };
}

export default useMessage;
