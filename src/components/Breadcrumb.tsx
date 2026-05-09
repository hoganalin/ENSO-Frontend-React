import { Link } from "react-router";
import { useLocation } from "react-router";

const Breadcrumb = (): JSX.Element | null => {
  const { pathname } = useLocation() || "/";

  const rawPathnames = pathname.split("/").filter((x) => x);
  const pathnames = rawPathnames.filter(
    (_, index) =>
      !(index > 0 && rawPathnames[index - 1] === "checkout-success"),
  );

  const breadcrumbMap: Record<string, string> = {
    product: "所有產品",
    cart: "購物車",
    checkout: "結帳流程",
    "checkout-success": "訂單完成",
    about: "關於我們",
    faq: "常見問題",
    contact: "聯絡我們",
    login: "會員登入",
    register: "會員註冊",
  };

  if (pathname === "/") return null;

  return (
    <nav
      aria-label="breadcrumb"
      className=" max-w-[1180px] mx-auto px-4 py-4 mt-4"
    >
      <ol className="flex items-center text-sm list-none">
        <li className="flex items-center">
          <Link
            className="text-gray-800 no-underline hover:text-enso-gold"
            to="/"
          >
            首頁
          </Link>
        </li>
        {pathnames.map((value, index) => {
          const last = index === pathnames.length - 1;
          const to = `/${pathnames.slice(0, index + 1).join("/")}`;
          let label = breadcrumbMap[value] || value;
          if (index > 0 && pathnames[index - 1] === "product") {
            label = "產品詳情";
          }

          return last ? (
            <li
              className="flex items-center before:content-['/'] before:px-2.5 before:text-gray-300 text-enso-gold font-medium"
              aria-current="page"
              key={to}
            >
              {label}
            </li>
          ) : (
            <li
              className="flex items-center before:content-['/'] before:px-2.5 before:text-gray-300"
              key={to}
            >
              <Link
                className="text-gray-800 no-underline hover:text-enso-gold"
                to={to}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default Breadcrumb;
