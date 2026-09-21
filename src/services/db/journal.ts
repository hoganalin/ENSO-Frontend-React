import { supabase } from '@/lib/supabase';
import { JOURNAL, type JournalArticle, type JournalBlock } from '@/data/journal';

export interface JournalRow {
 id:string; title:string; kicker:string; excerpt:string; body:string; author:string;
 kanji:string; cover:string|null; read_minutes:number; published_at:string;
}
export function parseJournalBody(body:string):JournalBlock[] {
  return body.split(/\n\s*\n/).map(text=>text.trim()).filter(Boolean).map((text,index)=>{
    if(text.startsWith('## ')) return {type:'h2',text:text.slice(3)};
    if(text.startsWith('> ')) return {type:'pull',text:text.slice(2)};
    return {type:index===0 ? 'lede' : 'p',text};
  });
}
export function journalFromRow(row:JournalRow):JournalArticle {
  return {id:row.id,title:row.title,kicker:row.kicker,excerpt:row.excerpt,body:parseJournalBody(row.body),
    author:row.author,kanji:row.kanji,cover:row.cover??undefined,readTime:`${row.read_minutes} 分鐘閱讀`,
    meta:`${row.author} · ${row.read_minutes} 分鐘閱讀`,date:new Date(row.published_at).toLocaleDateString('zh-TW')};
}
const fields='id,title,kicker,excerpt,body,author,kanji,cover,read_minutes,published_at';
export async function listPublishedJournal():Promise<JournalArticle[]> {
  const {data,error}=await supabase.from('journal_articles').select(fields).eq('status','published')
    .lte('published_at',new Date().toISOString()).order('published_at',{ascending:false}).limit(100);
  if(error) throw new Error(error.message);
  return [...(data??[]).map(row=>journalFromRow(row as JournalRow)),...JOURNAL];
}
export async function getPublishedJournal(id:string):Promise<JournalArticle|null> {
  const original=JOURNAL.find(article=>article.id===id);
  if(original) return original;
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return null;
  const {data,error}=await supabase.from('journal_articles').select(fields).eq('id',id).eq('status','published')
    .lte('published_at',new Date().toISOString()).maybeSingle();
  if(error) throw new Error(error.message);
  return data ? journalFromRow(data as JournalRow) : null;
}
