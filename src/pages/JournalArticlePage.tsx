import { Link, Navigate, useParams } from "react-router";

import { JOURNAL } from "@/data/journal";
import { Seal } from "@/components/atoms";
import { usePageTitle } from "@/hooks/usePageTitle";

export default function JournalArticlePage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const article = JOURNAL.find((a) => a.id === id);
  usePageTitle(article ? `${article.title} · 香誌` : null);
  if (!article) return <Navigate to="/404" replace />;

  const related = JOURNAL.filter((a) => a.id !== article.id).slice(0, 3);

  return (
    <article className="enso-journal-article">
      <Link to="/journal" className="enso-journal-article__back">
        ← 返回香誌
      </Link>

      <header className="enso-journal-article__hero">
        <div className="t-eyebrow">{article.kicker}</div>
        <h1 className="enso-journal-article__title">{article.title}</h1>
        <div className="enso-journal-article__meta">
          <span>{article.author}</span>
          <span>·</span>
          <span>{article.date}</span>
          <span>·</span>
          <span>{article.readTime}</span>
        </div>
      </header>

      <div className="enso-journal-article__cover">
        {article.cover ? (
          <img
            src={article.cover}
            alt={article.title}
            className="enso-journal-article__cover-img"
          />
        ) : (
          <span className="enso-journal-article__cover-kanji" aria-hidden>
            {article.kanji}
          </span>
        )}
      </div>

      <div className="enso-journal-article__body">
        {article.body.map((block, i) => {
          if (block.type === "lede") return <p key={i} className="lede">{block.text}</p>;
          if (block.type === "h2") return <h2 key={i}>{block.text}</h2>;
          if (block.type === "pull") return <blockquote key={i}>{block.text}</blockquote>;
          return <p key={i}>{block.text}</p>;
        })}

        <div className="enso-journal-article__end">
          <span className="kanji">了</span>
          <span className="latin">END</span>
        </div>
      </div>

      <section className="enso-journal-article__related">
        <div className="t-eyebrow" style={{ textAlign: "center", marginBottom: 24 }}>Related</div>
        <h3 className="enso-journal-article__related-title">延伸閱讀</h3>
        <div className="enso-journal-article__related-grid">
          {related.map((a) => (
            <Link key={a.id} to={`/journal/${a.id}`} className="enso-journal-card">
              <span className="enso-journal-card__kanji" aria-hidden>{a.kanji}</span>
              <div className="enso-journal-card__body">
                <div className="enso-journal-card__kicker">{a.kicker}</div>
                <h4 className="enso-journal-card__title">{a.title}</h4>
                <div className="enso-journal-card__meta">
                  <span>{a.date}</span>
                  <span>·</span>
                  <span>{a.readTime}</span>
                </div>
              </div>
              <Seal text={a.kanji} size={32} className="enso-journal-card__seal" />
            </Link>
          ))}
        </div>
      </section>
    </article>
  );
}
