// src/components/AdminHome.tsx — 後台首頁入口
import { useEffect, useState, type JSX } from "react";
import { Link } from "react-router";

import { usePageTitle } from "@/hooks/usePageTitle";
import { getCurrentProfile } from "@/services/db/auth";
import type { ProfileRow } from "@/services/db/types";

const GOLD = "#c9a063";
const ALLOWED_ROLES = ["admin", "support", "warehouse", "marketing", "finance"];

type MenuItem = {
  title: string;
  desc: string;
  path: string;
  icon: string;
  roles: string[];
};

const MENU_ITEMS: MenuItem[] = [
  {
    title: "商品管理",
    desc: "新增、編輯、刪除商品",
    path: "/admin/products",
    icon: "📦",
    roles: ["admin"],
  },
  {
    title: "訂單管理",
    desc: "查看及更新訂單狀態",
    path: "/admin/orders",
    icon: "📋",
    roles: ["admin", "support", "warehouse"],
  },
  {
    title: "會員管理",
    desc: "查看及調整會員等級與角色",
    path: "/admin/members",
    icon: "👥",
    roles: ["admin"],
  },
  {
    title: "推薦人報表",
    desc: "查看推薦夥伴的被推薦人數及消費",
    path: "/admin/referrals",
    icon: "🔗",
    roles: ["admin"],
  },
  {
    title: "優惠活動",
    desc: "管理折扣碼及各類優惠活動",
    path: "/admin/promotions",
    icon: "🎁",
    roles: ["admin", "marketing"],
  },
  {
    title: "系統設定",
    desc: "購物金比例等全站設定",
    path: "/admin/settings",
    icon: "⚙️",
    roles: ["admin"],
  },
  {
    title: "簡訊紀錄",
    desc: "查看系統簡訊發送紀錄",
    path: "/admin/sms",
    icon: "💬",
    roles: ["admin", "support", "warehouse", "marketing", "finance"],
  },
];

const ROLE_LABEL: Record<string, string> = {
  admin: "最高管理者",
  support: "客服人員",
  warehouse: "倉儲人員",
  marketing: "行銷人員",
  finance: "財務人員",
};

export default function AdminHome(): JSX.Element {
  usePageTitle("後台管理");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const p = await getCurrentProfile();
        if (active) setProfile(p);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "載入失敗");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  if (loading) return <div className="container py-5 text-center text-muted">載入中…</div>;
  if (error) return <div className="container py-5 text-center text-danger">{error}</div>;
  if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
    return <div className="container py-5 text-center text-muted">此頁僅限內部人員存取。</div>;
  }

  const visibleItems = MENU_ITEMS.filter((item) => item.roles.includes(profile.role));

  return (
    <div className="container py-5" style={{ maxWidth: 800 }}>
      <h1 className="h3 mb-1" style={{ letterSpacing: 2 }}>後台管理</h1>
      <p className="text-muted mb-4">
        您好，{profile.name ?? "管理員"}。
        目前身份：
        <span
          className="badge ms-1"
          style={{ background: GOLD, color: "#1a1512" }}
        >
          {ROLE_LABEL[profile.role] ?? profile.role}
        </span>
      </p>

      <div className="row g-3">
        {visibleItems.map((item) => (
          <div className="col-sm-6" key={item.path}>
            <Link to={item.path} className="text-decoration-none">
              <div
                className="card h-100 border-0 shadow-sm"
                style={{ transition: "box-shadow 0.2s" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = `0 4px 18px rgba(201,160,99,0.25)`; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.boxShadow = ""; }}
              >
                <div className="card-body d-flex align-items-center gap-3 p-4">
                  <div style={{ fontSize: 36, lineHeight: 1 }}>{item.icon}</div>
                  <div>
                    <div className="fw-semibold" style={{ color: GOLD }}>{item.title}</div>
                    <div className="text-muted small">{item.desc}</div>
                  </div>
                </div>
              </div>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
