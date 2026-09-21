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
import PaymentPage from "@/pages/PaymentPage";
import DistributorPage from "@/pages/DistributorPage";
import PartnerResourcesPage from "@/pages/PartnerResourcesPage";
import MemberPage from "@/pages/MemberPage";
import MemberOrdersPage from "@/pages/MemberOrdersPage";
import FavoritesPage from "@/pages/FavoritesPage";
import OffersPage from "@/pages/OffersPage";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import MyReferralPage from "@/pages/MyReferralPage";
import AdminHomePage from "@/pages/AdminHomePage";
import AdminSettingsPage from "@/pages/AdminSettingsPage";
import AdminSmsLogPage from "@/pages/AdminSmsLogPage";
import AdminReportsPage from "@/pages/AdminReportsPage";
import AdminCreditLogPage from "@/pages/AdminCreditLogPage";
import AdminRefundsPage from "@/pages/AdminRefundsPage";
import AdminProductsPage from "@/pages/AdminProductsPage";
import AdminOrdersPage from "@/pages/AdminOrdersPage";
import AdminMembersPage from "@/pages/AdminMembersPage";
import AdminReferralsPage from "@/pages/AdminReferralsPage";
import AdminPromotionsPage from "@/pages/AdminPromotionsPage";
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
      { path: "payment/:orderId", element: <PaymentPage /> },
      { path: "payment", element: <PaymentPage /> },
      { path: "orders", element: <MemberOrdersPage /> },
      { path: "member", element: <MemberPage /> },
      { path: "distributor", element: <DistributorPage /> },
      { path: "partner-resources", element: <PartnerResourcesPage /> },
      { path: "favorites", element: <FavoritesPage /> },
      { path: "offers", element: <OffersPage /> },
      { path: "login", element: <LoginPage /> },
      { path: "register", element: <RegisterPage /> },
      { path: "referral", element: <MyReferralPage /> },
      { path: "admin", element: <AdminHomePage /> },
      { path: "admin/products", element: <AdminProductsPage /> },
      { path: "admin/orders", element: <AdminOrdersPage /> },
      { path: "admin/members", element: <AdminMembersPage /> },
      { path: "admin/referrals", element: <AdminReferralsPage /> },
      { path: "admin/promotions", element: <AdminPromotionsPage /> },
      { path: "admin/settings", element: <AdminSettingsPage /> },
      { path: "admin/sms-log", element: <AdminSmsLogPage /> },
      { path: "admin/reports",     element: <AdminReportsPage /> },
      { path: "admin/credit-log",  element: <AdminCreditLogPage /> },
      { path: "admin/refunds",      element: <AdminRefundsPage /> },
      { path: "faq", element: <FaqPage /> },
      { path: "contact", element: <ContactPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);

export default router;
