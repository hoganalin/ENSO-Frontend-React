import { useEffect, useState, type ReactNode, type JSX } from "react";
import { NavLink, ScrollRestoration } from "react-router";
import { usePageTitle } from "@/hooks/usePageTitle";
import { getCurrentProfile } from "@/services/db/auth";
import type { ProfileRow } from "@/services/db/types";
import MessageToast from "@/components/MessageToast";
import styles from "@/styles/Admin.module.css";

interface Props { title: string; children: ReactNode }

const ROLE_LABEL: Record<string, string> = {
  admin:     "最高管理者",
  support:   "客服人員",
  warehouse: "倉儲人員",
  marketing: "行銷人員",
  finance:   "財務人員",
};

// Nav grouped by category
const NAV_GROUPS = [
  {
    label: "基礎管理",
    items: [
      { to: "/admin",            label: "控制台",    icon: "▦", end: true },
      { to: "/admin/orders",     label: "訂單管理",  icon: "◈" },
      { to: "/admin/products",   label: "商品管理",  icon: "◉" },
      { to: "/admin/members",    label: "會員管理",  icon: "◎" },
    ],
  },
  {
    label: "業務運營",
    items: [
      { to: "/admin/warehouse",  label: "倉管出貨",  icon: "◍" },
      { to: "/admin/support",    label: "客服中心",  icon: "◌" },
      { to: "/admin/referrals",  label: "推薦管理",  icon: "◬" },
      { to: "/admin/promotions", label: "促銷管理",  icon: "◈" },
    ],
  },
  {
    label: "報表財務",
    items: [
      { to: "/admin/reports",    label: "營業報表",  icon: "▩" },
      { to: "/admin/credit-log", label: "購物金帳本", icon: "◆" },
      { to: "/admin/refunds",    label: "退款管理",  icon: "◇" },
      { to: "/admin/finance",    label: "財務對帳",  icon: "▦" },
    ],
  },
  {
    label: "系統",
    items: [
      { to: "/admin/sms-log",    label: "簡訊記錄",  icon: "◻" },
      { to: "/admin/settings",   label: "系統設定",  icon: "◈" },
    ],
  },
];

function useDateStr() {
  const [str, setStr] = useState("");
  useEffect(() => {
    const fmt = () => {
      const now = new Date();
      const yy  = now.getFullYear();
      const mm  = String(now.getMonth() + 1).padStart(2, "0");
      const dd  = String(now.getDate()).padStart(2, "0");
      const wds = ["日","一","二","三","四","五","六"];
      setStr(`${yy} / ${mm} / ${dd}  週${wds[now.getDay()]}`);
    };
    fmt();
    const id = setInterval(fmt, 60_000);
    return () => clearInterval(id);
  }, []);
  return str;
}

export default function AdminShell({ title, children }: Props): JSX.Element {
  const dateStr = useDateStr();
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  usePageTitle(`${title} — ENSO 後台`);

  useEffect(() => {
    getCurrentProfile().then(setProfile).catch(() => null);
  }, []);

  const initials = profile?.name ? profile.name.slice(0, 1) : "A";

  return (
    <>
      <ScrollRestoration />
      <MessageToast />
      <div className={styles.shell}>
        {/* ── Sidebar ─────────────────────────────────────── */}
        <aside className={styles.sidebar}>

          {/* Brand / logo area */}
          <div className={styles.sidebarBrand}>
            <div className={styles.sidebarKanji}>禪</div>
            <div className={styles.sidebarLogo}>
              <span className={styles.sidebarLogoAccent}>ENSO</span>
              {" "}ADMIN
            </div>
          </div>

          {/* Nav groups */}
          <nav className={styles.sidebarNav}>
            {NAV_GROUPS.map(group => (
              <div key={group.label} className={styles.navGroup}>
                <span className={styles.navGroupLabel}>{group.label}</span>
                {group.items.map(({ to, label, icon, end }) => (
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
              </div>
            ))}
          </nav>

          {/* User info at bottom */}
          <div className={styles.sidebarFooter}>
            <div className={styles.sidebarUser}>
              <div className={styles.sidebarAvatar}>{initials}</div>
              <div className={styles.sidebarUserInfo}>
                <div className={styles.sidebarUserName}>{profile?.name ?? "管理員"}</div>
                <div className={styles.sidebarUserRole}>
                  {ROLE_LABEL[profile?.role ?? ""] ?? profile?.role ?? "—"}
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* ── Main ────────────────────────────────────────── */}
        <div className={styles.main}>
          <div className={styles.topbar}>
            <h1 className={styles.topbarTitle}>{title}</h1>
            <div className={styles.topbarMeta}>
              <div className={styles.topbarDate}>{dateStr}</div>
            </div>
          </div>
          <div className={styles.content}>{children}</div>
        </div>
      </div>
    </>
  );
}
