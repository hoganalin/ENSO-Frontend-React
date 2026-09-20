import { Link } from "react-router";
import { useEffect, useState } from "react";

import { JOURNAL } from "@/data/journal";
import { Seal, KanjiDivider } from "@/components/atoms";
import { usePageTitle } from "@/hooks/usePageTitle";
import { listPublishedJournal } from "@/services/db/journal";

export default function JournalPage(): JSX.Element {
  const [articles,setArticles]=useState(JOURNAL);
  const [error,setError]=useState(false);
  const [loading,setLoading]=useState(true);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let active=true;setLoading(true);setError(false);
    listPublishedJournal().then(rows=>{if(active)setArticles(rows);}).catch(()=>{if(active)setError(true);})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[attempt]);
  usePageTitle("香誌 · ENSO");
  return (
    <div className="enso-journal">
      <header className="enso-journal__hero">
        <div className="t-eyebrow">Journal</div>
        <h1 className="enso-journal__title">
          香の<span className="accent">読み物</span>
        </h1>
        <p className="enso-journal__sub">
          關於香道、茶室、職人之手與冥想練習——
          京都人不寫在日曆上的歲時記。
        </p>
        <KanjiDivider kanji="誌" />
      </header>

      <section className="enso-journal__grid">
        {loading && <p role="status">正在讀取最新文章…</p>}
        {error && <p role="alert">最新文章暫時無法讀取，您仍可閱讀下列香誌。<button onClick={()=>setAttempt(n=>n+1)}>重新讀取</button></p>}
        {!loading && !articles.length && <p>目前沒有已發布文章。</p>}
        {articles.map((article, i) => (
          <Link
            key={article.id}
            to={`/journal/${article.id}`}
            className="enso-journal-card"
            data-aos="fade-up"
            data-aos-delay={(i % 3) * 100}
          >
            <span className="enso-journal-card__kanji" aria-hidden>
              {article.kanji}
            </span>
            <div className="enso-journal-card__body">
              <div className="enso-journal-card__kicker">{article.kicker}</div>
              <h2 className="enso-journal-card__title">{article.title}</h2>
              <p className="enso-journal-card__excerpt">{article.excerpt}</p>
              <div className="enso-journal-card__meta">
                <span>{article.date}</span>
                <span>·</span>
                <span>{article.readTime}</span>
              </div>
            </div>
            <Seal text={article.kanji} size={40} className="enso-journal-card__seal" />
          </Link>
        ))}
      </section>
    </div>
  );
}
