import { useDispatch, useSelector } from "react-redux";

import { removeMessage } from "../slice/messageSlice";
import type { RootState, AppDispatch } from "../store/store";

function MessageToast(): JSX.Element {
  const messages = useSelector((state: RootState) => state.message.messages);
  const dispatch = useDispatch<AppDispatch>();
  const bgColorMap: Record<string, string> = {
    success: "bg-green-500",
    danger: "bg-red-500",
  };
  return (
    <div className="w-96 fixed top-0 right-0 p-4 z-[9999] max-sm:right-0 max-sm:left-0 max-sm:mx-auto max-sm:w-[calc(100%-1rem)] max-sm:max-w-[420px]">
      {messages.map((message) => (
        <div
          className="bg-white rounded-lg shadow-lg overflow-hidden mt-2"
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          key={message.id}
        >
          <div
            className={`flex items-center justify-between px-3 py-2 text-white ${bgColorMap[message.type]}`}
          >
            <strong className="flex justify-between ">{message.title}</strong>
            <button
              type="button"
              className="text-white "
              onClick={() => dispatch(removeMessage(message.id))}
              aria-label="Close"
            >
              <i className="fa-solid fa-xmark"></i>
            </button>
          </div>
          <div className="px-3 py-2">{message.text}</div>
        </div>
      ))}
    </div>
  );
}

export default MessageToast;
