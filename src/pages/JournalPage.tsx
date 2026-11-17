import { Link } from "react-router";
import { useEffect, useState } from "react";

import { JOURNAL } from "@/data/journal";
import { Seal, KanjiDivider } from "@/components/atoms";
import { usePageTitle } from "@/hooks/usePageTitle";
import { listPublishedJournal } from "@/services/db/journal";

export default function JournalPage(): JSX.Element {
  const [articles,setArticles]=useState<typeof JOURNAL>([]); // 預設空：DB 未發布時顯示「即將上線」，不帶入舊香道示意文
  const [error,setError]=useState(false);
  const [loading,setLoading]=useState(true);
  const [attempt,setAttempt]=useState(0);
  useEffect(()=>{
    let active=true;setLoading(true);setError(false);
    listPublishedJournal().then(rows=>{if(active)setArticles(rows);}).catch(()=>{if(active)setError(true);})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[attempt]);
  usePageTitle("香誌 · Queen Maeve");
  return (
    <div className="enso-journal">
      <header className="enso-journal__hero">
        <div className="t-eyebrow">Journal</div>
        <h1 className="enso-journal__title">
          品牌<span className="accent">日誌</span>
        </h1>
        <p className="enso-journal__sub">
          關於能量香氛、儀式感與日常靜心的點滴。
        </p>
        <KanjiDivider kanji="誌" />
      </header>

      <section className="enso-journal__grid">
        {loading && <p role="status">正在讀取最新文章…</p>}
        {error && <p role="alert">最新文章暫時無法讀取，您仍可閱讀下列香誌。<button onClick={()=>setAttempt(n=>n+1)}>重新讀取</button></p>}
        {!loading && !articles.length && <p>品牌日誌即將上線，敬請期待。</p>}
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
