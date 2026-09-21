import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { usePageTitle } from "@/hooks/usePageTitle";
import styles from "@/styles/Admin.module.css";

interface Props { title: string; children: ReactNode }

const NAV = [
  { to: "/admin",           label: "控制台",    icon: "🏠", end: true },
  { to: "/admin/orders",    label: "訂單管理",  icon: "📦" },
  { to: "/admin/products",  label: "商品管理",  icon: "🛍" },
  { to: "/admin/members",   label: "會員管理",  icon: "👤" },
  { to: "/admin/referrals", label: "推薦管理",  icon: "🔗" },
  { to: "/admin/promotions",label: "促銷管理",  icon: "🎁" },
  { to: "/admin/settings",  label: "系統設定",  icon: "⚙️" },
  { to: "/admin/sms-log",   label: "簡訊記錄",  icon: "📱" },
  { to: "/admin/reports",  label: "營業報表",  icon: "📊" },
  { to: "/admin/credit-log", label: "購物金帳本", icon: "💰" },
  { to: "/admin/refunds",    label: "退款管理",  icon: "↩️" },
  { to: "/admin/warehouse", label: "倉管出貨",  icon: "📦" },
  { to: "/admin/support",   label: "客服中心",  icon: "🎧" },
  { to: "/admin/finance",  label: "財務對帳",  icon: "💹" },
];

export default function AdminShell({ title, children }: Props) {
  usePageTitle(`${title} — ENSO 後台`);
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarTitle}>ENSO Admin</div>
        {NAV.map(({ to, label, icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `${styles.sidebarLink}${isActive ? ` ${styles.active}` : ""}`
            }
          >
            <span className={styles.sidebarIcon}>{icon}</span>
            {label}
          </NavLink>
        ))}
      </aside>
      <div className={styles.main}>
        <div className={styles.topbar}>
          <h1 className={styles.topbarTitle}>{title}</h1>
        </div>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
