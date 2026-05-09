import { useDispatch, useSelector } from "react-redux";

import { toggleAgent } from "../../slice/agentSlice";
import ChatPanel from "./ChatPanel";
import { EnsoCircle } from "../atoms";

import type { RootState } from "../../store/store";

function ChatWidget(): JSX.Element {
  const dispatch = useDispatch();
  const isOpen = useSelector((state: RootState) => state.agent.isOpen);

  if (isOpen) {
    return <ChatPanel />;
  }

  return (
    <button
      type="button"
      onClick={() => dispatch(toggleAgent())}
      className="sa-fab"
      aria-label="開啟購物助理"
    >
      <span className="sa-fab-enso" aria-hidden>
        <EnsoCircle size={44} strokeWidth={3} />
      </span>
      <span className="sa-fab-dot" aria-hidden />
      <span className="sa-fab-tip">問小禾</span>
    </button>
  );
}

export default ChatWidget;
