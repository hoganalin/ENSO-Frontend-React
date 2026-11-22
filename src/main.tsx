import "@/styles/globals.css";
import "@/index.css";
import "@/assets/all.scss";
import "@/assets/swiper.scss";

import "swiper/css";
import "swiper/css/pagination";
import "swiper/css/autoplay";

import "aos/dist/aos.css";
import "bootstrap-icons/font/bootstrap-icons.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { RouterProvider } from "react-router";

import { router } from "@/router";
import { store } from "@/store/store";

// 錯誤監控(Sentry):僅在設定了 VITE_SENTRY_DSN 時才啟用;未設定則完全不載入。
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
if (SENTRY_DSN) {
  import("@sentry/react")
    .then((Sentry) => {
      Sentry.init({
        dsn: SENTRY_DSN,
        environment: import.meta.env.MODE,
        tracesSampleRate: 0.1,
      });
    })
    .catch(() => { /* 套件缺失時略過,不影響 App 啟動 */ });
}

const container = document.getElementById("root");
if (!container) throw new Error("Root container missing in index.html");

createRoot(container).render(
  <StrictMode>
    <Provider store={store}>
      <RouterProvider router={router} />
    </Provider>
  </StrictMode>,
);

// Lazy-load Bootstrap JS bundle on the client only (prev. BootstrapClient component).
import("bootstrap/dist/js/bootstrap.bundle.min.js");
