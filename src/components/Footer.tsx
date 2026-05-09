import { Link } from "react-router";

const COLUMNS = [
  {
    heading: "Incense",
    items: [
      { label: "全部商品", href: "/product" },
      { label: "放鬆系列", href: "/product?category=放鬆" },
      { label: "冥想系列", href: "/product?category=冥想" },
      { label: "淨化系列", href: "/product?category=淨化" },
      { label: "復甦系列", href: "/product?category=復甦" },
    ],
  },
  {
    heading: "Brand",
    items: [
      { label: "品牌故事", href: "/about" },
      { label: "香誌", href: "/journal" },
      { label: "實體店面", href: "/stores" },
    ],
  },
  {
    heading: "Service",
    items: [
      { label: "常見問題", href: "/faq" },
      { label: "聯絡我們", href: "/contact" },
      { label: "登入 / 註冊", href: "/login" },
    ],
  },
];

function Footer(): JSX.Element {
  return (
    <footer className="enso-footer">
      <div className="enso-footer__inner">
        <div>
          <p className="enso-footer__brand-mark">ENSO</p>
          <p className="enso-footer__brand-kanji">京都・線香</p>
          <p className="enso-footer__tagline">
            天然手工線香品牌，致力於用香氣連結人們與內在寧靜。
            一支線香，一段呼吸，一處靜謐之地。
          </p>
        </div>

        <div className="enso-footer__columns">
          {COLUMNS.map((col) => (
            <div key={col.heading}>
              <h3 className="enso-footer__heading">{col.heading}</h3>
              <ul className="enso-footer__list">
                {col.items.map((item) => (
                  <li key={item.href}>
                    <Link to={item.href}>{item.label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="enso-footer__bottom">
        <span>© {new Date().getFullYear()} ENSO KYOTO</span>
        <span>和敬清寂 · 一期一会</span>
      </div>
    </footer>
  );
}

export default Footer;
