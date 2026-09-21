import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Link } from "react-router";
import { useNavigate, useLocation } from "react-router";
import { RotatingLines } from "react-loader-spinner";
import Swal from "sweetalert2";

import type { RootState, AppDispatch } from "../store/store";
import { logout as logoutAction } from "../slice/authSlice";
import { createAsyncGetCart } from "../slice/cartSlice";

const NAV_ITEMS = [
  { href: "/", label: "本店", sub: "ほんてん", kanji: "本" },
  { href: "/product", label: "線香", sub: "せんこう", kanji: "香" },
  { href: "/offers", label: "活動", sub: "お知らせ", kanji: "禮" },
  { href: "/journal", label: "香誌", sub: "こうし", kanji: "誌" },
  { href: "/stores", label: "店舖", sub: "てんぽ", kanji: "店" },
  { href: "/about", label: "品牌", sub: "ぶらんど", kanji: "縁" },
];

function Header(): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchItem, setSearchItem] = useState("");
  const [navLoadingLabel, setNavLoadingLabel] = useState<string | null>(null);

  const dispatch = useDispatch<AppDispatch>();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const carts = useSelector((state: RootState) => state.cart.carts);
  const isLoggedIn = useSelector(
    (state: RootState) => state.auth.isAuthenticated,
  );
  const cartTotalQty =
    carts?.reduce((acc, curr) => acc + (curr.qty || 0), 0) || 0;

  useEffect(() => {
    dispatch(createAsyncGetCart());
  }, [dispatch]);

  useEffect(() => {
    setNavLoadingLabel(null);
    setMenuOpen(false);
  }, [pathname]);

  const handleLogout = (): void => {
    Swal.fire({
      title: "確定要登出嗎？",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#c9a063",
      cancelButtonColor: "#a83a2c",
      confirmButtonText: "確定登出",
      cancelButtonText: "取消",
    }).then((result) => {
      if (result.isConfirmed) {
        document.cookie =
          "hexToken=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
        localStorage.removeItem("auth");
        dispatch(logoutAction());
        Swal.fire({
          title: "已成功登出",
          icon: "success",
          timer: 1500,
          showConfirmButton: false,
        });
        navigate("/");
      }
    });
  };

  const handleSearch = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (searchItem.trim()) {
      navigate(`/product?search=${searchItem.trim()}`);
      setSearchItem("");
    }
  };

  return (
    <>
      {navLoadingLabel && (
        <div
          className="enso-nav-loader"
          role="status"
          aria-live="polite"
          aria-label={navLoadingLabel}
        >
          <RotatingLines
            strokeColor="#c9a063"
            strokeWidth="4"
            animationDuration="0.75"
            width="56"
            visible={true}
          />
          <p className="mt-3 mb-0">{navLoadingLabel}</p>
        </div>
      )}

      <header className="enso-header">
        <div className="enso-header__inner">
          <Link className="enso-header__brand" to="/" aria-label="ENSO Home">
            <svg
              className="enso-header__brand-circle"
              viewBox="0 0 40 40"
              aria-hidden
            >
              <path
                d="M20 4 A16 16 0 1 1 6.5 28"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span className="enso-header__brand-text">
              <span className="enso-header__brand-mark">ENSO</span>
              <span className="enso-header__brand-sub">圓相 · 香</span>
            </span>
          </Link>

          <nav className="enso-header__nav" aria-label="Primary">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`enso-header__nav-link ${active ? "is-active" : ""}`}
                  onClick={() => setNavLoadingLabel(`前往 ${item.label}…`)}
                >
                  <span className="enso-header__nav-label">{item.label}</span>
                  <span className="enso-header__nav-sub">{item.sub}</span>
                </Link>
              );
            })}
          </nav>

          <div className="enso-header__actions">
            <details className="enso-header__search-pop">
              <summary aria-label="Open search">
                <i className="fa-solid fa-magnifying-glass" />
              </summary>
              <form role="search" onSubmit={handleSearch}>
                <input
                  type="search"
                  placeholder="搜尋..."
                  aria-label="Search items"
                  value={searchItem}
                  onChange={(e) => setSearchItem(e.target.value)}
                />
                <button type="submit" aria-label="Submit search">
                  <i className="fa-solid fa-arrow-right" />
                </button>
              </form>
            </details>

            {isLoggedIn && <Link to="/member" className="enso-header__icon-btn" aria-label="會員中心"
              onClick={() => setNavLoadingLabel("前往會員中心…")}>
              <i className="bi bi-person-circle" /><span className="label">會員</span>
            </Link>}
            {isLoggedIn ? (
              <button
                type="button"
                className="enso-header__icon-btn"
                onClick={handleLogout}
                aria-label="Logout"
              >
                <i className="fa-solid fa-right-from-bracket" />
                <span className="label">登出</span>
              </button>
            ) : (
              <Link
                to="/login"
                className="enso-header__icon-btn"
                aria-label="Login"
                onClick={() => setNavLoadingLabel("前往登入頁…")}
              >
                <i className="fa-regular fa-user" />
                <span className="label">登入</span>
              </Link>
            )}

            <Link
              to="/cart"
              className="enso-header__icon-btn"
              aria-label={`View shopping cart, ${cartTotalQty} items`}
              onClick={() => setNavLoadingLabel("前往購物車…")}
            >
              <i className="fa-solid fa-cart-shopping" />
              <span className="label">籠 · {cartTotalQty}</span>
            </Link>

            <button
              type="button"
              className="enso-header__menu-btn"
              aria-label="Toggle navigation"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <i className={`bi ${menuOpen ? "bi-x" : "bi-list"}`} />
            </button>
          </div>
        </div>

        <div className={`enso-header__mobile ${menuOpen ? "is-open" : ""}`}>
          <nav className="enso-header__nav" aria-label="Mobile">
            {NAV_ITEMS.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={`enso-header__nav-link ${active ? "is-active" : ""}`}
                  onClick={() => setNavLoadingLabel(`前往 ${item.label}…`)}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
    </>
  );
}

export default Header;
