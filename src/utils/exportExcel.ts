// src/utils/exportExcel.ts — 前端匯出 .xlsx（SheetJS）
// 安裝：npm i xlsx
import * as XLSX from "xlsx";

export interface SheetSpec {
  name: string;
  rows: Record<string, string | number>[];
}

/** 產生多工作表的 Excel 並觸發下載。 */
export function exportExcel(filename: string, sheets: SheetSpec[]): void {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const worksheet = XLSX.utils.json_to_sheet(sheet.rows);
    // 工作表名稱長度上限 31 字元
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31));
  }
  XLSX.writeFile(workbook, filename);
}
