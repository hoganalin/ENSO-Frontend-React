import { Link } from "react-router";

const COLUMNS = [
  {
    heading: "商品",
    items: [
      { label: "全部商品", href: "/product" },
      { label: "能量精油", href: "/product?category=能量精油" },
      { label: "香氛噴霧", href: "/product?category=香氛噴霧" },
      { label: "能量蠟燭", href: "/product?category=能量蠟燭" },
      { label: "洗髮護髮", href: "/product?category=洗髮精" },
    ],
  },
  {
    heading: "Brand",
    items: [
      { label: "品牌故事", href: "/about" },
      { label: "常見問題", href: "/faq" },
    ],
  },
  {
    heading: "Service",
    items: [
      { label: "登入 / 註冊", href: "/login" },
      { label: "購物車", href: "/cart" },
    ],
  },
];

function Footer(): JSX.Element {
  return (
    <footer className="enso-footer">
      <div className="enso-footer__inner">
        <div>
          <p className="enso-footer__brand-mark">Queen Maeve</p>
          <p className="enso-footer__brand-kanji">王后美芙 · 能量香氛</p>
          <p className="enso-footer__tagline">
            能量香氛與植萃保養。以香氣點亮你的磁場，
            讓好運、桃花與貴人，循光而來。
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
        <span>© {new Date().getFullYear()} Queen Maeve 王后美芙</span>
        <span>當星辰為你閃耀，對的人自會循光而來</span>
      </div>
    </footer>
  );
}

export default Footer;
