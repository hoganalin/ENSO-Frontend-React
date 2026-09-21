import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { usePageTitle } from "@/hooks/usePageTitle";
import styles from "@/styles/Member.module.css";

interface MemberShellProps { title: string; children: ReactNode }
export default function MemberShell({ title, children }: MemberShellProps) {
  usePageTitle(title);
  return <section className={styles.page}>
    <h1>{title}</h1>
    <nav className={styles.nav} aria-label="會員功能">
      <NavLink to="/member" end>會員中心</NavLink><NavLink to="/orders">我的訂單</NavLink>
      <NavLink to="/favorites">收藏</NavLink><NavLink to="/offers">優惠與活動</NavLink>
      <NavLink to="/referral">我的推薦</NavLink>
    </nav>
    {children}
  </section>;
}
