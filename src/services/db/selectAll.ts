// src/services/db/selectAll.ts — 分頁撈回「全部」符合條件的列。
// 背景:PostgREST 單次查詢預設最多回 1000 列,超過會「悄悄截斷」,
// 導致後台財務/報表的前端彙總在資料破千後默默低估(見體檢報告 P1)。
// 用法:傳入一個「每次呼叫都回傳全新、已下好篩選」的 query builder 工廠,
// 本函式負責用 range 一頁一頁(每頁 1000)撈到沒有為止。
// 注意:請在 builder 內加上穩定排序(例如 .order("created_at")),翻頁才不會漏/重。

const PAGE = 1000;

// builder 型別以寬鬆介面描述,只要求有 range 方法(避免綁死 PostgREST 泛型)。
interface Rangeable<T> {
  range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>;
}

export async function selectAll<T>(buildQuery: () => Rangeable<T>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}
