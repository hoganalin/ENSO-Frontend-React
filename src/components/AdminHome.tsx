// src/components/AdminHome.tsx — 後台首頁入口
import { useEffect, useState, type JSX } from "react";
import { Link } from "react-router";

import AdminShell from "./AdminShell";
import { getCurrentProfile } from "@/services/db/auth";
import type { ProfileRow } from "@/services/db/types";
import styles from "@/styles/Admin.module.css";

const GOLD = "#c9a063";
const ALLOWED_ROLES = ["admin", "support", "warehouse", "marketing", "finance"];

type MenuItem = { title: string; desc: string; path: string; icon: string; roles: string[] };

const MENU_ITEMS: MenuItem[] = [
  { title: "商品管理",    desc: "新增、編輯、刪除商品",           path: "/admin/products",   icon: "📦", roles: ["admin"] },
  { title: "訂單管理",    desc: "查看及更新訂單狀態",             path: "/admin/orders",     icon: "📋", roles: ["admin","support","warehouse"] },
  { title: "會員管理",    desc: "查看及調整會員等級與角色",       path: "/admin/members",    icon: "👥", roles: ["admin"] },
  { title: "推薦人報表",  desc: "查看推薦夥伴的被推薦人數及消費", path: "/admin/referrals",  icon: "🔗", roles: ["admin"] },
  { title: "優惠活動",    desc: "管理折扣碼及各類優惠活動",       path: "/admin/promotions", icon: "🎁", roles: ["admin","marketing"] },
  { title: "系統設定",    desc: "購物金比例等全站設定",           path: "/admin/settings",   icon: "⚙️", roles: ["admin"] },
  { title: "營業報表",   desc: "月營業額與購物金統計",          path: "/admin/reports",   icon: "📊", roles: ["admin","finance"] },
  { title: "購物金帳本",  desc: "查看購物金發放與扣除明細",      path: "/admin/credit-log", icon: "💰", roles: ["admin","finance"] },
  { title: "退款管理",   desc: "處理訂單退款申請",              path: "/admin/refunds",   icon: "↩️", roles: ["admin","finance","support"] },
  { title: "簡訊紀錄",    desc: "查看系統簡訊發送紀錄",           path: "/admin/sms-log",    icon: "💬", roles: ["admin","support","warehouse","marketing","finance"] },
];

const ROLE_LABEL: Record<string, string> = {
  admin: "最高管理者", support: "客服人員", warehouse: "倉儲人員",
  marketing: "行銷人員", finance: "財務人員",
};

export default function AdminHome(): JSX.Element {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try { const p = await getCurrentProfile(); if (active) setProfile(p); }
      catch (e) { if (active) setError(e instanceof Error ? e.message : "載入失敗"); }
      finally { if (active) setLoading(false); }
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

  return (
    <AdminShell title="控制台">
      <p style={{ marginBottom: "2rem" }}>
        您好，{profile.name ?? "管理員"}。目前身份：
        <span className={styles.badge} style={{ background: GOLD, color: "#1a1512", marginLeft: ".5rem" }}>
          {ROLE_LABEL[profile.role] ?? profile.role}
        </span>
      </p>
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
