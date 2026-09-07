import { createBrowserRouter } from "react-router";

import FrontendLayout from "@/layouts/FrontendLayout";
import HomePage from "@/pages/HomePage";
import AboutPage from "@/pages/AboutPage";
import ProductsPage from "@/pages/ProductsPage";
import SingleProductPage from "@/pages/SingleProductPage";
import JournalPage from "@/pages/JournalPage";
import JournalArticlePage from "@/pages/JournalArticlePage";
import StoresPage from "@/pages/StoresPage";
import CartPage from "@/pages/CartPage";
import CheckoutPage from "@/pages/CheckoutPage";
import CheckoutSuccessPage from "@/pages/CheckoutSuccessPage";
import PaymentMockPage from "@/pages/PaymentMockPage";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import MyReferralPage from "@/pages/MyReferralPage";
import AdminSettingsPage from "@/pages/AdminSettingsPage";
import AdminSmsLogPage from "@/pages/AdminSmsLogPage";
import FaqPage from "@/pages/FaqPage";
import ContactPage from "@/pages/ContactPage";
import NotFoundPage from "@/pages/NotFoundPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <FrontendLayout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "about", element: <AboutPage /> },
      { path: "product", element: <ProductsPage /> },
      { path: "product/:id", element: <SingleProductPage /> },
      { path: "journal", element: <JournalPage /> },
      { path: "journal/:id", element: <JournalArticlePage /> },
      { path: "stores", element: <StoresPage /> },
      { path: "cart", element: <CartPage /> },
      { path: "checkout", element: <CheckoutPage /> },
      { path: "checkout-success", element: <CheckoutSuccessPage /> },
      { path: "checkout-success/:orderId", element: <CheckoutSuccessPage /> },
      { path: "payment/mock/:orderId", element: <PaymentMockPage /> },
      { path: "login", element: <LoginPage /> },
      { path: "register", element: <RegisterPage /> },
      { path: "referral", element: <MyReferralPage /> },
      { path: "admin/settings", element: <AdminSettingsPage /> },
      { path: "admin/sms", element: <AdminSmsLogPage /> },
      { path: "faq", element: <FaqPage /> },
      { path: "contact", element: <ContactPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

export default router;
