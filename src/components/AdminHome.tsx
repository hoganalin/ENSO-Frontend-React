// src/components/AdminHome.tsx — 後台控制台
import { useEffect, useState, type JSX } from "react";
import { Link } from "react-router";

import AdminShell from "./AdminShell";
import { getCurrentProfile } from "@/services/db/auth";
import type { ProfileRow } from "@/services/db/types";
import styles from "@/styles/Admin.module.css";

const ALLOWED_ROLES = ["admin", "support", "warehouse", "marketing", "finance"];

type MenuItem = { title: string; desc: string; path: string; icon: string; roles: string[] };

const MENU_ITEMS: MenuItem[] = [
  { title: "商品管理",   desc: "新增、編輯、上架商品",           path: "/admin/products",   icon: "◉", roles: ["admin"] },
  { title: "訂單管理",   desc: "查看及更新訂單狀態",             path: "/admin/orders",     icon: "◈", roles: ["admin","support","warehouse"] },
  { title: "會員管理",   desc: "查看及調整會員等級與角色",       path: "/admin/members",    icon: "◎", roles: ["admin"] },
  { title: "推薦人報表", desc: "查看推薦夥伴被推薦人數及消費",   path: "/admin/referrals",  icon: "◬", roles: ["admin"] },
  { title: "促銷管理",   desc: "管理折扣碼及各類優惠活動",       path: "/admin/promotions", icon: "◈", roles: ["admin","marketing"] },
  { title: "系統設定",   desc: "購物金比例等全站設定",           path: "/admin/settings",   icon: "◈", roles: ["admin"] },
  { title: "營業報表",   desc: "月營業額與購物金統計",           path: "/admin/reports",    icon: "▩", roles: ["admin","finance"] },
  { title: "購物金帳本", desc: "查看購物金發放與扣除明細",       path: "/admin/credit-log", icon: "◆", roles: ["admin","finance"] },
  { title: "退款管理",   desc: "處理訂單退款申請",               path: "/admin/refunds",    icon: "◇", roles: ["admin","finance","support"] },
  { title: "倉管出貨",   desc: "揀貨清單與確認出貨作業",         path: "/admin/warehouse",  icon: "◍", roles: ["admin","warehouse"] },
  { title: "客服中心",   desc: "訂單備註與客服紀錄管理",         path: "/admin/support",    icon: "◌", roles: ["admin","support"] },
  { title: "財務對帳",   desc: "購物金流量與推薦獎金彙總",       path: "/admin/finance",    icon: "▦", roles: ["admin","finance"] },
  { title: "簡訊記錄",   desc: "查看系統簡訊發送紀錄",           path: "/admin/sms-log",    icon: "◻", roles: ["admin","support","warehouse","marketing","finance"] },
];

const ROLE_LABEL: Record<string, string> = {
  admin:     "最高管理者",
  support:   "客服人員",
  warehouse: "倉儲人員",
  marketing: "行銷人員",
  finance:   "財務人員",
};

const ROLE_COLOR: Record<string, string> = {
  admin:     "var(--enso-gold)",
  support:   "#7ab8d4",
  warehouse: "#8abf90",
  marketing: "#c48cc0",
  finance:   "#d4a84b",
};

export default function AdminHome(): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try { const p = await getCurrentProfile(); if (active) setProfile(p); }
      catch (e) { if (active) setError(e instanceof Error ? e.message : "載入失敗"); }
      finally   { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  if (loading) return (
    <AdminShell title="控制台">
      <p className={styles.muted}>載入中…</p>
    </AdminShell>
  );
  if (error || !profile || !ALLOWED_ROLES.includes(profile.role)) return (
    <AdminShell title="控制台">
      <div className={styles.alert}>{error ?? "此頁僅限內部人員存取。"}</div>
    </AdminShell>
  );

  const visibleItems = MENU_ITEMS.filter(item => item.roles.includes(profile.role));
  const roleColor = ROLE_COLOR[profile.role] ?? "var(--enso-gold)";

  return (
    <AdminShell title="控制台">

      {/* Welcome block */}
      <div className={styles.welcomeBlock}>
        <div className={styles.welcomeGreet}>
          歡迎回來，<span className={styles.welcomeGreetName}>{profile.name ?? "管理員"}</span>
        </div>
        <div className={styles.welcomeSub}>
          <span
            className={styles.badge}
            style={{ background: `${roleColor}1a`, color: roleColor, border: `1px solid ${roleColor}55` }}
          >
            {ROLE_LABEL[profile.role] ?? profile.role}
          </span>
          <span style={{ color: "var(--fg-dim)" }}>
            {new Date().toLocaleDateString("zh-Hant", { year:"numeric", month:"long", day:"numeric" })}
          </span>
        </div>
      </div>

      {/* Menu grid */}
      <div className={styles.menuGrid}>
        {visibleItems.map(item => (
          <Link key={item.path} to={item.path} className={styles.menuCard}>
            <span className={styles.menuIcon}>{item.icon}</span>
            <span className={styles.menuLabel}>{item.title}</span>
            <span className={styles.menuDesc}>{item.desc}</span>
          </Link>
        ))}
      </div>

    </AdminShell>
  );
}
