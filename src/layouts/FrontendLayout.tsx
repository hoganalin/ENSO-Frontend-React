import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Outlet, ScrollRestoration, useLocation } from "react-router";

import AOS from "aos";

import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Breadcrumb from "@/components/Breadcrumb";
import MessageToast from "@/components/MessageToast";
import ChatWidget from "@/components/ShoppingAgent/ChatWidget";

import { restoreAuth } from "@/slice/authSlice";
import type { AppDispatch, RootState } from "@/store/store";

export default function FrontendLayout(): JSX.Element {
  const { pathname } = useLocation();
  const dispatch = useDispatch<AppDispatch>();
  const theme = useSelector((state: RootState) => state.theme);

  useEffect(() => {
    AOS.init({ duration: 800, once: true });

    const localAuth = localStorage.getItem("auth");
    if (localAuth) {
      try {
        const authData = JSON.parse(localAuth);
        if (authData?.token && authData?.user) {
          dispatch(restoreAuth({ token: authData.token, user: authData.user }));
        }
      } catch {
        localStorage.removeItem("auth");
      }
    }
  }, [dispatch]);

  useEffect(() => {
    AOS.refresh();
  }, [pathname]);

  useEffect(() => {
    const html = document.documentElement;
    html.dataset.direction = theme.direction;
    html.dataset.accent = theme.accent;
    if (theme.noPaper) html.setAttribute("data-no-paper", "");
    else html.removeAttribute("data-no-paper");
    if (theme.noSmoke) html.setAttribute("data-no-smoke", "");
    else html.removeAttribute("data-no-smoke");
    html.style.setProperty("--brush-intensity", String(theme.brushIntensity));
  }, [theme.direction, theme.accent, theme.noPaper, theme.noSmoke, theme.brushIntensity]);

  return (
    <>
      <ScrollRestoration />
      <MessageToast />
      <Header />
      <Breadcrumb />
      <main>
        <Outlet />
      </main>
      <Footer />
      <ChatWidget />
    </>
  );
}
